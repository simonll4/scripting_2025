/**
 * ============================================================================
 * TRANSPORT UTILITIES
 * ============================================================================
 *
 * Utilidades para el transporte de datos sobre TCP.
 * Responsabilidades:
 * - Framing/Deframing de mensajes
 * - Serialización JSON
 * - Control de tamaño de frame
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
  }

  _transform(chunk, encoding, callback) {
    // Agregar chunk al buffer
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // Procesar todos los frames completos disponibles
    while (this.buffer.length >= 4) {
      // Leer longitud del frame (primeros 4 bytes)
      const frameLength = this.buffer.readUInt32BE(0);

      // Verificar tamaño máximo
      if (frameLength > this.maxFrameSize) {
        this.emit(
          "error",
          new Error(`Frame too large: ${frameLength} > ${this.maxFrameSize}`)
        );
        return;
      }

      // Verificar si tenemos el frame completo
      const totalFrameSize = 4 + frameLength;
      if (this.buffer.length < totalFrameSize) {
        break; // Frame incompleto, esperar más datos
      }

      // Extraer payload del frame
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

      // Crear header con longitud
      const header = Buffer.alloc(4);
      header.writeUInt32BE(jsonPayload.length, 0);

      // Enviar frame completo
      const frame = Buffer.concat([header, jsonPayload]);
      this.push(frame);

      callback();
    } catch (error) {
      callback(error);
    }
  }
}

/**
 * Helper para enviar mensajes de forma sencilla
 * Crea un framer automáticamente si no existe
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
 * Helper para configurar el pipeline de transporte en un socket
 */
export function setupTransportPipeline(socket, options = {}) {
  const deframer = new MessageDeframer(options);

  // Pipeline: socket -> deframer -> JSON parser -> eventos
  socket.pipe(deframer);

  deframer.on("data", (payload) => {
    try {
      const message = JSON.parse(payload.toString("utf8"));
      socket.emit("message", message);
    } catch (error) {
      socket.emit("error", new Error(`Invalid JSON: ${error.message}`));
    }
  });

  deframer.on("error", (error) => {
    socket.emit("transport-error", error);
  });

  return deframer;
}
