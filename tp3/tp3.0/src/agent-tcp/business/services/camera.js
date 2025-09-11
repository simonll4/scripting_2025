/**
 * ============================================================================
 * CAMERA SERVICE - Camera System TP3.0
 * ============================================================================
 * Servicio para manejo de cámaras, extracido desde shared/utils/camera.js
 */

import { spawn } from "child_process";
import { createLogger } from "../../../utils/logger.js";
import { PROTOCOL } from "../../../protocol/index.js";

const logger = createLogger("CAMERA-SERVICE");

/**
 * Lista las cámaras disponibles usando v4l2-ctl
 */
export async function listCameras(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const cameras = [];
    
    // Timeout de seguridad
    const timer = setTimeout(() => {
      reject(new Error("Timeout listing cameras"));
    }, timeoutMs);

    try {
      // Listar dispositivos v4l2
      const proc = spawn("v4l2-ctl", ["--list-devices"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timer);

        if (code !== 0) {
          reject(new Error(`v4l2-ctl failed: ${errorOutput}`));
          return;
        }

        // Parsear salida para extraer dispositivos
        const lines = output.split("\n");
        let currentDevice = null;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Línea de dispositivo (sin tab al inicio)
          if (!line.startsWith("\t") && trimmed.includes(":")) {
            currentDevice = trimmed.split(":")[0].trim();
          } else if (line.startsWith("\t") && currentDevice) {
            // Línea de path del dispositivo
            const devicePath = trimmed;
            if (devicePath.startsWith("/dev/video")) {
              cameras.push({
                id: devicePath,
                name: currentDevice,
                status: PROTOCOL.CAMERA_STATUS.AVAILABLE,
              });
            }
          }
        }

        resolve(cameras);
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Captura una imagen usando FFmpeg con formato MJPEG nativo
 */
export async function captureSnapshot({
  cameraId,
  width = 1280,
  height = 720,
  quality = 80,
  timeoutMs = 5000,
  maxImageBytes = 2_097_152,
}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Snapshot timeout"));
    }, timeoutMs);

    try {
      logger.debug(`Capturing from ${cameraId}, ${width}x${height}, q=${quality}`);

      const args = [
        "-f", "v4l2",
        "-input_format", "mjpeg",
        "-video_size", `${width}x${height}`,
        "-i", cameraId,
        "-frames:v", "1",
        "-q:v", quality.toString(),
        "-f", "mjpeg",
        "pipe:1"
      ];

      const proc = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const chunks = [];
      let totalSize = 0;
      let errorOutput = "";

      proc.stdout.on("data", (chunk) => {
        totalSize += chunk.length;
        
        if (totalSize > maxImageBytes) {
          proc.kill("SIGTERM");
          clearTimeout(timer);
          reject(new Error(`Image too large: ${totalSize} > ${maxImageBytes}`));
          return;
        }
        
        chunks.push(chunk);
      });

      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      proc.on("close", (code) => {
        clearTimeout(timer);

        if (code !== 0) {
          reject(new Error(`FFmpeg failed (${code}): ${errorOutput}`));
          return;
        }

        if (chunks.length === 0) {
          reject(new Error("No image data captured"));
          return;
        }

        const imageBuffer = Buffer.concat(chunks);
        
        // Validar que es JPEG válido (magic bytes: FF D8)
        if (imageBuffer.length < 2 || imageBuffer[0] !== 0xFF || imageBuffer[1] !== 0xD8) {
          reject(new Error("Invalid JPEG data"));
          return;
        }

        logger.debug(`Captured ${imageBuffer.length} bytes from ${cameraId}`);
        
        resolve({
          data: imageBuffer.toString("base64"),
          format: PROTOCOL.IMAGE_FORMAT.JPEG,
          encoding: PROTOCOL.ENCODING.BASE64,
          size: imageBuffer.length,
          width,
          height,
          cameraId,
        });
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Verifica el estado de una cámara específica
 */
export async function checkCameraStatus(cameraId, timeoutMs = 3000) {
  try {
    // Intentar listar las cámaras y buscar esta específica
    const cameras = await listCameras(timeoutMs);
    const camera = cameras.find(cam => cam.id === cameraId);
    
    if (!camera) {
      return {
        id: cameraId,
        status: PROTOCOL.CAMERA_STATUS.NOT_FOUND,
        error: "Camera not found in system",
      };
    }

    // TODO: Agregar chequeo más detallado si la cámara está ocupada
    // Esto requeriría intentar abrir el dispositivo brevemente
    
    return {
      id: cameraId,
      status: PROTOCOL.CAMERA_STATUS.AVAILABLE,
      name: camera.name,
    };
  } catch (error) {
    logger.warn(`Error checking camera ${cameraId}:`, error.message);
    return {
      id: cameraId,
      status: PROTOCOL.CAMERA_STATUS.ERROR,
      error: error.message,
    };
  }
}

/**
 * Verifica si una cámara está disponible para captura
 */
export async function isCameraAvailable(cameraId, timeoutMs = 3000) {
  const status = await checkCameraStatus(cameraId, timeoutMs);
  return status.status === PROTOCOL.CAMERA_STATUS.AVAILABLE;
}
