/**
 * ============================================================================
 * SNAPSHOT COMMAND - Camera System TP3.0
 * ============================================================================
 * Comando para captura de snapshots
 */

import { captureSnapshot } from "../../services/camera.js";
import { PROTOCOL } from "../../../../protocol/index.js";
import { createLogger } from "../../../../shared/utils/logger.js";
import { logCapture } from "../../../db/repositories/captures.js";

const logger = createLogger("CMD-SNAPSHOT");

/**
 * Handler para el comando SNAPSHOT
 */
export async function handleSnapshot(connState, data, requestMeta, { mqttAdapter, db, captureQueue, config }) {
  const requestId = data?.id || "snapshot";
  const startTime = requestMeta?.startTime || Date.now();

  try {
    const {
      cameraId = config.DEFAULT_CAMERA,
      width = 1280,
      height = 720,
      quality = 80,
      topic = config.DEFAULT_TOPIC,
    } = data || {};

    logger.debug(`Snapshot request for ${cameraId} from connection ${connState.id}`);

    // Verificar si hay captura en curso para esta cámara
    if (captureQueue.has(cameraId)) {
      await logCapture(db, {
        cameraId,
        topic,
        success: false,
        errorMsg: "Camera busy",
        clientIp: connState.socket.remoteAddress,
      });

      return {
        success: false,
        errorCode: PROTOCOL.ERROR_CODES.CAMERA_BUSY,
        errorMessage: "Camera is busy",
        startTime,
      };
    }

    // Marcar cámara como ocupada
    captureQueue.set(cameraId, Date.now());

    try {
      // Capturar imagen
      const snapshot = await captureSnapshot({
        cameraId,
        width,
        height,
        quality,
        timeoutMs: 5000,
        maxImageBytes: config.MAX_IMAGE_BYTES,
      });

      // Preparar mensaje MQTT
      const mqttMessage = {
        cameraId,
        timestamp: Date.now(),
        format: snapshot.format,
        encoding: snapshot.encoding,
        width: snapshot.width,
        height: snapshot.height,
        quality,
        size: snapshot.size,
        data: snapshot.data,
      };

      // Publicar a MQTT
      await mqttAdapter.publishSnapshot(topic, mqttMessage);

      // Log exitoso
      await logCapture(db, {
        cameraId,
        topic,
        success: true,
        imageSize: snapshot.size,
        clientIp: connState.socket.remoteAddress,
      });

      logger.debug(`Snapshot captured and published: ${snapshot.size} bytes`);

      return {
        success: true,
        data: {
          cameraId,
          size: snapshot.size,
          topic,
          timestamp: mqttMessage.timestamp,
        },
        startTime,
      };

    } finally {
      // Liberar cámara
      captureQueue.delete(cameraId);
    }

  } catch (error) {
    // Asegurar que la cámara se libere en caso de error
    if (data?.cameraId) {
      captureQueue.delete(data.cameraId);
    }

    logger.error("Snapshot error:", error);

    // Log del error
    await logCapture(db, {
      cameraId: data?.cameraId || config.DEFAULT_CAMERA,
      topic: data?.topic || config.DEFAULT_TOPIC,
      success: false,
      errorMsg: error.message,
      clientIp: connState.socket.remoteAddress,
    }).catch(() => {}); // Ignore logging errors

    // Mapear errores específicos
    let errorCode = PROTOCOL.ERROR_CODES.CAPTURE_FAILED;
    let errorMessage = "Capture failed";

    if (error.message.includes("timeout")) {
      errorCode = PROTOCOL.ERROR_CODES.CAPTURE_TIMEOUT;
      errorMessage = "Capture timeout";
    } else if (error.message.includes("too large")) {
      errorCode = PROTOCOL.ERROR_CODES.IMAGE_TOO_LARGE;
      errorMessage = "Image too large";
    } else if (error.message.includes("not found")) {
      errorCode = PROTOCOL.ERROR_CODES.CAMERA_NOT_FOUND;
      errorMessage = "Camera not found";
    }

    return {
      success: false,
      errorCode,
      errorMessage,
      startTime,
    };
  }
}
