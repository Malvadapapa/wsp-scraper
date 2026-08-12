import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { logger } from '../core/logger';
import { addContactToCache, loadContactsCache } from '../core/contactsCache';

/**
 * Establece una conexión persistente a WhatsApp usando Baileys.
 * 
 * @param onConnectionOpen Callback cuando la conexión está abierta y lista.
 * @param onMessage Callback cuando se recibe un mensaje nuevo.
 */
export async function connectToWhatsApp(
  onConnectionOpen: (sock: WASocket) => void,
  onMessage: (sock: WASocket, msg: any) => Promise<void>
): Promise<WASocket> {
  // Cargar cache local de contactos al iniciar la conexion
  loadContactsCache();

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  let retryCount = 0;

  const sock = makeWASocket({
    auth: state,
    // Eliminar la opción obsoleta printQRInTerminal
    logger: pino({ level: 'warn' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('📸 Escanea el siguiente código QR con tu WhatsApp en Configuración > Dispositivos vinculados:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      logger.info('🟢 Conexión a WhatsApp establecida con éxito.');
      retryCount = 0; // Resetear contador de reintentos
      onConnectionOpen(sock);
    } else if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`⚠️ Conexión cerrada. Código: ${statusCode}. ¿Reconectar?: ${shouldReconnect}`);

      if (shouldReconnect) {
        // Backoff exponencial maxeado en 60 segundos
        const delay = Math.min(1000 * Math.pow(2, retryCount++), 60000);
        logger.info(`🔄 Intentando reconexión en ${delay / 1000} segundos...`);
        setTimeout(() => connectToWhatsApp(onConnectionOpen, onMessage), delay);
      } else {
        logger.error('❌ La sesión fue cerrada. Elimina la carpeta "auth_info" para volver a vincular.');
        process.exit(1);
      }
    }
  });

  sock.ev.on('messages.upsert', async (chatUpdate) => {
    // Procesar solo mensajes recibidos en tiempo real (notify)
    if (chatUpdate.type !== 'notify') return;

    for (const msg of chatUpdate.messages) {
      // Guardar el pushName en cache si esta disponible
      const senderJid = msg.key.participant || msg.key.remoteJid;
      if (msg.pushName && senderJid) {
        addContactToCache(senderJid, msg.pushName);
      }

      try {
        await onMessage(sock, msg);
      } catch (err: any) {
        logger.error(`Error al procesar mensaje recibido: ${err.message}`);
      }
    }
  });

  // Procesar mensajes del historial de sincronizacion al iniciar o reconectar
  sock.ev.on('messaging-history.set', async ({ messages, contacts }) => {
    if (contacts && contacts.length > 0) {
      logger.info(`📥 Recibidos ${contacts.length} contactos del historial de sincronizacion. Indexando...`);
      for (const contact of contacts) {
        const name = contact.notify || contact.name || '';
        if (contact.id && name) {
          addContactToCache(contact.id, name);
        }
      }
    }

    if (!messages || messages.length === 0) return;
    logger.info(`Procesando ${messages.length} mensajes del historial de sincronizacion para recuperar enlaces...`);

    for (const msg of messages) {
      // Extraer pushName del mensaje del historial si esta disponible
      const senderJid = msg.key.participant || msg.key.remoteJid;
      if (msg.pushName && senderJid) {
        addContactToCache(senderJid, msg.pushName);
      }

      try {
        await onMessage(sock, msg);
      } catch (err: any) {
        logger.error(`Error al procesar mensaje de historial: ${err.message}`);
      }
    }
  });

  // Guardar contactos en vivo cuando se reciban o actualicen
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const contact of contacts) {
      const name = contact.notify || contact.name || '';
      if (contact.id && name) {
        addContactToCache(contact.id, name);
      }
    }
  });

  sock.ev.on('contacts.update', (updates) => {
    for (const update of updates) {
      const name = update.notify || update.name || '';
      if (update.id && name) {
        addContactToCache(update.id, name);
      }
    }
  });

  return sock;
}
