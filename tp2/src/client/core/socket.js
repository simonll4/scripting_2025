import net from "net";
import { setupTransportPipeline, PROTOCOL } from "../../protocol/index.js";
import { logger } from "../utils/logger.js";

/**
 * Crea y configura un socket TCP para comunicación con el servidor.
 * Incluye configuración de transporte, framing y reconfiguración dinámica.
 */
export function createSocket({ host, port, keepAliveMs, connectTimeoutMs }) {
  // ============================================================================
  // CREACIÓN Y CONFIGURACIÓN INICIAL
  // ============================================================================

  const socket = net.createConnection({ host, port });

  // Configurar opciones TCP básicas
  _configureTcpOptions(socket, keepAliveMs, connectTimeoutMs);

  // Configurar transporte inicial con límites por defecto
  let deframer = _setupInitialTransport(socket);

  // Configurar manejo de eventos del socket
  _setupSocketEventHandlers(socket, connectTimeoutMs);

  // ============================================================================
  // FUNCIÓN DE RECONFIGURACIÓN DINÁMICA
  // ============================================================================

  const reconfigureTransport = (newMaxFrameSize) => {
    _reconfigureTransportPipeline(
      socket,
      deframer,
      newMaxFrameSize,
      (newDeframer) => {
        deframer = newDeframer;
      }
    );
  };

  return { socket, reconfigureTransport };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Configura las opciones TCP básicas del socket
 */
function _configureTcpOptions(socket, keepAliveMs, connectTimeoutMs) {
  // Deshabilitar algoritmo de Nagle para menor latencia
  socket.setNoDelay(true);

  // Configurar keep-alive si está especificado
  if (keepAliveMs > 0) {
    socket.setKeepAlive(true, keepAliveMs);
    logger.info(`Keep-alive configurado: ${keepAliveMs}ms`);
  }

  // Timeout de conexión (corte duro)
  if (connectTimeoutMs > 0) {
    socket.setTimeout(connectTimeoutMs);
  }
}

/**
 * Configura el pipeline de transporte inicial
 */
function _setupInitialTransport(socket) {
  const maxFrameSize = PROTOCOL.LIMITS.MAX_FRAME;

  logger.info(
    `Configurando transporte inicial: maxFrame=${maxFrameSize} bytes`
  );

  return setupTransportPipeline(socket, {
    maxFrameSize: maxFrameSize,
  });
}

/**
 * Configura los manejadores de eventos del socket
 */
function _setupSocketEventHandlers(socket, connectTimeoutMs) {
  // Error en el socket
  socket.on("error", (error) => {
    logger.error("Error de socket", {
      code: error.code,
      message: error.message,
      address: error.address,
      port: error.port,
    });
  });

  // Socket cerrado
  socket.on("close", (hadError) => {
    const reason = hadError ? "con error" : "normal";
    logger.info(`Conexión cerrada (${reason})`);
  });

  // Conexión establecida
  socket.on("connect", () => {
    const { remoteAddress, remotePort } = socket;
    logger.info(`Socket conectado a ${remoteAddress}:${remotePort}`);
    // al conectar, desarmamos el timeout de "connect"
    if (connectTimeoutMs > 0) socket.setTimeout(0);
  });

  // Timeout de socket (conexión o inactividad según setTimeout actual)
  socket.on("timeout", () => {
    const err = new Error("connect-timeout");
    logger.warn("Timeout de socket: destruyendo conexión");
    socket.destroy(err);
  });
}

/**
 * Reconfigura el pipeline de transporte con nuevos parámetros
 */
function _reconfigureTransportPipeline(
  socket,
  currentDeframer,
  newMaxFrameSize,
  updateDeframer
) {
  // Validar si es necesario reconfigurar
  if (!_shouldReconfigure(newMaxFrameSize)) {
    return;
  }

  logger.info(
    `Reconfigurando transporte: ${PROTOCOL.LIMITS.MAX_FRAME} -> ${newMaxFrameSize} bytes`
  );

  try {
    // Limpiar pipeline anterior
    _cleanupCurrentPipeline(socket, currentDeframer);

    // Crear nuevo pipeline con límites actualizados
    const newDeframer = setupTransportPipeline(socket, {
      maxFrameSize: newMaxFrameSize,
    });

    // Actualizar referencia
    updateDeframer(newDeframer);

    logger.info("Reconfiguración de transporte completada");
  } catch (error) {
    logger.error("Error reconfigurando transporte", {
      error: error.message,
    });

    // En caso de error, mantener configuración anterior
    throw new Error(`Fallo la reconfiguración de transporte: ${error.message}`);
  }
}

/**
 * Determina si es necesario reconfigurar el transporte
 */
function _shouldReconfigure(newMaxFrameSize) {
  if (!newMaxFrameSize || typeof newMaxFrameSize !== "number") {
    return false;
  }

  if (newMaxFrameSize === PROTOCOL.LIMITS.MAX_FRAME) {
    logger.info("MaxFrameSize igual al actual, no es necesario reconfigurar");
    return false;
  }

  if (newMaxFrameSize <= 0) {
    logger.warn(`MaxFrameSize inválido: ${newMaxFrameSize}`);
    return false;
  }

  return true;
}

/**
 * Limpia el pipeline de transporte actual
 */
function _cleanupCurrentPipeline(socket, deframer) {
  try {
    // Desconectar pipeline
    socket.unpipe(deframer);

    // Remover todos los listeners del deframer
    deframer.removeAllListeners();

    // Forzar cleanup si el deframer lo soporta
    if (typeof deframer.destroy === "function") {
      deframer.destroy();
    }
  } catch (error) {
    logger.warn("Error limpiando pipeline anterior", {
      error: error.message,
    });
  }
}

// import net from "net";
// import { setupTransportPipeline, PROTOCOL } from "../../protocol/index.js";
// import { logger } from "../utils/logger.js";

// /**
//  * Crea y configura un socket TCP para comunicación con el servidor.
//  * Incluye configuración de transporte, framing y reconfiguración dinámica.
//  */
// export function createSocket({ host, port, keepAliveMs }) {
//   // ============================================================================
//   // CREACIÓN Y CONFIGURACIÓN INICIAL
//   // ============================================================================

//   const socket = net.createConnection({ host, port });

//   // Configurar opciones TCP básicas
//   _configureTcpOptions(socket, keepAliveMs);

//   // Configurar transporte inicial con límites por defecto
//   let deframer = _setupInitialTransport(socket);

//   // Configurar manejo de eventos del socket
//   _setupSocketEventHandlers(socket);

//   // ============================================================================
//   // FUNCIÓN DE RECONFIGURACIÓN DINÁMICA
//   // ============================================================================

//   const reconfigureTransport = (newMaxFrameSize) => {
//     _reconfigureTransportPipeline(
//       socket,
//       deframer,
//       newMaxFrameSize,
//       (newDeframer) => {
//         deframer = newDeframer;
//       }
//     );
//   };

//   return { socket, reconfigureTransport };
// }

// // ============================================================================
// // FUNCIONES AUXILIARES
// // ============================================================================

// /**
//  * Configura las opciones TCP básicas del socket
//  */
// function _configureTcpOptions(socket, keepAliveMs) {
//   // Deshabilitar algoritmo de Nagle para menor latencia
//   socket.setNoDelay(true);

//   // Configurar keep-alive si está especificado
//   if (keepAliveMs > 0) {
//     socket.setKeepAlive(true, keepAliveMs);
//     logger.info(`Keep-alive configurado: ${keepAliveMs}ms`);
//   }
// }

// /**
//  * Configura el pipeline de transporte inicial
//  */
// function _setupInitialTransport(socket) {
//   const maxFrameSize = PROTOCOL.LIMITS.MAX_FRAME;

//   logger.info(
//     `Configurando transporte inicial: maxFrame=${maxFrameSize} bytes`
//   );

//   return setupTransportPipeline(socket, {
//     maxFrameSize: maxFrameSize,
//   });
// }

// /**
//  * Configura los manejadores de eventos del socket
//  */
// function _setupSocketEventHandlers(socket) {
//   // Error en el socket
//   socket.on("error", (error) => {
//     logger.error("Error de socket", {
//       code: error.code,
//       message: error.message,
//       address: error.address,
//       port: error.port,
//     });
//   });

//   // Socket cerrado
//   socket.on("close", (hadError) => {
//     const reason = hadError ? "con error" : "normal";
//     logger.info(`Conexión cerrada (${reason})`);
//   });

//   // Conexión establecida
//   socket.on("connect", () => {
//     const { remoteAddress, remotePort } = socket;
//     logger.info(`Socket conectado a ${remoteAddress}:${remotePort}`);
//   });

//   // Timeout de conexión
//   socket.on("timeout", () => {
//     logger.warn("Timeout de socket");
//   });
// }

// /**
//  * Reconfigura el pipeline de transporte con nuevos parámetros
//  */
// function _reconfigureTransportPipeline(
//   socket,
//   currentDeframer,
//   newMaxFrameSize,
//   updateDeframer
// ) {
//   // Validar si es necesario reconfigurar
//   if (!_shouldReconfigure(newMaxFrameSize)) {
//     return;
//   }

//   logger.info(
//     `Reconfigurando transporte: ${PROTOCOL.LIMITS.MAX_FRAME} -> ${newMaxFrameSize} bytes`
//   );

//   try {
//     // Limpiar pipeline anterior
//     _cleanupCurrentPipeline(socket, currentDeframer);

//     // Crear nuevo pipeline con límites actualizados
//     const newDeframer = setupTransportPipeline(socket, {
//       maxFrameSize: newMaxFrameSize,
//     });

//     // Actualizar referencia
//     updateDeframer(newDeframer);

//     logger.info("Reconfiguración de transporte completada");
//   } catch (error) {
//     logger.error("Error reconfigurando transporte", {
//       error: error.message,
//     });

//     // En caso de error, mantener configuración anterior
//     throw new Error(`Fallo la reconfiguración de transporte: ${error.message}`);
//   }
// }

// /**
//  * Determina si es necesario reconfigurar el transporte
//  */
// function _shouldReconfigure(newMaxFrameSize) {
//   if (!newMaxFrameSize || typeof newMaxFrameSize !== "number") {
//     return false;
//   }

//   if (newMaxFrameSize === PROTOCOL.LIMITS.MAX_FRAME) {
//     logger.info("MaxFrameSize igual al actual, no es necesario reconfigurar");
//     return false;
//   }

//   if (newMaxFrameSize <= 0) {
//     logger.warn(`MaxFrameSize inválido: ${newMaxFrameSize}`);
//     return false;
//   }

//   return true;
// }

// /**
//  * Limpia el pipeline de transporte actual
//  */
// function _cleanupCurrentPipeline(socket, deframer) {
//   try {
//     // Desconectar pipeline
//     socket.unpipe(deframer);

//     // Remover todos los listeners del deframer
//     deframer.removeAllListeners();

//     // Forzar cleanup si el deframer lo soporta
//     if (typeof deframer.destroy === "function") {
//       deframer.destroy();
//     }
//   } catch (error) {
//     logger.warn("Error limpiando pipeline anterior", {
//       error: error.message,
//     });
//   }
// }
