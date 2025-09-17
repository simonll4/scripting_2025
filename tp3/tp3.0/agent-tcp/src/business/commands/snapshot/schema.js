/**
 * ============================================================================
 * SNAPSHOT COMMAND SCHEMA
 * ============================================================================
 * Esquema JSON para validación de requests SNAPSHOT usando AJV
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

// Crear instancia AJV con formatos adicionales
const ajv = new Ajv({
  allErrors: true,
  removeAdditional: false,
  useDefaults: true,
  coerceTypes: true,
});
addFormats(ajv);

/**
 * Esquema para el payload del comando SNAPSHOT
 */
export const snapshotSchema = {
  type: "object",
  properties: {
    cameraId: {
      type: "string",
      minLength: 1,
      pattern: "^/dev/video\\d+$",
      description: "Device path de la cámara (ej: /dev/video0)",
    },
    topic: {
      type: "string",
      minLength: 1,
      pattern: "^[a-zA-Z0-9/_-]+$",
      description: "Topic MQTT donde publicar (ej: cameras/lab/cam01/snapshot)",
    },
    width: {
      type: "integer",
      minimum: 160,
      maximum: 7680,
      description: "Ancho en píxeles (160-7680)",
    },
    height: {
      type: "integer",
      minimum: 120,
      maximum: 4320,
      description: "Alto en píxeles (120-4320)",
    },
    quality: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description: "Calidad JPEG (1=mínima, 100=máxima)",
    },
    qualityPreset: {
      type: "string",
      enum: ["max", "fast", ""],
      description:
        "Preset de calidad: 'max'=RAW+reencode, 'fast'=MJPEG+copy, ''=default",
    },
  },
  required: ["cameraId"],
  additionalProperties: false,
};

/**
 * Validador compilado para mejor performance
 */
export const validateSnapshot = ajv.compile(snapshotSchema);

/**
 * Función helper para validar y normalizar payload con defaults de config
 */
export function validateAndNormalize(data, config) {
  // Aplicar defaults de config antes de validar
  const payload = {
    cameraId: data?.cameraId ?? config.DEFAULT_CAMERA,
    topic: data?.topic ?? config.DEFAULT_TOPIC,
    width: data?.width ?? config.SNAP_WIDTH ?? 1920,
    height: data?.height ?? config.SNAP_HEIGHT ?? 1080,
    quality: data?.quality ?? config.SNAP_QUALITY ?? 95,
    qualityPreset: data?.qualityPreset ?? "",
  };

  // Validar con AJV
  const isValid = validateSnapshot(payload);

  if (!isValid) {
    const errors = validateSnapshot.errors
      .map((err) => {
        const field =
          err.instancePath.replace("/", "") ||
          err.params?.missingProperty ||
          "root";
        return `${field}: ${err.message}`;
      })
      .join(", ");

    throw new Error(`validation:schema-error: ${errors}`);
  }

  return {
    cameraId: payload.cameraId,
    topic: payload.topic,
    width: payload.width,
    height: payload.height,
    quality: payload.quality,
    preset: payload.qualityPreset.toLowerCase(),
  };
}

/**
 * Esquemas de ejemplo para documentación
 */
export const examples = {
  highQuality: {
    act: "SNAPSHOT",
    data: {
      cameraId: "/dev/video0",
      topic: "cameras/obra01/cam01/snapshot",
      width: 1920,
      height: 1080,
      quality: 95,
      qualityPreset: "max",
    },
  },

  lowLatency: {
    act: "SNAPSHOT",
    data: {
      cameraId: "/dev/video0",
      topic: "cameras/obra01/cam01/snapshot",
      width: 1280,
      height: 720,
      quality: 80,
      qualityPreset: "fast",
    },
  },

  customResolution: {
    act: "SNAPSHOT",
    data: {
      cameraId: "/dev/video0",
      topic: "cameras/obra01/cam01/snapshot",
      width: 2560,
      height: 1440,
    },
  },

  minimal: {
    act: "SNAPSHOT",
    data: {
      cameraId: "/dev/video0",
    },
  },
};
