import fs from 'fs';
import { google, sheets_v4 } from 'googleapis';
import { config } from './config';
import { logger } from './logger';
import { ensureSheetFormat } from './sheetsFormatter';
import { LinkedInRecord } from '../types';

/**
 * Escapa caracteres que Google Sheets interpreta como formulas para evitar errores #ERROR!.
 */
function escapeGoogleSheetsFormula(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('-') || trimmed.startsWith('@')) {
    return `'${value}`;
  }
  return value;
}

/**
 * Helper genérico para reintentar operaciones con backoff exponencial.
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 1000): Promise<T> {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.status || error.code || (error.response && error.response.status);
      const isRateLimit = status === 429;
      const isServerError = status >= 500 && status < 600;

      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        logger.warn(`⚠️ Error de Google Sheets API (${status}). Reintentando intento ${attempt}/${maxRetries} en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Reintentos de Google Sheets API fallidos.');
}

export class SheetsWriter {
  private sheets!: sheets_v4.Sheets;
  private rowMap = new Map<string, number>(); // sender -> rowNumber
  private nextRowNumber = 2;

  constructor() {
    this.initClient();
  }

  /**
   * Inicializa el cliente de Google Sheets con la cuenta de servicio.
   */
  private initClient() {
    const creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.JWT(
      creds.client_email,
      undefined,
      creds.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  /**
   * Inicializa la estructura de la hoja de cálculo y carga el mapeo de filas en memoria.
   */
  public async initialize(): Promise<void> {
    await retryWithBackoff(async () => {
      // 1. Validar si la cabecera existe
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
        range: `${config.GOOGLE_SHEET_NAME}!A1:E1`,
      });

      const values = response.data.values;
      if (!values || values.length === 0) {
        logger.info('📝 La hoja de cálculo está vacía. Escribiendo cabeceras...');
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
          range: `${config.GOOGLE_SHEET_NAME}!A1:E1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['Fecha y hora', 'Teléfono/Usuario', 'Nombre WhatsApp', 'Enlace a LinkedIn', 'Mensaje completo']],
          },
        });
      }

      // Asegurar el formato UX/UI estético
      await ensureSheetFormat(this.sheets, config.GOOGLE_SPREADSHEET_ID, config.GOOGLE_SHEET_NAME);

      // 2. Cargar el mapeo de registros existentes en memoria
      await this.loadRowMap();
    });
  }

  /**
   * Lee la hoja de cálculo y mapea los enlaces de LinkedIn actuales a sus índices de fila.
   */
  private async loadRowMap(): Promise<void> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
      range: `${config.GOOGLE_SHEET_NAME}!D:D`,
    });

    const rows = response.data.values;
    this.rowMap.clear();

    if (rows && rows.length > 0) {
      for (let i = 1; i < rows.length; i++) {
        const linkedinUrl = rows[i]?.[0];
        if (linkedinUrl) {
          this.rowMap.set(linkedinUrl.toString().trim(), i + 1);
        }
      }
      this.nextRowNumber = rows.length + 1;
    } else {
      this.nextRowNumber = 2;
    }
    logger.info(`📋 Mapeo cargado en memoria: ${this.rowMap.size} enlaces de LinkedIn. Siguiente fila libre: ${this.nextRowNumber}`);
  }

  /**
   * Realiza el upsert de un único registro en tiempo real.
   */
  public async upsertRecord(record: LinkedInRecord): Promise<void> {
    const linkedin = record.linkedinUrl.trim();
    const rowNum = this.rowMap.get(linkedin);

    const values = [[
      record.timestamp,
      escapeGoogleSheetsFormula(record.senderIdentifier),
      escapeGoogleSheetsFormula(record.whatsappName),
      record.linkedinUrl,
      escapeGoogleSheetsFormula(record.fullText)
    ]];

    if (rowNum) {
      logger.info(`✍️ Actualizando registro existente para el LinkedIn [${linkedin}] en la fila ${rowNum}...`);
      await retryWithBackoff(() => this.sheets.spreadsheets.values.update({
        spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
        range: `${config.GOOGLE_SHEET_NAME}!A${rowNum}:E${rowNum}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      }));
    } else {
      const targetRow = this.nextRowNumber;
      logger.info(`➕ Insertando nuevo registro para el LinkedIn [${linkedin}] en la fila ${targetRow}...`);
      await retryWithBackoff(() => this.sheets.spreadsheets.values.update({
        spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
        range: `${config.GOOGLE_SHEET_NAME}!A${targetRow}:E${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      }));
      this.rowMap.set(linkedin, targetRow);
      this.nextRowNumber++;
    }
  }

  /**
   * Inserta o actualiza un lote de registros agrupando celdas contiguas para optimizar cuota de API.
   */
  public async upsertRecordsBatch(records: LinkedInRecord[]): Promise<void> {
    if (records.length === 0) return;

    logger.info(`📦 Procesando upsert masivo en memoria para ${records.length} registros...`);
    const rowValuesMap = new Map<number, any[]>();

    for (const record of records) {
      const linkedin = record.linkedinUrl.trim();
      let rowNum = this.rowMap.get(linkedin);
      if (!rowNum) {
        rowNum = this.nextRowNumber++;
        this.rowMap.set(linkedin, rowNum);
      }
      rowValuesMap.set(rowNum, [
        record.timestamp,
        escapeGoogleSheetsFormula(record.senderIdentifier),
        escapeGoogleSheetsFormula(record.whatsappName),
        record.linkedinUrl,
        escapeGoogleSheetsFormula(record.fullText)
      ]);
    }

    const dataToUpdate: sheets_v4.Schema$ValueRange[] = [];
    const sortedRows = Array.from(rowValuesMap.keys()).sort((a, b) => a - b);

    let currentRangeStart = -1;
    let currentRangeValues: any[][] = [];

    for (const rowNum of sortedRows) {
      const vals = rowValuesMap.get(rowNum)!;

      if (currentRangeStart === -1) {
        currentRangeStart = rowNum;
        currentRangeValues = [vals];
      } else if (rowNum === currentRangeStart + currentRangeValues.length) {
        currentRangeValues.push(vals);
      } else {
        const endRow = currentRangeStart + currentRangeValues.length - 1;
        dataToUpdate.push({
          range: `${config.GOOGLE_SHEET_NAME}!A${currentRangeStart}:E${endRow}`,
          values: currentRangeValues
        });
        currentRangeStart = rowNum;
        currentRangeValues = [vals];
      }
    }

    if (currentRangeStart !== -1) {
      const endRow = currentRangeStart + currentRangeValues.length - 1;
      dataToUpdate.push({
        range: `${config.GOOGLE_SHEET_NAME}!A${currentRangeStart}:E${endRow}`,
        values: currentRangeValues
      });
    }

    logger.info(`🚀 Enviando ${dataToUpdate.length} bloques de escritura agrupados a Google Sheets...`);
    await retryWithBackoff(() => this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: dataToUpdate,
      },
    }));
    logger.info('✅ Upsert masivo completado con éxito.');
  }
}
