import pino from 'pino';

// Detectar si la consola soporta colores (desactivar en cmd.exe heredado de Windows)
const useColors = process.platform !== 'win32' || 
                  !!process.env.WT_SESSION || // Windows Terminal
                  process.env.COLORTERM === 'truecolor' ||
                  process.env.TERM === 'xterm-256color';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: useColors,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
});

