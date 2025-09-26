const { spawn } = require('child_process');
const { EventEmitter } = require('events');

/**
 * Gestor de pipeline GStreamer
 */
class GStreamerPipeline extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.process = null;
    this.isRunning = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Construye el pipeline GStreamer
   */
  buildPipeline() {
    const { video, encoding, mediamtx, videoDevice } = this.config;

    // URL de destino RTMP
    const rtmpUrl = `rtmp://${mediamtx.host}:${mediamtx.rtmpPort}/${mediamtx.streamPath}`;

    // Pipeline GStreamer
    let pipeline = [
      // Fuente de video (webcam)
      'v4l2src',
      `device=${videoDevice}`,

      // Caps de entrada según formato
      '!'
    ];

    if (video.format === 'MJPG') {
      pipeline = pipeline.concat([
        `image/jpeg,width=${video.width},height=${video.height},framerate=${video.framerate}/1`,
        '!', 'jpegdec'
      ]);
    } else {
      pipeline = pipeline.concat([
        `video/x-raw,format=${video.format},width=${video.width},height=${video.height},framerate=${video.framerate}/1`
      ]);
    }

    // Continuar con el resto del pipeline
    pipeline = pipeline.concat([
      // Conversión de formato
      '!', 'videoconvert',

      // Encoder de video optimizado para WebRTC
      '!', encoding.videoCodec === 'x264' ? 'x264enc' : 'nvh264enc',
      `bitrate=${encoding.videoBitrate}`,
      `speed-preset=${encoding.preset}`,
      `tune=${encoding.tune}`,
      'key-int-max=30', // Keyframes más frecuentes para WebRTC
      'bframes=0', // Sin B-frames para menor latencia
      'cabac=false', // Desactivar CABAC para compatibilidad
      'dct8x8=false', // Desactivar DCT 8x8 para compatibilidad

      // Muxer FLV para RTMP
      '!', 'flvmux',
      'streamable=true',

      // Sink RTMP
      '!', 'rtmpsink',
      `location=${rtmpUrl}`,
      'sync=false' // No sincronizar con reloj del sistema
    ]);

    return pipeline;
  }

  /**
   * Inicia el pipeline
   */
  start() {
    if (this.isRunning) {
      this.emit('warning', 'Pipeline ya está ejecutándose');
      return;
    }

    const pipeline = this.buildPipeline();

    this.emit('info', `Iniciando pipeline GStreamer: gst-launch-1.0 ${pipeline.join(' ')}`);

    this.process = spawn('gst-launch-1.0', pipeline, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.isRunning = true;

    // Manejo de eventos del proceso
    this.process.stdout.on('data', (data) => {
      this.emit('stdout', data.toString());
    });

    this.process.stderr.on('data', (data) => {
      const output = data.toString();
      this.emit('stderr', output);

      // Detectar solo errores críticos reales
      if (output.includes('CRITICAL') || output.includes('FATAL') ||
        (output.includes('ERROR') && !output.includes('Internal data stream error'))) {
        this.emit('error', new Error(`GStreamer error: ${output.trim()}`));
      }
    });

    this.process.on('close', (code) => {
      this.isRunning = false;
      this.process = null;

      if (code === 0) {
        this.emit('info', 'Pipeline terminado correctamente');
      } else {
        this.emit('error', new Error(`Pipeline terminado con código: ${code}`));
      }
    });

    this.process.on('error', (error) => {
      this.isRunning = false;
      this.emit('error', error);
    });

    this.emit('started');
  }

  /**
   * Detiene el pipeline
   */
  stop() {
    if (!this.isRunning || !this.process) {
      return;
    }

    this.emit('info', 'Deteniendo pipeline...');

    // Enviar SIGTERM y luego SIGKILL si es necesario
    this.process.kill('SIGTERM');

    setTimeout(() => {
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
      }
    }, 5000);
  }

  /**
   * Reinicia el pipeline
   */
  restart() {
    this.emit('info', 'Reiniciando pipeline...');
    this.stop();

    setTimeout(() => {
      this.start();
    }, 2000);
  }

  /**
   * Verifica si GStreamer está disponible
   */
  static async checkGStreamer() {
    return new Promise((resolve) => {
      const process = spawn('gst-launch-1.0', ['--version'], {
        stdio: 'ignore'
      });

      process.on('close', (code) => {
        resolve(code === 0);
      });

      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Lista dispositivos de video disponibles
   */
  static async listVideoDevices() {
    return new Promise((resolve, reject) => {
      const process = spawn('v4l2-ctl', ['--list-devices'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error('No se pudo listar dispositivos de video'));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}

module.exports = GStreamerPipeline;
