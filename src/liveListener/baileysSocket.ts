import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { logger } from '../core/logger';

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
      // Ignorar mensajes propios del bot
      if (msg.key.fromMe) continue;

      try {
        await onMessage(sock, msg);
      } catch (err: any) {
        logger.error(`Error al procesar mensaje recibido: ${err.message}`);
      }
    }
  });

  return sock;
}
