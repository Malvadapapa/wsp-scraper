/**
 * Script ejecutable: descarga datos del sheet → combina con clasificaciones → genera dashboard.
 * Uso: npm run analytics
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { config } from '../core/config';
import { logger } from '../core/logger';
import {
  Classification,
  enrichRecords,
  countBy,
  sortedEntries,
  hourDistribution,
} from './analyzer';
import { writeDashboard } from './dashboardWriter';

async function main(): Promise<void> {
  logger.info('📊 Iniciando pipeline de analytics...');

  // 1. Descargar datos de la hoja
  const creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.GOOGLE_SPREADSHEET_ID,
    range: `${config.GOOGLE_SHEET_NAME}!A1:E200`,
  });

  const sheetRows = res.data.values ?? [];
  logger.info(`📥 ${sheetRows.length - 1} filas descargadas de Google Sheets.`);

  // 2. Cargar clasificaciones
  const classPath = path.resolve(process.cwd(), 'data/classifications.json');
  const classifications: Classification[] = JSON.parse(
    fs.readFileSync(classPath, 'utf-8')
  );
  logger.info(`🏷️  ${classifications.length} clasificaciones cargadas.`);

  // 3. Enriquecer registros con país y hora
  const enriched = enrichRecords(sheetRows, classifications);

  // 4. Calcular agregaciones
  const areaCounts = sortedEntries(countBy(enriched, 'area'));
  const countryCounts = sortedEntries(countBy(enriched, 'pais'));
  const hourDist = hourDistribution(enriched);
  const busquedaCounts = sortedEntries(countBy(enriched, 'busqueda_laboral'));
  const presentacionCounts = sortedEntries(
    countBy(enriched, 'tiene_presentacion')
  );

  logger.info('🔢 Agregaciones calculadas:');
  logger.info(`   Áreas: ${areaCounts.map(([a, c]) => `${a}(${c})`).join(', ')}`);
  logger.info(`   Países: ${countryCounts.map(([p, c]) => `${p}(${c})`).join(', ')}`);

  // 5. Escribir dashboard
  await writeDashboard({
    areaCounts,
    countryCounts,
    hourDist,
    busquedaCounts,
    presentacionCounts,
    totalRecords: enriched.length,
  });

  logger.info('🎉 Pipeline de analytics completado.');
}

main().catch((err) => {
  logger.error('❌ Error en analytics: ' + err.message);
  process.exit(1);
});
