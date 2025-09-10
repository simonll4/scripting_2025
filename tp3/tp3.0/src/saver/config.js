/**
 * ============================================================================
 * SAVER CONFIG - Camera System TP3.0
 * ============================================================================
 * Configuración específica del módulo Saver
 */

export const saverConfig = {
  // MQTT Configuration
  mqtt: {
    broker: "localhost",
    port: 1883,
    clientId: "saver-client",
    topic: "camera/snapshots",
    qos: 1,
    options: {
      keepalive: 60,
      connectTimeout: 30000,
      reconnectPeriod: 5000,
      clean: true,
    }
  },

  // File Storage Configuration
  storage: {
    OUT_DIR: "./snapshots",
    ORGANIZE_BY_CAMERA: true,    // Crear subdirectorio por cámara
    ORGANIZE_BY_DATE: true,      // Crear subdirectorios por año/mes/día
    CHECK_DUPLICATES: true,      // Verificar archivos duplicados
    MAX_FILE_AGE_DAYS: 30,      // Días para cleanup automático
  },

  // Validation Configuration
  validation: {
    STRICT_MODE: false,          // Modo estricto de validación
    MAX_MESSAGE_SIZE: 10485760,  // 10MB máximo por mensaje
    REQUIRED_FIELDS: ['cameraId', 'timestamp', 'format', 'data'],
    SUPPORTED_FORMATS: ['image/jpeg', 'image/png'],
    LOG_INVALID_MESSAGES: true,
  },

  // Performance Configuration
  performance: {
    STATS_INTERVAL_MS: 60000,    // Intervalo para logs de estadísticas
    CLEANUP_INTERVAL_MS: 3600000, // Cleanup cada hora
    MAX_CONCURRENT_SAVES: 10,    // Máximo saves concurrentes
    ENABLE_COMPRESSION: false,   // Compresión de archivos (futuro)
  },

  // Logging Configuration
  logging: {
    level: "info",
    enableFileLog: false,
    logDir: "./logs",
    maxLogSize: 10485760,        // 10MB
    maxLogFiles: 5,
  },

  // Error Handling
  errorHandling: {
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
    FAIL_ON_DISK_ERROR: false,   // Continuar si hay errores de disco
    DEAD_LETTER_QUEUE: false,    // Guardar mensajes fallidos (futuro)
  }
};

/**
 * Valida la configuración del Saver
 */
export function validateConfig(config) {
  const errors = [];

  // Validar MQTT
  if (!config.mqtt?.broker) {
    errors.push("mqtt.broker is required");
  }
  if (!config.mqtt?.topic) {
    errors.push("mqtt.topic is required");
  }

  // Validar Storage
  if (!config.storage?.OUT_DIR) {
    errors.push("storage.OUT_DIR is required");
  }

  // Validar Validation
  if (!Array.isArray(config.validation?.REQUIRED_FIELDS)) {
    errors.push("validation.REQUIRED_FIELDS must be an array");
  }
  if (!Array.isArray(config.validation?.SUPPORTED_FORMATS)) {
    errors.push("validation.SUPPORTED_FORMATS must be an array");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Fusiona configuración personalizada con defaults
 */
export function mergeConfig(userConfig = {}) {
  return {
    mqtt: { ...saverConfig.mqtt, ...userConfig.mqtt },
    storage: { ...saverConfig.storage, ...userConfig.storage },
    validation: { ...saverConfig.validation, ...userConfig.validation },
    performance: { ...saverConfig.performance, ...userConfig.performance },
    logging: { ...saverConfig.logging, ...userConfig.logging },
    errorHandling: { ...saverConfig.errorHandling, ...userConfig.errorHandling }
  };
}
