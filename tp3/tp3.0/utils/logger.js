/**
 * ============================================================================
 * LOGGER UTILITY
 * ============================================================================
 */

/**
 * Logger con niveles, colores y formateo mejorado
 */
export class Logger {
  constructor(component = "SYSTEM") {
    this.component = component.toUpperCase().padEnd(10);
    this.colors = {
      INFO: '\x1b[36m',  // Cyan
      WARN: '\x1b[33m',  // Yellow  
      ERROR: '\x1b[31m', // Red
      DEBUG: '\x1b[90m', // Gray
      RESET: '\x1b[0m'   // Reset
    };
  }

  _log(level, ...args) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const color = this.colors[level] || '';
    const reset = this.colors.RESET;
    
    // Formatear argumentos
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return String(arg);
    }).join(' ');
    
    const prefix = `${color}[${timestamp}] [${level.padEnd(5)}] [${this.component}]${reset}`;
    console.log(prefix, message);
  }

  info(...args) {
    this._log("INFO", ...args);
  }

  warn(...args) {
    this._log("WARN", ...args);
  }

  error(...args) {
    this._log("ERROR", ...args);
  }

  debug(...args) {
    const debugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG === '1' || 
                        process.env.NODE_ENV === 'development';
    if (debugEnabled) {
      this._log("DEBUG", ...args);
    }
  }

  /**
   * Log de métricas con formato especial
   */
  metric(name, value, unit = '') {
    this.info(`📊 ${name}: ${value}${unit}`);
  }

  /**
   * Log de eventos del sistema
   */
  event(event, data = {}) {
    this.info(`🔔 ${event}`, Object.keys(data).length > 0 ? data : '');
  }
}

/**
 * Crea un logger para un componente específico
 */
export function createLogger(component) {
  return new Logger(component);
}
