import { WASocket } from '@whiskeysockets/baileys';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { extractLinkedIn } from '../core/linkedinExtractor';
import { SheetsWriter } from '../core/sheetsWriter';
import { QueueProcessor } from './queueProcessor';
import { connectToWhatsApp } from './baileysSocket';
import { formatSheetsDate } from '../historyImport/parseExport';
import { LinkedInRecord } from '../types';
import { acquireInstanceLock, releaseInstanceLock } from '../core/instanceLock';

// Validar que el JID del grupo objetivo esté configurado antes de iniciar
if (!config.TARGET_GROUP_JID) {
  logger.error('Error de arranque: TARGET_GROUP_JID no esta configurado en el archivo .env.');
  logger.error('Ejecuta primero "npm run list-groups" para escanear el QR y obtener el JID de tu grupo.');
  process.exit(1);
}

const targetGroupJid = config.TARGET_GROUP_JID;
const writer = new SheetsWriter();
const queue = new QueueProcessor();

async function main() {
  // Adquirir bloqueo de instancia unica al arrancar
  acquireInstanceLock();

  logger.info('Iniciando bot de escucha en vivo...');

  // Inicializar la caché de Sheets y aplicar formato estético
  try {
    await writer.initialize();
  } catch (err: any) {
    logger.warn(`No se pudo inicializar la hoja de Google Sheets al arrancar: ${err.message}. El bot seguira funcionando y encolando localmente.`);
  }

  // 1. Iniciar la conexión persistente con WhatsApp
  await connectToWhatsApp(
    // Callback: Conexión abierta
    async (sock: WASocket) => {
      logger.info(`Escuchando mensajes en tiempo real para el grupo JID: ${targetGroupJid}`);
      
      // Intentar procesar cola local pendiente al conectar
      await queue.processQueue(writer);
    },
    // Callback: Mensaje recibido
    async (sock: WASocket, msg: any) => {
      const remoteJid = msg.key.remoteJid;

      // Filtrar mensajes que pertenecen únicamente al grupo objetivo
      if (remoteJid !== targetGroupJid) return;

      // En un grupo, el remitente real siempre está en participant
      // Priorizamos el número de teléfono real (participantPn) sobre el identificador interno (participant)
      const senderJid = msg.key.participantPn || msg.key.participant;
      if (!senderJid) {
        logger.debug('Mensaje de grupo recibido sin participante. Ignorando...');
        return;
      }

      const senderRaw = senderJid.split('@')[0];

      // Obtener el nombre push de WhatsApp
      const whatsappName = msg.pushName || 'Desconocido';

      // Extraer el texto plano del mensaje
      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   msg.message?.imageMessage?.caption ||
                   '';

      if (!text) return;

      // Evaluar si contiene un enlace de LinkedIn
      const extraction = extractLinkedIn(text);
      if (extraction) {
        // WhatsApp timestamp viene en segundos Unix UTC
        const msgTimestamp = msg.messageTimestamp as number;
        const msgDate = new Date(msgTimestamp * 1000);
        const timestampStr = formatSheetsDate(msgDate);

        logger.info(`LinkedIn detectado de [${whatsappName}] (${senderRaw})!`);

        const record: LinkedInRecord = {
          timestamp: timestampStr,
          senderIdentifier: senderRaw,
          whatsappName,
          linkedinUrl: extraction.normalizedUrl,
          fullText: text,
        };

        // Encolar localmente para evitar pérdidas
        await queue.enqueue(record);

        // Intentar procesar la cola de inmediato
        await queue.processQueue(writer);
      }
    }
  );

  // 2. Tarea recurrente en segundo plano para procesar y reintentar cola fallida cada 30 segundos
  const queueInterval = setInterval(async () => {
    try {
      await queue.processQueue(writer);
    } catch (err: any) {
      logger.error(`Error en el worker recurrente de cola: ${err.message}`);
    }
  }, 30000);

  // 3. Manejo de apagado ordenado (Shutdown Graceful)
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Recibida senal ${signal}. Iniciando apagado ordenado...`);
    clearInterval(queueInterval);

    try {
      // Intentar una última escritura antes de apagar
      await queue.processQueue(writer);
      logger.info('Cola local guardada.');
    } catch (err: any) {
      logger.error(`Error al procesar la cola durante el apagado: ${err.message}`);
    }

    releaseInstanceLock();
    logger.info('Desconexion limpia completada. Saliendo.');
    process.exit(0);
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Asegurar la liberacion de la instancia al salir
  process.on('exit', () => {
    releaseInstanceLock();
  });
}

main().catch((err) => {
  logger.error(`Error critico en el proceso en vivo: ${err.message}`);
  process.exit(1);
});
