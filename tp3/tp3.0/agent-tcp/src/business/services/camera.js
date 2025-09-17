/**
 * ============================================================================
 * CAMERA SERVICE
 * ============================================================================
 * Objetivo:
 *  - Capturar un frame JPEG de alta calidad desde /dev/videoX
 *  - Controlar calidad real vía qscale (MJPEG: menor = mejor)
 *  - Opcional: RAW/YUYV + reencode (calidad consistente) o MJPEG+copy (rápido)
 *  - Devolver la imagen en BASE64 (para publicar por MQTT)
 */

import { spawn } from "child_process";
import { createLogger } from "../../../../utils/logger.js";
import { PROTOCOL } from "../../../../protocol/index.js";

const logger = createLogger("CAMERA-SERVICE");

// ------------------------------------ Helpers ------------------------------------

/**
 * Mapea quality (1..100) → qscale (2..31) para MJPEG:
 * - 100 → 2 (máxima calidad)
 * -   1 → 31 (mínima calidad)
 * Notar que qscale controla la cantidad de compresión del encoder MJPEG.
 */
function mapQualityToQscale(q) {
  const clamped = Math.max(1, Math.min(100, Math.floor(q)));
  // Fórmula invertida (corregida): 100 ↦ 2, 1 ↦ 31
  const qscale = Math.round(31 - (29 * (clamped - 1)) / 99);
  return Math.max(2, Math.min(31, qscale));
}

/**
 * Spawnea ffmpeg con timeout de seguridad.
 * Devuelve { proc, clear } para poder limpiar el timer en cualquier outcome.
 */
function spawnFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let proc;
    let timer;
    try {
      proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

      // Timer de guardia para evitar procesos colgados
      timer = setTimeout(() => {
        try {
          proc?.kill("SIGTERM");
        } catch {}
        reject(new Error("Snapshot timeout"));
      }, timeoutMs);

      resolve({ proc, clear: () => clearTimeout(timer) });
    } catch (error) {
      if (timer) clearTimeout(timer);
      reject(error);
    }
  });
}

// ----------------------------------- Captura ------------------------------------

/**
 * Captura un snapshot JPEG y lo devuelve en base64 con metadatos.
 *
 * Parámetros:
 *  - preferRAW:   usar formato YUYV/RAW y reencode → calidad consistente (recomendado)
 *  - preferMJPEG: pedir MJPEG al dispositivo (rápido; calidad depende del encoder del device)
 *  - reencode:    si true, forzamos "-c:v mjpeg -q:v <qscale>"; si false y viene MJPEG, usamos "copy"
 *  - width/height/quality: controles de resolución y compresión
 */
export async function captureSnapshot({
  cameraId,
  width = 1920,
  height = 1080,
  quality = 95,
  timeoutMs = 7000,
  maxImageBytes = 12_582_912, // ~12 MiB
  preferRAW = true,
  preferMJPEG = false,
  reencode = true,
}) {
  const qscale = mapQualityToQscale(quality);

  // Flags básicos de ffmpeg (silencioso, cola de entrada, fuente v4l2)
  const baseArgs = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-thread_queue_size",
    "64",
    "-f",
    "v4l2",
    ...(preferRAW ? ["-input_format", "yuyv422"] : []),
    ...(preferMJPEG ? ["-input_format", "mjpeg"] : []),
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    "30", // estabiliza la fuente
    "-i",
    cameraId,
    "-frames:v",
    "1", // un único frame
  ];

  // Elegir encoder de salida:
  // - reencode=true → control de calidad consistente vía qscale
  // - reencode=false → si la fuente es MJPEG, evitamos recomprimir (copy)
  const encodeArgs = reencode
    ? [
        "-c:v",
        "mjpeg",
        "-q:v",
        String(qscale),
        "-huffman",
        "optimal",
        "-f",
        "image2",
      ]
    : ["-c:v", "copy", "-f", "image2"];

  const args = [...baseArgs, ...encodeArgs, "pipe:1"];

  logger.debug(
    `FFmpeg ${cameraId} ${width}x${height} quality=${quality} (qscale=${qscale}) ` +
      `preferRAW=${preferRAW} preferMJPEG=${preferMJPEG} reencode=${reencode}`
  );

  const { proc, clear } = await spawnFfmpeg(args, timeoutMs);

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let stderrTxt = "";

    // Recolectar datos binarios de la imagen
    proc.stdout.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxImageBytes) {
        try {
          proc.kill("SIGTERM");
        } catch {}
        clear();
        reject(new Error(`Image too large: ${total} > ${maxImageBytes}`));
        return;
      }
      chunks.push(chunk);
    });

    // Capturar salida de errores de ffmpeg para diagnóstico
    proc.stderr.on("data", (d) => {
      stderrTxt += d.toString();
    });

    // Cierre exitoso o con error
    const finish = (code) => {
      clear();

      if (code !== 0) {
        reject(new Error(`FFmpeg failed (${code}): ${stderrTxt}`));
        return;
      }
      if (chunks.length === 0) {
        reject(new Error("No image data captured"));
        return;
      }

      const buf = Buffer.concat(chunks);

      // Validación mínima de JPEG: SOI 0xFFD8 y EOI 0xFFD9
      const isJpeg =
        buf.length > 4 &&
        buf[0] === 0xff &&
        buf[1] === 0xd8 &&
        buf[buf.length - 2] === 0xff &&
        buf[buf.length - 1] === 0xd9;

      if (!isJpeg) {
        reject(new Error("Invalid JPEG data"));
        return;
      }

      logger.debug(
        `Captured ${buf.length} bytes ${width}x${height} q=${quality} (${cameraId})`
      );

      resolve({
        data: buf.toString("base64"), // ← BASE64 listo para MQTT/JSON
        format: PROTOCOL.IMAGE_FORMAT.JPEG, // o "image/jpeg" si preferís MIME explícito
        encoding: PROTOCOL.ENCODING.BASE64,
        size: buf.length,
        width,
        height,
        cameraId,
        quality,
      });
    };

    // Consolidar handlers
    proc.once("close", finish);
    proc.once("exit", finish);
    proc.once("error", (e) => {
      clear();
      reject(e);
    });
  });
}

// import { spawn } from "child_process";
// import { createLogger } from "../../../utils/logger.js";
// import { PROTOCOL } from "../../../protocol/index.js";

// const logger = createLogger("CAMERA-SERVICE");

// /** Mapea quality (1..100) → qscale (2..31). En MJPEG: 2 = mejor calidad, 31 = peor. */
// function mapQualityToQscale(q) {
//   const clamped = Math.max(1, Math.min(100, Math.floor(q)));
//   // 100 → 2 (máxima calidad), 1 → 31 (mínima calidad) - CORREGIDO
//   const qscale = Math.round(31 - (29 * (clamped - 1) / 99));
//   return Math.max(2, Math.min(31, qscale));
// }

// /**
//  * Ejecuta ffmpeg con timeout de seguridad.
//  * Devuelve el proceso + una función clear() para limpiar el timer.
//  */
// function spawnFfmpeg(args, timeoutMs) {
//   return new Promise((resolve, reject) => {
//     let proc;
//     let timer;
//     try {
//       proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

//       timer = setTimeout(() => {
//         try {
//           proc?.kill("SIGTERM");
//         } catch {}
//         reject(new Error("Snapshot timeout"));
//       }, timeoutMs);

//       resolve({ proc, clear: () => clearTimeout(timer) });
//     } catch (error) {
//       if (timer) clearTimeout(timer);
//       reject(error);
//     }
//   });
// }

// /**
//  * Captura un snapshot JPEG de alta calidad.
//  *
//  * Parámetros clave:
//  *  - preferRAW:     si true, usamos YUYV/RAW + reencode (mejor calidad; recomendado)
//  *  - preferMJPEG:   si true, pedimos MJPEG del dispositivo (rápido; calidad variable)
//  *  - reencode:      si true, re-codificamos a JPEG controlando calidad (qscale bajo)
//  *  - width/height:  resolución deseada (idealmente nativa del sensor para evitar reescale)
//  *  - quality:       1..100 (se mapea a qscale 2..31)
//  */
// export async function captureSnapshot({
//   cameraId,
//   width = 1920, // más alta por defecto para mejorar detalle
//   height = 1080,
//   quality = 95, // cerca de tope, qscale≈2–3
//   timeoutMs = 7000, // un poco más generoso que 5000 ms
//   maxImageBytes = 12_582_912, // ~12 MiB (subido por calidad/reso)
//   preferRAW = true, // preferimos RAW/YUYV (mejor base para JPEG)
//   preferMJPEG = false, // MJPEG del device deshabilitado por defecto
//   reencode = true, // re-encode controlado para consistencia
// }) {
//   const qscale = mapQualityToQscale(quality);

//   // Construcción de args base: flags estables y silenciosos
//   const baseArgs = [
//     "-nostdin",
//     "-hide_banner",
//     "-loglevel",
//     "error",
//     "-thread_queue_size",
//     "64",
//     "-f",
//     "v4l2",
//     // Elegimos el formato de entrada:
//     ...(preferRAW ? ["-input_format", "yuyv422"] : []),
//     ...(preferMJPEG ? ["-input_format", "mjpeg"] : []),
//     "-video_size",
//     `${width}x${height}`,
//     "-framerate",
//     "30", // framerate estable
//     "-i",
//     cameraId,
//     "-frames:v",
//     "1", // capturar 1 frame
//   ];

//   /**
//    * Selección del encoder de salida para máxima calidad JPEG:
//    *  - Si reencode=true → usamos MJPEG con qscale optimizado
//    *  - Si reencode=false y source es MJPEG → copiamos (copy)
//    */
//   const encodeArgs = reencode
//     ? [
//         "-c:v", "mjpeg",
//         "-q:v", String(qscale),
//         "-huffman", "optimal", // Huffman optimizado para mejor compresión
//         "-f", "image2"
//       ]
//     : ["-c:v", "copy", "-f", "image2"];

//   const args = [...baseArgs, ...encodeArgs, "pipe:1"];

//   logger.debug(
//     `FFmpeg ${cameraId} ${width}x${height} quality=${quality} (qscale=${qscale}) ` +
//       `preferRAW=${preferRAW} preferMJPEG=${preferMJPEG} reencode=${reencode}`
//   );

//   const { proc, clear } = await spawnFfmpeg(args, timeoutMs);

//   return new Promise((resolve, reject) => {
//     const chunks = [];
//     let total = 0;
//     let stderrTxt = "";

//     // Recolectamos la salida (JPEG) cuidando el límite
//     proc.stdout.on("data", (chunk) => {
//       total += chunk.length;
//       if (total > maxImageBytes) {
//         try {
//           proc.kill("SIGTERM");
//         } catch {}
//         clear();
//         reject(new Error(`Image too large: ${total} > ${maxImageBytes}`));
//         return;
//       }
//       chunks.push(chunk);
//     });

//     // Guardamos logs de error de ffmpeg
//     proc.stderr.on("data", (d) => {
//       stderrTxt += d.toString();
//     });

//     // Finalización (close/exit)
//     const finish = (code) => {
//       clear();
//       if (code !== 0) {
//         reject(new Error(`FFmpeg failed (${code}): ${stderrTxt}`));
//         return;
//       }
//       if (chunks.length === 0) {
//         reject(new Error("No image data captured"));
//         return;
//       }

//       const buf = Buffer.concat(chunks);

//       // Validación rápida de JPEG: SOI y EOI
//       const isJpeg =
//         buf.length > 4 &&
//         buf[0] === 0xff &&
//         buf[1] === 0xd8 && // SOI
//         buf[buf.length - 2] === 0xff &&
//         buf[buf.length - 1] === 0xd9; // EOI

//       if (!isJpeg) {
//         reject(new Error("Invalid JPEG data"));
//         return;
//       }

//       logger.debug(
//         `Captured ${buf.length} bytes ${width}x${height} q=${quality} (${cameraId})`
//       );

//       resolve({
//         data: buf.toString("base64"), // ← BASE64 para MQTT
//         format: PROTOCOL.IMAGE_FORMAT.JPEG, // o "image/jpeg" si preferís MIME explícito
//         encoding: PROTOCOL.ENCODING.BASE64,
//         size: buf.length,
//         width,
//         height,
//         cameraId,
//         quality,
//       });
//     };

//     proc.on("close", finish);
//     proc.on("exit", finish);
//     proc.on("error", (e) => {
//       clear();
//       reject(e);
//     });
//   });
// }
