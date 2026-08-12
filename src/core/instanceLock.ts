import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const LOCK_FILE = path.resolve(process.cwd(), 'bot.lock');

/**
 * Intenta adquirir el bloqueo de instancia unica.
 * Si ya hay otra instancia corriendo, termina el proceso inmediatamente.
 */
export function acquireInstanceLock(): void {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const pidStr = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      const pid = parseInt(pidStr, 10);

      if (!isNaN(pid)) {
        try {
          // Verificar si el proceso con el PID del lockfile sigue activo
          process.kill(pid, 0);
          logger.error(`Error: Ya hay otra instancia del bot corriendo con el PID: ${pid}. Saliendo para evitar conflictos.`);
          process.exit(1);
        } catch (err: any) {
          // Si lanza error, significa que el proceso ya no existe (lockfile huerfano)
          logger.warn(`Detectado lockfile huerfano con PID ${pid} (el proceso ya no existe). Limpiando lockfile...`);
          releaseInstanceLock();
        }
      }
    } catch (err: any) {
      logger.warn(`No se pudo leer el lockfile existente: ${err.message}. Intentando continuar...`);
    }
  }

  // Escribir el PID del proceso actual en el lockfile
  try {
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), 'utf-8');
    logger.info(`Adquirido bloqueo de instancia unica (PID: ${process.pid})`);
  } catch (err: any) {
    logger.error(`Error critico al escribir el lockfile: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Libera el bloqueo de instancia unica eliminando el archivo lock.
 */
export function releaseInstanceLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      logger.info('Bloqueo de instancia unica liberado.');
    }
  } catch (err: any) {
    logger.error(`Error al liberar el lockfile: ${err.message}`);
  }
}
