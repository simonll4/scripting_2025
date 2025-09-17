import fs from "node:fs";
import path from "node:path";

// Log levels (lower number = higher priority)
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Global logger configuration
let logConfig = {
  level: "info",
  debug: false,
  output: "console", // console, file, both
  file_path: null,
  client_id: null, // Para identificar el archivo específico del cliente
};

// Configure logger with settings from config
export function configureLogger(config) {
  logConfig = { ...logConfig, ...config };
  
  // Create log directory if file output is enabled
  if (logConfig.output !== "console" && logConfig.file_path) {
    const logDir = path.dirname(logConfig.file_path);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }
}

// Set client ID for dynamic log file naming
export function setClientId(clientId) {
  logConfig.client_id = clientId;
}

// Get the actual log file path (with client ID if configured)
function getLogFilePath() {
  if (!logConfig.file_path) {
    return null;
  }
  
  if (!logConfig.client_id) {
    return logConfig.file_path;
  }
  
  // Create client-specific log file: logs/clp-clientId.log
  const logDir = path.dirname(logConfig.file_path);
  const extension = path.extname(logConfig.file_path);
  return path.join(logDir, `clp-${logConfig.client_id}${extension}`);
}

// Core log function with level filtering and output routing
export function log(level, event, fields = {}) {
  // Filter by log level
  const currentLevelPriority = LOG_LEVELS[logConfig.level] ?? LOG_LEVELS.info;
  const messageLevelPriority = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  
  if (messageLevelPriority > currentLevelPriority) {
    return; // Skip if message level is lower priority than configured level
  }
  
  // Skip debug messages if debug is disabled
  if (level === "debug" && !logConfig.debug) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const fieldsStr = Object.keys(fields).length > 0 
    ? ' | ' + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  
  const logLine = `${timestamp} [${level.toUpperCase()}] ${event}${fieldsStr}`;
  
  // Output to console
  if (logConfig.output === "console" || logConfig.output === "both") {
    console.log(logLine);
  }
  
  // Output to file
  if ((logConfig.output === "file" || logConfig.output === "both") && logConfig.file_path) {
    const logFilePath = getLogFilePath();
    try {
      fs.appendFileSync(logFilePath, logLine + "\n");
    } catch (error) {
      // Fallback to console if file write fails
      console.error("Failed to write to log file:", error.message);
      console.log(logLine);
    }
  }
}

export const logger = {
  debug: (e, f) => log("debug", e, f),
  info: (e, f) => log("info", e, f),
  warn: (e, f) => log("warn", e, f),
  error: (e, f) => log("error", e, f),
  configure: configureLogger,
  setClientId: setClientId,
};
