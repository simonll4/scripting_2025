/**
 * ============================================================================
 * SCHEDULER CONFIGURATION - Camera System TP3.0
 * ============================================================================
 * Configuración específica para el scheduler
 */

import { SCHEDULER_CONFIG } from "../shared/utils/index.js";

// Re-exportar configuración base y agregar configuraciones específicas
export const config = {
  ...SCHEDULER_CONFIG,
  
  // Configuraciones específicas del scheduler
  MAX_RETRY_ATTEMPTS: 5,
  BASE_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  
  // Timeouts específicos
  CONNECTION_TIMEOUT_MS: 10_000,
  AUTH_TIMEOUT_MS: 10_000,
  SNAPSHOT_TIMEOUT_MS: 30_000,
  
  // Estadísticas
  STATS_LOG_INTERVAL_MS: 60_000, // Log stats cada minuto
};
