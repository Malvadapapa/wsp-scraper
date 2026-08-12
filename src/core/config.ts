import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Cargar variables de entorno
dotenv.config();

const configSchema = z.object({
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1, 'GOOGLE_SERVICE_ACCOUNT_JSON es obligatorio'),
  GOOGLE_SPREADSHEET_ID: z.string().min(1, 'GOOGLE_SPREADSHEET_ID es obligatorio'),
  GOOGLE_SHEET_NAME: z.string().default('Hoja 1'),
  DATE_FORMAT: z.string().default('D/M/YYYY'),
  TZ: z.string().default('America/Argentina/Cordoba'),
  TARGET_GROUP_JID: z.string().optional(),
  TEST_GROUP_JID: z.string().optional(),
  OFFICIAL_GROUP_JID: z.string().optional(),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error de configuración: Variables de entorno faltantes o inválidas.');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
