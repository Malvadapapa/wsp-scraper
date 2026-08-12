import fs from 'fs';
import path from 'path';
import { logger } from '../core/logger';
import { SheetsWriter } from '../core/sheetsWriter';
import { LinkedInRecord, QueueItem } from '../types';

export class QueueProcessor {
  private queueFilePath: string;
  private isProcessing = false;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.queueFilePath = path.join(dataDir, 'queue.jsonl');
  }

  /**
   * Agrega un nuevo registro a la cola local en estado 'pending'.
   */
  public async enqueue(record: LinkedInRecord): Promise<void> {
    const item: QueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      record,
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    };

    const line = JSON.stringify(item) + '\n';
    await fs.promises.appendFile(this.queueFilePath, line, 'utf-8');
    logger.debug(`📥 Registro encolado localmente: ID ${item.id} (${record.senderIdentifier})`);
  }

  /**
   * Lee todos los elementos de la cola desde el archivo local.
   */
  private async readQueue(): Promise<QueueItem[]> {
    if (!fs.existsSync(this.queueFilePath)) {
      return [];
    }

    const content = await fs.promises.readFile(this.queueFilePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => JSON.parse(line) as QueueItem);
  }

  /**
   * Sobrescribe la cola local con el nuevo estado de los elementos.
   */
  private async writeQueue(items: QueueItem[]): Promise<void> {
    const content = items.map(item => JSON.stringify(item)).join('\n') + (items.length > 0 ? '\n' : '');
    await fs.promises.writeFile(this.queueFilePath, content, 'utf-8');
  }

  /**
   * Procesa los elementos pendientes de la cola escribiéndolos en Google Sheets.
   */
  public async processQueue(writer: SheetsWriter): Promise<void> {
    if (this.isProcessing) {
      logger.debug('⏳ El procesador de cola ya está ejecutándose. Saltando...');
      return;
    }

    const items = await this.readQueue();
    const pendingOrFailed = items.filter(item => item.status === 'pending' || item.status === 'failed');

    if (pendingOrFailed.length === 0) {
      return;
    }

    this.isProcessing = true;
    logger.info(`🔄 Procesando cola local: ${pendingOrFailed.length} elementos pendientes...`);

    let updatedAny = false;

    for (const item of items) {
      if (item.status === 'pending' || item.status === 'failed') {
        try {
          item.attempts++;
          // Intentar escribir en Google Sheets
          await writer.upsertRecord(item.record);
          item.status = 'processed';
          delete item.lastError;
          updatedAny = true;
          logger.info(`✅ Elemento de cola procesado y subido: ID ${item.id}`);
        } catch (error: any) {
          item.status = 'failed';
          item.lastError = error.message;
          updatedAny = true;
          logger.error(`❌ Error al procesar elemento ${item.id} en Sheets (Intento ${item.attempts}): ${error.message}`);
        }
      }
    }

    if (updatedAny) {
      await this.writeQueue(items);
    }
    
    this.isProcessing = false;
  }
}
