/**
 * Sistema de Logging Centralizado
 * Reemplaza console.log/error directo para logging consistente
 */
import { CONFIG } from "../config.js";

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

class Logger {
  constructor() {
    this.level = LOG_LEVELS[CONFIG.LOG_LEVEL] || LOG_LEVELS.info;
  }

  error(message, meta = {}) {
    if (this.level >= LOG_LEVELS.error) {
      const hasMetadata = Object.keys(meta).length > 0;
      if (hasMetadata) {
        console.error(`[ERROR] ${message}`, meta);
      } else {
        console.error(`[ERROR] ${message}`);
      }
    }
  }

  warn(message, meta = {}) {
    if (this.level >= LOG_LEVELS.warn) {
      const hasMetadata = Object.keys(meta).length > 0;
      if (hasMetadata) {
        console.warn(`[WARN] ${message}`, meta);
      } else {
        console.warn(`[WARN] ${message}`);
      }
    }
  }

  info(message, meta = {}) {
    if (this.level >= LOG_LEVELS.info) {
      const hasMetadata = Object.keys(meta).length > 0;
      if (hasMetadata) {
        console.log(`[INFO] ${message}`, meta);
      } else {
        console.log(`[INFO] ${message}`);
      }
    }
  }

  debug(message, meta = {}) {
    if (this.level >= LOG_LEVELS.debug) {
      const hasMetadata = Object.keys(meta).length > 0;
      if (hasMetadata) {
        console.log(`[DEBUG] ${message}`, meta);
      } else {
        console.log(`[DEBUG] ${message}`);
      }
    }
  }
}

export const logger = new Logger();
