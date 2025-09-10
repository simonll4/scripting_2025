/**
 * ============================================================================
 * PROTOCOL EXPORTS - Camera System TP3.0
 * ============================================================================
 * Re-export central para el protocolo del sistema de cámaras
 */

// Constants
export { PROTOCOL } from "./modules/constants.js";

// Message utilities
export {
  makeHello,
  makeRequest,
  makeResponse,
  makeError,
  isValidMessage,
  isValidRequest,
  isValidResponse,
  isValidHello,
  isResponse,
  isError,
  isHello,
  isRequest,
} from "./modules/messages.js";

// Transport utilities
export {
  MessageDeframer,
  MessageFramer,
  sendMessage,
  setupTransportPipeline,
  // Legacy functions para compatibilidad
  encodeFrame,
  decodePayload,
  writeFrame,
} from "./modules/transport.js";
