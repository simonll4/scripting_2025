const ts = () => new Date().toLocaleString('es-ES', {
  year: 'numeric',
  month: '2-digit', 
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

// Colores ANSI para el logger
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

export const logger = {
  info(msg, data) {
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.blue}[INFO]${colors.reset} ${msg}`);
    if (data) console.log(`${colors.dim}   ${JSON.stringify(data, null, 2)}${colors.reset}`);
  },
  ok(msg, data) {
    console.log(`${colors.dim}[${ts()}]${colors.reset} ${colors.green}[OK]${colors.reset} ${msg}`);
    if (data) console.log(`${colors.dim}   ${JSON.stringify(data, null, 2)}${colors.reset}`);
  },
  warn(msg, data) {
    console.warn(`${colors.dim}[${ts()}]${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${msg}`);
    if (data) console.warn(`${colors.dim}   ${JSON.stringify(data, null, 2)}${colors.reset}`);
  },
  error(msg, data) {
    console.error(`${colors.dim}[${ts()}]${colors.reset} ${colors.red}[ERROR]${colors.reset} ${msg}`);
    if (data) console.error(`${colors.dim}   ${JSON.stringify(data, null, 2)}${colors.reset}`);
  },
  debug(msg, data) {
    // Debug logging - controlled via environment variables
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.debug(`${colors.dim}[${ts()}] [DEBUG]: ${msg}${colors.reset}`);
      if (data) console.debug(`${colors.dim}   ${JSON.stringify(data, null, 2)}${colors.reset}`);
    }
  },
};
