import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const CONTACTS_FILE = path.resolve(process.cwd(), 'data/contacts.json');

const cache = new Map<string, string>();

/**
 * Carga la cache de contactos desde el archivo local.
 */
export function loadContactsCache(): void {
  try {
    const dir = path.dirname(CONTACTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(CONTACTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8'));
      cache.clear();
      for (const [jid, name] of Object.entries(data)) {
        cache.set(jid, name as string);
      }
      logger.info(`👤 Cargados ${cache.size} contactos de la cache local.`);
    }
  } catch (err: any) {
    logger.warn(`No se pudo cargar la cache de contactos: ${err.message}`);
  }
}

/**
 * Guarda la cache de contactos en el archivo local.
 */
export function saveContactsCache(): void {
  try {
    const data: Record<string, string> = {};
    for (const [jid, name] of cache.entries()) {
      data[jid] = name;
    }
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err: any) {
    logger.warn(`No se pudo guardar la cache de contactos: ${err.message}`);
  }
}

/**
 * Normaliza una JID para buscarla en la cache.
 */
function normalizeJidKey(jid: string): string {
  const phone = jid.split('@')[0];
  return phone.replace(/[\s\-\(\)\+]/g, '');
}

/**
 * Obtiene el nombre guardado de un contacto.
 */
export function getContactName(jid: string): string | undefined {
  if (cache.size === 0) {
    loadContactsCache();
  }
  const key = normalizeJidKey(jid);
  return cache.get(key);
}

/**
 * Agrega un contacto a la cache.
 */
export function addContactToCache(jid: string, name: string): void {
  if (!name || name.trim() === '') return;

  const cleanName = name.trim();
  // Evitar guardar si el nombre es solo un numero
  if (/^[\+\d\s\-\(\)]+$/.test(cleanName)) return;

  const key = normalizeJidKey(jid);
  const existing = cache.get(key);

  if (existing !== cleanName) {
    cache.set(key, cleanName);
    saveContactsCache();
  }
}
