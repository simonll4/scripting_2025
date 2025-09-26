const RECONNECT_DELAY_MS = 2000;

class WebRTCPlayer {
  constructor({
    video,
    statusEl,
    overlay,
    controls,
    pathInput,
    autoPlayCheckbox,
    stats,
    muteButton,
  }) {
    this.video = video;
    this.statusEl = statusEl;
    this.overlay = overlay;
    this.controls = controls;
    this.pathInput = pathInput;
    this.autoPlayCheckbox = autoPlayCheckbox;
    this.stats = stats;
    this.muteButton = muteButton;

    this.peer = null;
    this.fetchController = null;
    this.statsTimer = null;
    this.prevVideoStats = null;
    this.reconnectTimer = null;
    this.state = 'idle';
    this.streamPath = this.loadStreamPath();

    this.pathInput.value = this.streamPath;
    this.video.muted = true;
    this.updateMuteButton();
  }

  init() {
    this.controls.play.addEventListener('click', () => this.play());
    this.controls.stop.addEventListener('click', () => this.stop());
    this.controls.fullscreen.addEventListener('click', () => this.toggleFullscreen());
    this.muteButton.addEventListener('click', () => this.toggleMute());

    this.autoPlayCheckbox.addEventListener('change', () => {
      window.localStorage.setItem('webrtc.autoplay', this.autoPlayCheckbox.checked ? '1' : '0');
    });

    this.controls.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const newPath = this.pathInput.value.trim();
      if (newPath && newPath !== this.streamPath) {
        this.setStreamPath(newPath);
        if (this.autoPlayCheckbox.checked) {
          this.play();
        } else {
          this.setState('idle', `Listo para conectar al stream ${newPath}.`);
        }
      }
    });

    if (this.autoPlayCheckbox.checked) {
      this.play();
    } else {
      this.setState('idle', 'Listo para conectar al stream.');
    }
  }

  loadStreamPath() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('path');
    const fromStorage = window.localStorage.getItem('webrtc.streamPath');
    const fallback = 'webcam';

    const path = fromQuery || fromStorage || fallback;
    this.autoPlayCheckbox.checked = window.localStorage.getItem('webrtc.autoplay') !== '0';
    return path;
  }

  setStreamPath(path) {
    this.streamPath = path;
    window.localStorage.setItem('webrtc.streamPath', path);
  }

  getWhepUrl() {
    const encodedStreamPath = encodeURIComponent(this.streamPath);
    return `/webrtc/whep/${encodedStreamPath}`;
  }

  getRTCConfig() {
    const storedIceServers = window.localStorage.getItem('webrtc.iceServers');
    
    // Configuración por defecto con servidores STUN públicos
    const defaultConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };
    
    if (!storedIceServers) {
      return defaultConfig;
    }

    try {
      return { iceServers: JSON.parse(storedIceServers) };
    } catch (error) {
      console.warn('No se pudo parsear iceServers guardados, usando configuración por defecto:', error);
      return defaultConfig;
    }
  }

  async play() {
    await this.stop({ silent: true });

    try {
      this.clearReconnect();
      this.setState('connecting', 'Iniciando sesión WebRTC...');
      this.controls.play.disabled = true;
      this.controls.stop.disabled = false;

      this.peer = new RTCPeerConnection(this.getRTCConfig());
      this.peer.addEventListener('track', (event) => this.onTrack(event));
      this.peer.addEventListener('connectionstatechange', () => this.onConnectionStateChange());
      this.peer.addEventListener('iceconnectionstatechange', () => this.onIceStateChange());

      const offer = await this.peer.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true });
      await this.peer.setLocalDescription(offer);
      await this.waitForIceGathering();

      this.fetchController = new AbortController();
      // Debug: Log the SDP being sent
      console.log('Sending SDP to WHEP:', this.peer.localDescription.sdp);
      
      const response = await fetch(this.getWhepUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/sdp' },
        body: this.peer.localDescription.sdp,
        signal: this.fetchController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('WHEP Error Response:', errorText);
        throw new Error(`WHEP respondió ${response.status}: ${errorText}`);
      }

      const answer = await response.text();
      await this.peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answer }));
      this.setState('connecting', 'Esperando flujo remoto...');
      this.startStatsLoop();
    } catch (error) {
      console.error('Fallo al iniciar WebRTC:', error);
      this.handleError(error);
    }
  }

  async stop({ silent = false } = {}) {
    this.clearReconnect();
    if (this.fetchController) {
      this.fetchController.abort();
      this.fetchController = null;
    }

    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }

    this.prevVideoStats = null;

    if (this.peer) {
      this.peer.getSenders().forEach((sender) => sender.track && sender.track.stop());
      this.peer.getReceivers().forEach((receiver) => receiver.track && receiver.track.stop());
      this.peer.close();
      this.peer = null;
    }

    if (!silent) {
      this.setState('idle', 'Stream detenido.');
    }

    this.video.srcObject = null;
    this.controls.play.disabled = false;
    this.controls.stop.disabled = true;
    this.updateStatsValues({
      bitrate: '-',
      fps: '-',
      resolution: '-',
      connection: 'Desconectado',
      codec: '-',
    });
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.video.requestFullscreen().catch((error) => console.error('No se pudo poner en pantalla completa:', error));
    } else {
      document.exitFullscreen().catch((error) => console.error('No se pudo salir de pantalla completa:', error));
    }
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.updateMuteButton();
  }

  updateMuteButton() {
    this.muteButton.textContent = this.video.muted ? '🔈 Activar audio' : '🔇 Silenciar';
  }

  onTrack(event) {
    this.video.srcObject = event.streams[0];
    const [track] = event.streams;
    if (track && track.getVideoTracks) {
      this.setState('live', 'Stream WebRTC en vivo.');
    }
  }

  onConnectionStateChange() {
    if (!this.peer) {
      return;
    }

    const state = this.peer.connectionState;
    this.updateStatsValues({ connection: state });

    if (state === 'connected') {
      this.setState('live', 'Stream WebRTC en vivo.');
    }

    if (state === 'failed' || state === 'disconnected') {
      this.handleError(new Error(`Conexión ${state}`));
    }
  }

  onIceStateChange() {
    if (!this.peer) {
      return;
    }

    const state = this.peer.iceConnectionState;
    if (state === 'failed' || state === 'disconnected') {
      this.handleError(new Error(`ICE ${state}`));
    }
  }

  async waitForIceGathering() {
    if (!this.peer) {
      return;
    }

    if (this.peer.iceGatheringState === 'complete') {
      return;
    }

    await new Promise((resolve) => {
      const checkState = () => {
        if (this.peer && this.peer.iceGatheringState === 'complete') {
          this.peer.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      this.peer.addEventListener('icegatheringstatechange', checkState);
    });
  }

  startStatsLoop() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
    }

    this.statsTimer = setInterval(async () => {
      if (!this.peer) {
        return;
      }

      try {
        const stats = await this.peer.getStats();
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            this.updateVideoStats(report);

            if (report.codecId) {
              const codec = stats.get(report.codecId);
              if (codec && codec.mimeType) {
                this.stats.codec.textContent = codec.mimeType.toUpperCase();
              }
            }
          }
        });

        const width = this.video.videoWidth;
        const height = this.video.videoHeight;
        if (width && height) {
          this.stats.resolution.textContent = `${width}×${height}`;
        }
      } catch (error) {
        console.debug('No se pudieron obtener stats:', error);
      }
    }, 1000);
  }

  updateVideoStats(report) {
    if (!report) {
      return;
    }

    if (this.prevVideoStats) {
      const bytesDiff = report.bytesReceived - this.prevVideoStats.bytesReceived;
      const timeDiff = report.timestamp - this.prevVideoStats.timestamp; // ms
      const framesDiff = (report.framesDecoded || 0) - (this.prevVideoStats.framesDecoded || 0);

      if (timeDiff > 0 && bytesDiff >= 0) {
        const bitrateKbps = (bytesDiff * 8) / (timeDiff / 1000) / 1000;
        this.stats.bitrate.textContent = `${bitrateKbps.toFixed(1)} kbps`;
      }

      if (timeDiff > 0 && framesDiff >= 0) {
        const fps = (framesDiff * 1000) / timeDiff;
        this.stats.fps.textContent = `${fps.toFixed(1)} fps`;
      }
    }

    this.prevVideoStats = {
      timestamp: report.timestamp,
      bytesReceived: report.bytesReceived,
      framesDecoded: report.framesDecoded,
    };
  }

  updateStatsValues({ bitrate, fps, resolution, connection, codec } = {}) {
    if (bitrate) {
      this.stats.bitrate.textContent = bitrate;
    }
    if (fps) {
      this.stats.fps.textContent = fps;
    }
    if (resolution) {
      this.stats.resolution.textContent = resolution;
    }
    if (connection) {
      this.stats.connection.textContent = connection;
    }
    if (codec) {
      this.stats.codec.textContent = codec;
    }
  }

  handleError(error) {
    console.error('[WebRTC] Error:', error);
    this.setState('error', `Error de conexión: ${error.message}`);
    this.stop({ silent: true }).catch(() => {});
    this.controls.play.disabled = false;
    this.controls.stop.disabled = true;

    if (this.autoPlayCheckbox.checked) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.play();
    }, RECONNECT_DELAY_MS);
  }

  clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  setState(state, message) {
    this.state = state;
    this.statusEl.className = `status status--${state}`;
    this.statusEl.textContent = message;

    if (state === 'live') {
      this.overlay.style.opacity = '0';
      this.overlay.textContent = '';
    } else if (state === 'error') {
      this.overlay.style.opacity = '1';
      this.overlay.textContent = 'Sin señal - intentando reconectar...';
    } else if (state === 'connecting') {
      this.overlay.style.opacity = '1';
      this.overlay.textContent = 'Conectando al stream WebRTC...';
    } else {
      this.overlay.style.opacity = '1';
      this.overlay.textContent = 'Stream detenido.';
    }
  }
}

function setupUI() {
  const player = new WebRTCPlayer({
    video: document.getElementById('webrtcPlayer'),
    statusEl: document.getElementById('status'),
    overlay: document.getElementById('overlay'),
    controls: {
      play: document.getElementById('play'),
      stop: document.getElementById('stop'),
      fullscreen: document.getElementById('fullscreen'),
      form: document.getElementById('streamForm'),
    },
    pathInput: document.getElementById('streamPath'),
    autoPlayCheckbox: document.getElementById('autoPlay'),
    stats: {
      connection: document.getElementById('stat-connection'),
      resolution: document.getElementById('stat-resolution'),
      bitrate: document.getElementById('stat-bitrate'),
      fps: document.getElementById('stat-fps'),
      codec: document.getElementById('stat-codec'),
    },
    muteButton: document.getElementById('mute'),
  });

  player.init();

  window.addEventListener('beforeunload', () => player.stop());
}

document.addEventListener('DOMContentLoaded', setupUI);
