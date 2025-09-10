/**
 * ============================================================================
 * TRANSPORT UTILITIES - Camera System TP3.0
 * ============================================================================
 * Framing binario: [4 bytes length BE][payload UTF-8 JSON]
 * 
 * Combina la funcionalidad de tp3.0 existente con el patrón MessageFramer de tp2
 */

import { Transform } from "stream";

/**
 * Stream transformer que separa frames de un buffer continuo
 * Protocolo: [4 bytes length BE][payload]
 */
export class MessageDeframer extends Transform {
  constructor(options = {}) {
    super();

    this.buffer = Buffer.alloc(0);
    this.maxFrameSize = options.maxFrameSize || 2_097_152; // 2MB default
    this._fatal = false; // si ocurre error fatal, dejamos de procesar
  }

  _transform(chunk, encoding, callback) {
    if (this._fatal) {
      // ya se produjo un error fatal; descartamos todo para no crecer memoria
      return callback();
    }

    // Agregar chunk al buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Procesar todos los frames completos disponibles
    while (this.buffer.length >= 4) {
      // Leer longitud del frame (primeros 4 bytes)
      const frameLength = this.buffer.readUInt32BE(0);

      // Verificar tamaño máximo (fail-fast)
      if (frameLength > this.maxFrameSize) {
        this._fatal = true;
        this.buffer = Buffer.alloc(0); // evita retener buffer grande
        // Emitimos error específico de transporte; el caller debe cerrar el socket
        this.emit(
          "transport-error", 
          new Error(`bad-frame: ${frameLength} > ${this.maxFrameSize}`)
        );
        return callback(); // no seguimos procesando
      }

      // Verificar si tenemos el frame completo
      const totalFrameSize = 4 + frameLength;
      if (this.buffer.length < totalFrameSize) {
        // Frame incompleto, esperamos más datos
        break;
      }

      // Extraer payload del frame completo
      const payload = this.buffer.subarray(4, totalFrameSize);
      
      // Actualizar buffer (quitar frame procesado)
      this.buffer = this.buffer.subarray(totalFrameSize);

      // Emitir frame completo
      this.push(payload);
    }

    callback();
  }
}

/**
 * Stream transformer que convierte objetos en frames
 * Protocolo: [4 bytes length][JSON payload]
 */
export class MessageFramer extends Transform {
  constructor() {
    super({
      writableObjectMode: true, // Acepta objetos JS
      readableObjectMode: false, // Emite buffers
    });
  }

  _transform(messageObject, encoding, callback) {
    try {
      // Serializar objeto a JSON
      const jsonPayload = Buffer.from(JSON.stringify(messageObject), "utf8");

      // Crear header con longitud (uint32BE)
      const header = Buffer.alloc(4);
      header.writeUInt32BE(jsonPayload.length, 0);

      // Enviar frame completo
      const frame = Buffer.concat([header, jsonPayload]);
      this.push(frame);

      callback();
    } catch (error) {
      // Errores aquí son bugs de serialización; propagamos como error normal del stream
      callback(error);
    }
  }
}

/**
 * Helper para enviar mensajes de forma sencilla.
 * Convierte un objeto JS en un frame binario [len + JSON] y lo escribe en el socket.
 */
export function sendMessage(socket, messageObject) {
  // Crear framer lazy si no existe
  if (!socket._messageFramer) {
    socket._messageFramer = new MessageFramer();
    socket._messageFramer.pipe(socket);
  }

  // Enviar mensaje
  socket._messageFramer.write(messageObject);
}

/**
 * Helper para configurar el pipeline de transporte en un socket.
 * Se encarga de recibir frames binarios del socket, defragmentarlos,
 * parsear el JSON y emitir eventos "message" o "transport-error".
 */
export function setupTransportPipeline(socket, options = {}) {
  const deframer = new MessageDeframer(options);

  socket.pipe(deframer);

  deframer.on("data", (payload) => {
    // Parseo JSON protegido: si falla, es fatal => transport-error + destroy
    try {
      const message = JSON.parse(payload.toString("utf8"));
      socket.emit("message", message);
    } catch (err) {
      // Unificamos como error de transporte y cerramos
      const error = new Error(`bad-json: ${err.message}`);
      // Notificamos a interesados
      socket.emit("transport-error", error);
      // Cierre defensivo: evitamos dejar el stream en estado inconsistente
      // destroy() aborta ambos sentidos; quien lo escuche puede loguear/contabilizar.
      socket.destroy(error);
    }
  });

  // Cualquier error fatal en el deframer (frame muy grande, etc.)
  const onTransportError = (error) => {
    // Reemite hacia el socket para observabilidad
    socket.emit("transport-error", error);
    // Cierre defensivo
    socket.destroy(error);
  };

  deframer.on("transport-error", onTransportError);

  // Back-compat: si alguien emite "error" en deframer, lo tratamos igual
  deframer.on("error", onTransportError);

  return deframer;
}

// ============================================================================
// Legacy functions para compatibilidad con código existente
// ============================================================================

/**
 * Codifica un mensaje como frame binario (legacy)
 * @param {Object} message - Objeto a serializar
 * @returns {Buffer} Frame binario [length][payload]
 */
export function encodeFrame(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/**
 * Decodifica un payload de frame a objeto (legacy)
 * @param {Buffer} payload - Payload del frame
 * @returns {Object} Objeto deserializado
 */
export function decodePayload(payload) {
  const jsonStr = payload.toString("utf8");
  return JSON.parse(jsonStr);
}

/**
 * Wrapper para escribir frame a socket (legacy)
 * @param {net.Socket} socket - Socket TCP
 * @param {Object} message - Mensaje a enviar
 * @returns {boolean} true si se escribió correctamente
 */
export function writeFrame(socket, message) {
  if (!socket || socket.destroyed) {
    return false;
  }

  try {
    const frame = encodeFrame(message);
    return socket.write(frame);
  } catch (error) {
    // Log error pero no crashear
    console.error("writeFrame error:", error);
    return false;
  }
}
