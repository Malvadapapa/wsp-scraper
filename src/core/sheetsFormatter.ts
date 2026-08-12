import { sheets_v4 } from 'googleapis';
import { logger } from './logger';

/**
 * Asegura que la hoja de cálculo tenga los encabezados correctos y un formato estético premium.
 * 
 * @param sheets Cliente de Google Sheets
 * @param spreadsheetId ID de la hoja de cálculo
 * @param sheetName Nombre de la pestaña
 */
export async function ensureSheetFormat(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  try {
    // Obtener metadatos de la hoja para recuperar el sheetId numérico
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = metadata.data.sheets?.find(s => s.properties?.title === sheetName);
    const sheetId = sheet?.properties?.sheetId ?? 0;

    const baseRequests: sheets_v4.Schema$Request[] = [
      // 1. Congelar la primera fila
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
      // 2. Altura de la fila de cabecera (40px)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 40 },
          fields: 'pixelSize',
        },
      },
      // 3. Ancho de columnas (Col A: 150px, B: 180px, C: 180px, D: 300px, E: 450px)
      ...[150, 180, 180, 300, 450].map((width, idx) => ({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
          properties: { pixelSize: width },
          fields: 'pixelSize',
        },
      })),
      // 4. Formato de celda de la cabecera (Fondo azul marino oscuro #1A365D, texto blanco en negrita, centrado)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 26 / 255, green: 54 / 255, blue: 93 / 255 },
              textFormat: { foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 }, bold: true, fontSize: 11 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      },
      // 5. Ajustar texto (wrap) y alineación superior para la columna E (Mensaje completo)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
          cell: {
            userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' },
          },
          fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
        },
      },
    ];

    // Aplicar estilos estructurales
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: baseRequests },
    });
    logger.info('🎨 Formato estético base aplicado correctamente a la planilla.');

    // Intentar aplicar colores de fila alternados (zebra striping).
    // Si ya existe un intervalo con bandas, se ignora el error de solapamiento para no detener la ejecución.
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addBanding: {
                bandedRange: {
                  range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
                  rowProperties: {
                    firstBandColor: { red: 1.0, green: 1.0, blue: 1.0 },
                    secondBandColor: { red: 247 / 255, green: 250 / 255, blue: 252 / 255 }, // #F7FAFC
                  },
                },
              },
            },
          ],
        },
      });
      logger.info('🏁 Zebra striping (filas alternadas) aplicado a la planilla.');
    } catch (bandingErr: any) {
      logger.debug('No se pudo aplicar banding (posiblemente ya existe): ' + bandingErr.message);
    }
  } catch (err: any) {
    logger.warn('No se pudo aplicar el formateo de diseño a la hoja: ' + err.message);
  }
}
