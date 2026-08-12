import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { config } from '../core/config';

const SPREADSHEET_ID = config.GOOGLE_SPREADSHEET_ID;
const RANGE = 'Hoja 1!A1:E200';

async function main() {
  const creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values || [];
  console.log(`Filas descargadas: ${rows.length}`);

  const outPath = path.resolve(process.cwd(), 'data/dataset.json');
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`Dataset guardado en: ${outPath}`);

  // Primeras 5 filas
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    console.log(`[${i}]`, JSON.stringify(rows[i]));
  }
}

main().catch(console.error);
