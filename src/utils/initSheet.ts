import { SheetsWriter } from '../core/sheetsWriter';
import { logger } from '../core/logger';

async function main() {
  logger.info('🎨 Inicializando y formateando la hoja de Google Sheets...');

  try {
    const writer = new SheetsWriter();
    await writer.initialize();
    logger.info('✅ ¡La hoja de Google Sheets ha sido inicializada y formateada con éxito!');
    logger.info('Abre tu navegador para ver el resultado.');
  } catch (error: any) {
    logger.error(`❌ Error al inicializar la hoja de cálculo: ${error.message}`);
    process.exit(1);
  }
}

main();
