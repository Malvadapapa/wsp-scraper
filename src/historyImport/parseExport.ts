import fs from 'fs';
import readline from 'readline';
import { logger } from '../core/logger';

export interface ParsedMessage {
  date: Date;
  timestampStr: string;
  senderRaw: string;
  text: string;
}

/**
 * Formatea un objeto Date en formato YYYY-MM-DD HH:mm:ss para Google Sheets.
 */
export function formatSheetsDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

/**
 * Parsea un timestamp de WhatsApp (ej: "11/8/2026, 10:12 a. m.") a un objeto Date.
 */
export function parseWhatsAppDate(datePart: string, timePart: string, dateFormat = 'D/M/YYYY'): Date | null {
  const dateMatch = datePart.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!dateMatch) return null;

  let [_, first, second, yearStr] = dateMatch;
  let day = parseInt(first, 10);
  let month = parseInt(second, 10);
  const year = parseInt(yearStr, 10);

  if (dateFormat === 'M/D/YYYY') {
    day = parseInt(second, 10);
    month = parseInt(first, 10);
  }

  // Limpiar puntos y espacios (ej. "a. m." -> "am")
  const cleanTime = timePart.replace(/\./g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const timeMatch = cleanTime.match(/^(\d{1,2}):(\d{2})\s*(am|pm|a\s*m|p\s*m)?$/i);
  if (!timeMatch) return null;

  const [__, hourStr, minStr, ampm] = timeMatch;
  let hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  if (ampm) {
    const isPm = ampm.replace(/\s/g, '') === 'pm';
    if (isPm && hour < 12) {
      hour += 12;
    } else if (!isPm && hour === 12) {
      hour = 0;
    }
  }

  return new Date(year, month - 1, day, hour, minute);
}

/**
 * Parsea el archivo de exportación de WhatsApp línea por línea.
 */
export async function parseWhatsAppExport(filePath: string, dateFormat = 'D/M/YYYY'): Promise<ParsedMessage[]> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`El archivo de historial no existe en la ruta: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const parsedMessages: ParsedMessage[] = [];
  let currentMsg: { date: Date; senderRaw: string; textLines: string[] } | null = null;

  // Expresión regular para detectar la cabecera de un mensaje nuevo: "D/M/YYYY, H:MM a.m. - "
  const messageHeaderRegex = /^(\d{1,2}\/\d{1,2}\/\d{4}),\s*(\d{1,2}:\d{2})\s*([a-zA-Z\.\s]+)?\s*-\s*(.*)$/i;

  for await (const line of rl) {
    const headerMatch = line.match(messageHeaderRegex);

    if (headerMatch) {
      // 1. Guardar mensaje anterior antes de empezar el nuevo
      if (currentMsg) {
        parsedMessages.push({
          date: currentMsg.date,
          timestampStr: formatSheetsDate(currentMsg.date),
          senderRaw: currentMsg.senderRaw,
          text: currentMsg.textLines.join('\n'),
        });
        currentMsg = null;
      }

      // 2. Parsear el nuevo encabezado
      const [_, dateStr, timeStr, ampmStr, rest] = headerMatch;
      const parsedDate = parseWhatsAppDate(dateStr, ampmStr ? `${timeStr} ${ampmStr}` : timeStr, dateFormat);
      if (!parsedDate) continue; // Si la fecha no es válida, continuar

      // Quitar marcas invisibles LTR (\u200e) del remitente
      const cleanRest = rest.replace(/\u200e/g, '').trim();

      // Buscar el primer ": " para separar remitente del mensaje
      const colonIdx = cleanRest.indexOf(': ');
      if (colonIdx === -1) {
        // Es un evento del sistema (no tiene ": "), se descarta
        continue;
      }

      const senderRaw = cleanRest.substring(0, colonIdx).trim();
      const text = cleanRest.substring(colonIdx + 2).trim();

      currentMsg = {
        date: parsedDate,
        senderRaw,
        textLines: [text],
      };
    } else {
      // Si la línea no matchea el inicio de mensaje, es continuación del mensaje multilínea actual
      if (currentMsg) {
        currentMsg.textLines.push(line);
      }
    }
  }

  // Guardar el último mensaje pendiente al terminar el archivo
  if (currentMsg) {
    parsedMessages.push({
      date: currentMsg.date,
      timestampStr: formatSheetsDate(currentMsg.date),
      senderRaw: currentMsg.senderRaw,
      text: currentMsg.textLines.join('\n'),
    });
  }

  logger.info(`💾 Parseo completado: se procesaron ${parsedMessages.length} mensajes válidos del historial.`);
  return parsedMessages;
}
