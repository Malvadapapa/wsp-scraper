import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { logger } from '../core/logger';
import { Boom } from '@hapi/boom';

async function listGroups() {
  logger.info('🔌 Conectando a WhatsApp para listar grupos...');

  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    // Silenciar los logs internos de Baileys para no saturar la consola
    logger: pino({ level: 'warn' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('📸 Escanea el siguiente código QR con tu WhatsApp en Configuración > Dispositivos vinculados:');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      logger.warn(`❌ Conexión cerrada. Razón: ${statusCode}. Reconectando: ${shouldReconnect}`);
      if (shouldReconnect) {
        // En este script de utilidad, si se cierra por error, reintentamos llamando a la función
        setTimeout(listGroups, 3000);
      } else {
        logger.error('Session logged out. Elimina la carpeta "auth_info" y vuelve a ejecutar.');
        process.exit(1);
      }
    } else if (connection === 'open') {
      logger.info('🟢 ¡Conexión exitosa a WhatsApp!');
      logger.info('🔍 Obteniendo lista de grupos...');

      try {
        const groups = await sock.groupFetchAllParticipating();
        const jids = Object.keys(groups);

        logger.info(`📋 Se encontraron ${jids.length} grupos.`);
        console.log('\n======================================================================');
        console.log('   LISTADO DE GRUPOS EN TU CUENTA DE WHATSAPP');
        console.log('======================================================================');

        for (const jid of jids) {
          const name = groups[jid].subject;
          console.log(`➡️  Nombre: "${name}"`);
          console.log(`    JID   : ${jid}`);
          console.log('----------------------------------------------------------------------');
        }
        
        console.log('======================================================================\n');
      } catch (err: any) {
        logger.error(`Error al recuperar grupos: ${err.message}`);
      } finally {
        logger.info('Cerrando conexión del script de utilidad...');
        sock.end(undefined);
        process.exit(0);
      }
    }
  });
}

listGroups().catch((err) => {
  logger.error(`Error fatal en listGroups: ${err.message}`);
  process.exit(1);
});
