/**
 * ============================================================================
 * AGENT TCP CONFIGURATION - Camera System TP3.0
 * ============================================================================
 * Configuración específica para el agente TCP
 */

import { AGENT_CONFIG } from "../shared/utils/index.js";

// Re-exportar configuración base y agregar configuraciones específicas
export const config = {
  ...AGENT_CONFIG,
  
  // Configuraciones específicas del TCP server (si necesitáramos override)
  MAX_FRAME_BYTES: AGENT_CONFIG.MAX_FRAME_BYTES || 2_097_152,
  MAX_PAYLOAD_BYTES: 1_048_576,
  
  // Timeouts específicos
  CONNECTION_TIMEOUT_MS: 30_000,
  AUTH_TIMEOUT_MS: 10_000,
};
