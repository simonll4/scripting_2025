import { spawn, ChildProcess } from 'child_process';
import { CONFIG } from '../config';

export class StreamProcessor {
  private activeStreams: Map<string, ChildProcess> = new Map();

  startSessionStream(
    sessionId: string,
    device: string = CONFIG.DEVICE_PATH,
    customArgs: string[] = []
  ): string {
    // Si ya existe un stream para esta sesión, detenerlo primero
    if (this.activeStreams.has(sessionId)) {
      this.stopSessionStream(sessionId);
    }

    const streamPath = `sess-${sessionId}`;
    const rtspUrl = `${CONFIG.MEDIAMTX_URL}/${streamPath}`;

    // Construir pipeline GStreamer
    const gstPipeline = this.buildGStreamerPipeline(device, rtspUrl, customArgs);

    console.log(`🎥 Starting stream for session ${sessionId}: ${gstPipeline.join(' ')}`);

    try {
      const gstProcess = spawn('gst-launch-1.0', gstPipeline, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      gstProcess.stdout?.on('data', (data) => {
        console.log(`[GStreamer ${sessionId}] ${data.toString().trim()}`);
      });

      gstProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (!message.includes('0:00:')) { // Filtrar mensajes de tiempo
          console.log(`[GStreamer ${sessionId}] ${message}`);
        }
      });

      gstProcess.on('error', (error) => {
        console.error(`❌ GStreamer error for session ${sessionId}:`, error);
        this.activeStreams.delete(sessionId);
      });

      gstProcess.on('exit', (code, signal) => {
        console.log(`🔚 GStreamer process for session ${sessionId} exited: code=${code}, signal=${signal}`);
        this.activeStreams.delete(sessionId);
      });

      // Almacenar referencia al proceso
      this.activeStreams.set(sessionId, gstProcess);

      return rtspUrl;
    } catch (error) {
      console.error(`❌ Failed to start stream for session ${sessionId}:`, error);
      throw error;
    }
  }

  stopSessionStream(sessionId: string): void {
    const process = this.activeStreams.get(sessionId);
    
    if (process) {
      console.log(`🛑 Stopping stream for session ${sessionId}`);
      
      // Intentar cerrar gracefully
      process.kill('SIGTERM');
      
      // Forzar cierre después de 5 segundos
      setTimeout(() => {
        if (!process.killed) {
          console.log(`🔨 Force killing stream for session ${sessionId}`);
          process.kill('SIGKILL');
        }
      }, 5000);

      this.activeStreams.delete(sessionId);
    } else {
      console.log(`⚠️ No active stream found for session ${sessionId}`);
    }
  }

  private buildGStreamerPipeline(device: string, rtspUrl: string, customArgs: string[]): string[] {
    if (customArgs.length > 0) {
      return customArgs;
    }

    // Parse video size
    const [width, height] = CONFIG.VIDEO_SIZE.split('x').map(Number);
    const framerate = CONFIG.FRAME_RATE;

    // Default pipeline para v4l2 device
    if (device.startsWith('/dev/video')) {
      return [
        'v4l2src', `device=${device}`,
        '!', 'videoconvert',
        '!', `video/x-raw,width=${width},height=${height},framerate=${framerate}/1`,
        '!', 'x264enc', 'bitrate=2000', 'tune=zerolatency', 'speed-preset=ultrafast',
        '!', 'h264parse',
        '!', 'rtspclientsink', `location=${rtspUrl}`
      ];
    }

    // Pipeline para RTSP source
    if (device.startsWith('rtsp://')) {
      return [
        'rtspsrc', `location=${device}`, 'latency=200',
        '!', 'rtph264depay',
        '!', 'h264parse',
        '!', 'avdec_h264',
        '!', 'videoconvert',
        '!', `video/x-raw,width=${width},height=${height}`,
        '!', 'x264enc', 'bitrate=2000', 'tune=zerolatency',
        '!', 'h264parse',
        '!', 'rtspclientsink', `location=${rtspUrl}`
      ];
    }

    // Test source para desarrollo
    if (device === 'test') {
      return [
        'videotestsrc', 'pattern=ball',
        '!', `video/x-raw,width=${width},height=${height},framerate=${framerate}/1`,
        '!', 'x264enc', 'bitrate=1000', 'tune=zerolatency',
        '!', 'h264parse',
        '!', 'rtspclientsink', `location=${rtspUrl}`
      ];
    }

    throw new Error(`Unsupported device type: ${device}`);
  }

  getActiveStreams(): string[] {
    return Array.from(this.activeStreams.keys());
  }

  isStreamActive(sessionId: string): boolean {
    return this.activeStreams.has(sessionId);
  }

  stopAllStreams(): void {
    console.log(`🛑 Stopping all active streams (${this.activeStreams.size})`);
    
    for (const sessionId of this.activeStreams.keys()) {
      this.stopSessionStream(sessionId);
    }
  }

  // Test de connectividad con GStreamer
  static async testGStreamerAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const testProcess = spawn('gst-launch-1.0', ['--version'], { stdio: 'pipe' });
      
      testProcess.on('exit', (code) => {
        resolve(code === 0);
      });

      testProcess.on('error', () => {
        resolve(false);
      });

      // Timeout
      setTimeout(() => {
        testProcess.kill();
        resolve(false);
      }, 5000);
    });
  }

  // Test de dispositivo V4L2
  static async testVideoDevice(device: string): Promise<boolean> {
    if (!device.startsWith('/dev/video')) {
      return true; // Asumir que otros tipos son válidos
    }

    return new Promise((resolve) => {
      const testProcess = spawn('v4l2-ctl', ['--device', device, '--list-formats'], { stdio: 'pipe' });
      
      testProcess.on('exit', (code) => {
        resolve(code === 0);
      });

      testProcess.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        testProcess.kill();
        resolve(false);
      }, 3000);
    });
  }
}