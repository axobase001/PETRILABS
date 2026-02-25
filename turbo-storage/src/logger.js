/**
 * PetriLabs Storage Logger
 * 基于 Pino 的高性能日志库
 */

import pino from 'pino';
import { getLoggingConfig } from './config.js';

let loggerInstance = null;

export function createLogger(name = 'petri-storage') {
  const config = getLoggingConfig();

  if (!loggerInstance) {
    const transport = config.format === 'pretty' 
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        }
      : undefined;

    loggerInstance = pino({
      level: config.level,
      name: 'petri-storage',
      ...(transport ? { transport } : {}),
    });
  }

  return loggerInstance.child({ component: name });
}

export default createLogger;
