const GStreamerPipeline = require('./gstreamer-pipeline');
const createLogger = require('./logger');
const config = require('./config');
const { EventEmitter } = require('events');

/**
 * Agente principal de webcam
 */
class WebcamAgent extends EventEmitter {
  constructor(customConfig = {}) {
    super();
    
    this.config = { ...config, ...customConfig };
    this.logger = createLogger(this.config.agent.logLevel);
    this.pipeline = new GStreamerPipeline(this.config);
    this.reconnectAttempts = 0;
    this.isShuttingDown = false;
    this.healthCheckTimer = null;
    
    this.setupPipelineEvents();
  }

  /**
   * Configura los eventos del pipeline
   */
  setupPipelineEvents() {
    this.pipeline.on('started', () => {
      this.logger.info('Pipeline iniciado exitosamente');
      this.reconnectAttempts = 0;
      this.startHealthCheck();
      this.emit('streaming-started');
    });

    this.pipeline.on('info', (message) => {
      this.logger.info(message);
    });

    this.pipeline.on('warning', (message) => {
      this.logger.warn(message);
    });

    this.pipeline.on('error', (error) => {
      this.logger.error('Error en pipeline:', error.message);
      this.handlePipelineError(error);
    });

    this.pipeline.on('stdout', (data) => {
      this.logger.debug('GStreamer stdout:', data.trim());
    });

    this.pipeline.on('stderr', (data) => {
      this.logger.debug('GStreamer stderr:', data.trim());
    });
  }

  /**
   * Maneja errores del pipeline
   */
  async handlePipelineError(error) {
    if (this.isShuttingDown) {
      return;
    }

    this.stopHealthCheck();
    this.emit('streaming-error', error);

    if (this.reconnectAttempts < this.config.agent.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.logger.info(`Intento de reconexión ${this.reconnectAttempts}/${this.config.agent.maxReconnectAttempts}`);
      
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.pipeline.restart();
        }
      }, this.config.agent.reconnectInterval);
    } else {
      this.logger.error('Máximo número de intentos de reconexión alcanzado');
      this.emit('max-reconnect-attempts-reached');
    }
  }

  /**
   * Inicia el monitoreo de salud
   */
  startHealthCheck() {
    this.stopHealthCheck();
    
    this.healthCheckTimer = setInterval(() => {
      if (!this.pipeline.isRunning) {
        this.logger.warn('Pipeline no está ejecutándose durante health check');
        this.handlePipelineError(new Error('Pipeline stopped unexpectedly'));
      }
    }, this.config.agent.healthCheckInterval);
  }

  /**
   * Detiene el monitoreo de salud
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Verifica prerequisitos del sistema
   */
  async checkPrerequisites() {
    this.logger.info('Verificando prerequisitos...');

    // Verificar GStreamer
    const hasGStreamer = await GStreamerPipeline.checkGStreamer();
    if (!hasGStreamer) {
      throw new Error('GStreamer no está instalado o no está disponible en PATH');
    }
    this.logger.info('✓ GStreamer disponible');

    // Verificar dispositivo de video
    const fs = require('fs');
    try {
      await fs.promises.access(this.config.videoDevice);
      this.logger.info(`✓ Dispositivo de video disponible: ${this.config.videoDevice}`);
    } catch (error) {
      throw new Error(`Dispositivo de video no disponible: ${this.config.videoDevice}`);
    }

    // Listar dispositivos disponibles (informativo)
    try {
      const devices = await GStreamerPipeline.listVideoDevices();
      this.logger.info('Dispositivos de video disponibles:\n' + devices);
    } catch (error) {
      this.logger.warn('No se pudieron listar dispositivos de video:', error.message);
    }
  }

  /**
   * Inicia el agente
   */
  async start() {
    if (this.isShuttingDown) {
      throw new Error('El agente se está cerrando');
    }

    this.logger.info('Iniciando agente de webcam...');
    this.logger.info('Configuración:', {
      videoDevice: this.config.videoDevice,
      resolution: `${this.config.video.width}x${this.config.video.height}`,
      framerate: this.config.video.framerate,
      bitrate: this.config.encoding.videoBitrate,
      destination: `rtmp://${this.config.mediamtx.host}:${this.config.mediamtx.rtmpPort}/${this.config.mediamtx.streamPath}`
    });

    try {
      await this.checkPrerequisites();
      this.pipeline.start();
      this.emit('started');
    } catch (error) {
      this.logger.error('Error al iniciar el agente:', error.message);
      throw error;
    }
  }

  /**
   * Detiene el agente
   */
  async stop() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Deteniendo agente de webcam...');

    this.stopHealthCheck();
    
    if (this.pipeline) {
      this.pipeline.stop();
    }

    this.emit('stopped');
    this.logger.info('Agente detenido');
  }

  /**
   * Obtiene el estado actual
   */
  getStatus() {
    return {
      isRunning: this.pipeline ? this.pipeline.isRunning : false,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.agent.maxReconnectAttempts,
      isShuttingDown: this.isShuttingDown,
      config: {
        device: this.config.videoDevice,
        resolution: `${this.config.video.width}x${this.config.video.height}`,
        framerate: this.config.video.framerate,
        bitrate: this.config.encoding.videoBitrate,
        destination: `rtmp://${this.config.mediamtx.host}:${this.config.mediamtx.rtmpPort}/${this.config.mediamtx.streamPath}`
      }
    };
  }
}

module.exports = WebcamAgent;