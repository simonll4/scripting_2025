/**
 * ============================================================================
 * TRANSPORT UTILITIES
 * ============================================================================
 */

import { Transform } from "stream";

/**
 * Stream transformer que separa frames de un buffer continuo
 * Protocolo: [4 bytes length][payload]
 */
export class MessageDeframer extends Transform {
  constructor(options = {}) {
    super();

    this.buffer = Buffer.alloc(0);
    this.maxFrameSize = options.maxFrameSize || 262144; // 256KB default
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
        break; // Frame incompleto, esperar más datos
      }

      // Extraer payload del frame (bytes del JSON en UTF-8)
      const payload = this.buffer.slice(4, totalFrameSize);
      this.push(payload);

      // Remover frame procesado del buffer
      this.buffer = this.buffer.slice(totalFrameSize);
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
