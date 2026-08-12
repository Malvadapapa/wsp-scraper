import { parseWhatsAppExport } from './parseExport';
import { extractLinkedIn } from '../core/linkedinExtractor';
import { SheetsWriter } from '../core/sheetsWriter';
import { LinkedInRecord } from '../types';
import { logger } from '../core/logger';
import { config } from '../core/config';

async function main() {
  logger.info('🚀 Iniciando script de importación histórica...');

  // Parsear argumentos de línea de comandos: buscar '--file <ruta>'
  const fileArgIdx = process.argv.indexOf('--file');
  let filePath = 'chat.txt'; // Archivo por defecto

  if (fileArgIdx !== -1 && process.argv[fileArgIdx + 1]) {
    filePath = process.argv[fileArgIdx + 1];
  }

  logger.info(`📂 Leyendo historial desde: ${filePath}`);

  try {
    // 1. Parsear los mensajes del archivo txt
    const parsedMessages = await parseWhatsAppExport(filePath, config.DATE_FORMAT);
    
    // 2. Extraer mensajes que contienen enlaces de LinkedIn
    const records: LinkedInRecord[] = [];
    
    for (const msg of parsedMessages) {
      const extraction = extractLinkedIn(msg.text);
      if (extraction) {
        records.push({
          timestamp: msg.timestampStr,
          senderIdentifier: msg.senderRaw,
          whatsappName: msg.senderRaw, // En el histórico .txt, el remitente crudo se usa para ambos campos
          linkedinUrl: extraction.normalizedUrl,
          fullText: msg.text,
        });
      }
    }

    logger.info(`🔍 Se encontraron ${records.length} mensajes con enlaces de LinkedIn.`);

    if (records.length === 0) {
      logger.info('⚠️ No hay registros de LinkedIn para importar. Finalizando.');
      return;
    }

    // 3. Inicializar el escritor de Sheets y realizar upsert masivo
    const writer = new SheetsWriter();
    await writer.initialize();
    await writer.upsertRecordsBatch(records);

    logger.info('🎉 Proceso de importación histórica finalizado con éxito.');
  } catch (error: any) {
    logger.error(`❌ Error durante la importación histórica: ${error.message}`);
    process.exit(1);
  }
}

main();
