/**
 * Configuración del agente de webcam
 */

module.exports = {
  // Dispositivo de video (webcam)
  videoDevice: process.env.VIDEO_DEVICE || "/dev/video0",

  // Resolución y framerate
  video: {
    width: parseInt(process.env.VIDEO_WIDTH) || 640,
    height: parseInt(process.env.VIDEO_HEIGHT) || 480,
    framerate: parseInt(process.env.VIDEO_FPS) || 30,
    format: process.env.VIDEO_FORMAT || "MJPG", // MJPG funciona bien
  },

  // Configuración de encoding
  encoding: {
    // Codec de video (x264 es más compatible)
    videoCodec: process.env.VIDEO_CODEC || "x264",
    // Bitrate en kbps
    videoBitrate: parseInt(process.env.VIDEO_BITRATE) || 1000,
    // Preset de encoding (ultrafast, fast, medium, slow)
    preset: process.env.X264_PRESET || "ultrafast",
    // Tune para webcam/streaming
    tune: process.env.X264_TUNE || "zerolatency",
  },

  // Servidor MediaMTX
  mediamtx: {
    host: process.env.MEDIAMTX_HOST || "localhost",
    rtmpPort: parseInt(process.env.MEDIAMTX_RTMP_PORT) || 1935,
    streamPath: process.env.STREAM_PATH || "webcam",
  },

  // Configuración del agente
  agent: {
    // Intentos de reconexión
    maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS) || 5,
    // Intervalo entre intentos de reconexión (ms)
    reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL) || 5000,
    // Tiempo de espera para salud del stream (ms)
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 10000,
    // Logging
    logLevel: process.env.LOG_LEVEL || "info",
  },
};
