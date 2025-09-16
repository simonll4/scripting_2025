/**
 * ============================================================================
 * SNAPSHOT COMMAND
 * ============================================================================
 * Responsabilidades:
 *  - Validar/normalizar input con defaults de config
 *  - Lock por cámara para evitar capturas concurrentes
 *  - Capturar imagen (servicio camera.js), publicar por MQTT y auditar en DB
 *  - Formatear respuesta en contrato del protocolo (success/data o error)
 */

import { captureSnapshot } from "../../services/camera.js";
import { PROTOCOL } from "../../../../protocol/index.js";
import { createLogger } from "../../../../utils/logger.js";
import { logCapture } from "../../../db/repositories/captures.js";
import { validateAndNormalize } from "./schema.js";

const logger = createLogger("CMD-SNAPSHOT");

// ------------------------------ Error Mapping ------------------------------

/**
 * Traduce cualquier Error a {code, message} alineado con el protocolo.
 * Centralizar aquí mantiene consistente el mapeo de errores.
 */
function mapCaptureError(err) {
  const msg = String(err?.message || err || "unknown");

  // Validaciones del input (4xx) - incluye errores de AJV schema
  if (msg.startsWith("validation:")) {
    return {
      code: PROTOCOL.ERROR_CODES.BAD_REQUEST,
      message: msg
        .replace("validation:schema-error: ", "")
        .replace("validation:", ""),
    };
  }

  // Errores comunes de captura (timeouts, tamaño, no encontrada)
  if (msg.includes("timeout"))
    return {
      code: PROTOCOL.ERROR_CODES.CAPTURE_TIMEOUT,
      message: "Capture timeout",
    };
  if (msg.includes("too large"))
    return {
      code: PROTOCOL.ERROR_CODES.IMAGE_TOO_LARGE,
      message: "Image too large",
    };
  if (msg.includes("not found"))
    return {
      code: PROTOCOL.ERROR_CODES.CAMERA_NOT_FOUND,
      message: "Camera not found",
    };

  // Genérico
  return {
    code: PROTOCOL.ERROR_CODES.CAPTURE_FAILED,
    message: "Capture failed",
  };
}

// ------------------------------------- Lock por cámara -----------------------------------------

/**
 * Lock simple con Map para evitar capturas simultáneas sobre la misma cámara.
 * Devuelve true si adquiere el lock, false si ya existía.
 */
function tryAcquire(queue, key) {
  if (queue.has(key)) return false;
  queue.set(key, Date.now());
  return true;
}

/** Libera lock de forma idempotente. */
function release(queue, key) {
  if (queue.has(key)) queue.delete(key);
}

// ------------------------------------- Handler principal ---------------------------------------

/**
 * Handler compatible con MessagePipeline:
 *  - Retorna { success:true, data } o { success:false, errorCode, errorMessage }
 */
export async function handleSnapshot(
  connState,
  data,
  requestMeta,
  { mqttAdapter, db, captureQueue, config }
) {
  const startedAt = requestMeta?.startTime ?? Date.now();
  let input;

  try {
    // 1) Validar y normalizar entrada usando AJV schema
    input = validateAndNormalize(data, config);

    // 2) Chequear/establecer lock por cámara
    if (!tryAcquire(captureQueue, input.cameraId)) {
      // Registrar intento rechazado (no frenar por error de logging)
      await logCapture(db, {
        cameraId: input.cameraId,
        topic: input.topic,
        success: false,
        errorMsg: "Camera busy",
        clientIp: connState.socket?.remoteAddress,
      }).catch(() => {});

      return {
        success: false,
        errorCode: PROTOCOL.ERROR_CODES.CAMERA_BUSY,
        errorMessage: "Camera is busy",
        startTime: startedAt,
      };
    }

    // 3) Elegir preset de calidad → define modo de captura
    //    - "max":   preferRAW=true,  reencode=true  (calidad consistente y alta)
    //    - "fast":  preferMJPEG=true, reencode=false (latencia baja; calidad del device)
    //    - default: preferRAW=true,  reencode=true
    const preferRAW = input.preset === "fast" ? false : true;
    const preferMJPEG = input.preset === "fast" ? true : false;
    const reencode = input.preset === "fast" ? false : true;

    // 4) Capturar imagen (el servicio maneja timeout y límite de tamaño)
    const snap = await captureSnapshot({
      cameraId: input.cameraId,
      width: input.width,
      height: input.height,
      quality: input.quality,
      timeoutMs: config.SNAP_TIMEOUT_MS ?? 7000,
      maxImageBytes: config.MAX_IMAGE_BYTES ?? 12_582_912, // ~12MiB
      preferRAW,
      preferMJPEG,
      reencode,
    });

    // 5) Publicar a MQTT (imagen en base64 + metadatos mínimos)
    const publishedAt = Date.now();
    await mqttAdapter.publishSnapshot(input.topic, {
      cameraId: input.cameraId,
      timestamp: publishedAt,
      format: snap.format,
      encoding: snap.encoding,
      width: snap.width,
      height: snap.height,
      quality: input.quality,
      size: snap.size,
      data: snap.data, // ⚠️ base64
    });

    // 6) Auditoría de éxito (ignorar errores de logging)
    await logCapture(db, {
      cameraId: input.cameraId,
      topic: input.topic,
      success: true,
      imageSize: snap.size,
      clientIp: connState.socket?.remoteAddress,
    }).catch(() => {});

    logger.debug(
      `Snapshot OK cam=${input.cameraId} ${snap.width}x${snap.height} q=${input.quality} size=${snap.size}B`
    );

    // 7) Respuesta al cliente (sin el binario para no inflar frames TCP)
    return {
      success: true,
      data: {
        cameraId: input.cameraId,
        topic: input.topic,
        size: snap.size,
        width: snap.width,
        height: snap.height,
        timestamp: publishedAt,
      },
      startTime: startedAt,
    };
  } catch (err) {
    // Mapear y responder error de forma consistente
    const { code, message } = mapCaptureError(err);

    await logCapture(db, {
      cameraId: input?.cameraId ?? data?.cameraId ?? config.DEFAULT_CAMERA,
      topic: input?.topic ?? data?.topic ?? config.DEFAULT_TOPIC,
      success: false,
      errorMsg: String(err?.message || err),
      clientIp: connState.socket?.remoteAddress,
    }).catch(() => {});

    return {
      success: false,
      errorCode: code,
      errorMessage: message,
      startTime: startedAt,
    };
  } finally {
    // 8) Liberar lock siempre (éxito o error)
    release(
      captureQueue,
      input?.cameraId ?? data?.cameraId ?? config.DEFAULT_CAMERA
    );
  }
}
