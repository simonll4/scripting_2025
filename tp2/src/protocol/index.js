export { PROTOCOL } from "./modules/constants.js";

// Message utilities
export {
  makeHello,
  makeResponse,
  makeError,
  makeRequest,
  makePing,
  makePong,
  validateRequestEnvelope,
  isResponse,
  isError,
  isPing,
  isPong,
  ErrorTemplates,
} from "./modules/messages.js";

// Transport utilities
export {
  MessageDeframer,
  MessageFramer,
  sendMessage,
  setupTransportPipeline,
} from "./modules/transport.js";
