/**
 * ============================================================================
 * CAMERA UTILITIES - Camera System TP3.0
 * ============================================================================
 */

import { spawn } from "child_process";
import { createLogger } from "./logger.js";
import { PROTOCOL } from "../../protocol/index.js";

const logger = createLogger("CAMERA");

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
      proc?.kill("SIGKILL");
      reject(new Error("Capture timeout"));
    }, timeoutMs);

    let proc;
    const chunks = [];

    try {
      logger.debug(`Capturing from ${cameraId}, ${width}x${height}, quality=${quality}`);

      // FFmpeg command para captura MJPEG nativa
      const args = [
        "-f", "v4l2",
        "-input_format", "mjpeg",
        "-video_size", `${width}x${height}`,
        "-i", cameraId,
        "-frames:v", "1",
        "-q:v", quality.toString(),
        "-f", "image2",
        "pipe:1"
      ];

      proc = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (chunk) => {
        chunks.push(chunk);
        
        // Verificar tamaño acumulado
        const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
        if (totalSize > maxImageBytes) {
          clearTimeout(timer);
          proc.kill("SIGKILL");
          reject(new Error(`Image too large: ${totalSize} > ${maxImageBytes}`));
        }
      });

      let stderrOutput = "";
      proc.stderr.on("data", (data) => {
        const output = data.toString();
        stderrOutput += output;
        
        // Log solo errores críticos, filtrar info normal de FFmpeg
        if (output.toLowerCase().includes("error") || 
            output.toLowerCase().includes("failed") ||
            output.toLowerCase().includes("invalid")) {
          logger.warn("FFmpeg error output:", output.trim());
        } else {
          logger.debug("FFmpeg info:", output.trim());
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);

        if (code !== 0) {
          // Incluir stderr en el error para mejor diagnóstico
          const errorMsg = stderrOutput ? 
            `FFmpeg exited with code ${code}: ${stderrOutput.trim()}` : 
            `FFmpeg exited with code ${code}`;
          reject(new Error(errorMsg));
          return;
        }

        if (chunks.length === 0) {
          reject(new Error("No image data captured"));
          return;
        }

        const imageBuffer = Buffer.concat(chunks);
        logger.debug(`Captured image: ${imageBuffer.length} bytes`);

        // Verificar que sea JPEG válido (magic bytes)
        if (imageBuffer.length < 2 || 
            imageBuffer[0] !== 0xFF || 
            imageBuffer[1] !== 0xD8) {
          reject(new Error("Invalid JPEG format"));
          return;
        }

        resolve({
          data: imageBuffer.toString("base64"),
          size: imageBuffer.length,
          format: PROTOCOL.IMAGE_FORMAT.JPEG,
          encoding: PROTOCOL.ENCODING.BASE64,
          width,
          height,
          quality,
          timestamp: Date.now(),
        });
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(new Error(`FFmpeg error: ${error.message}`));
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Verifica si una cámara está disponible
 */
export async function checkCameraStatus(cameraId, timeoutMs = 3000) {
  try {
    // Intento rápido de acceder al dispositivo
    const proc = spawn("ffprobe", [
      "-v", "quiet",
      "-f", "v4l2",
      "-i", cameraId,
      "-t", "0.1"
    ], {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: timeoutMs,
    });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve(PROTOCOL.CAMERA_STATUS.ERROR);
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? 
          PROTOCOL.CAMERA_STATUS.AVAILABLE : 
          PROTOCOL.CAMERA_STATUS.ERROR
        );
      });

      proc.on("error", () => {
        clearTimeout(timer);
        resolve(PROTOCOL.CAMERA_STATUS.NOT_FOUND);
      });
    });
  } catch (error) {
    return PROTOCOL.CAMERA_STATUS.ERROR;
  }
}
