"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamProcessor = void 0;
const child_process_1 = require("child_process");
const config_1 = require("../config");
class StreamProcessor {
    constructor() {
        this.activeStreams = new Map();
    }
    startSessionStream(sessionId, device = config_1.CONFIG.DEVICE_PATH, customArgs = []) {
        // Si ya existe un stream para esta sesión, detenerlo primero
        if (this.activeStreams.has(sessionId)) {
            this.stopSessionStream(sessionId);
        }
        const streamPath = `sess-${sessionId}`;
        const rtspUrl = `${config_1.CONFIG.MEDIAMTX_URL}/${streamPath}`;
        // Construir pipeline GStreamer
        const gstPipeline = this.buildGStreamerPipeline(device, rtspUrl, customArgs);
        console.log(`🎥 Starting stream for session ${sessionId}: ${gstPipeline.join(' ')}`);
        try {
            const gstProcess = (0, child_process_1.spawn)('gst-launch-1.0', gstPipeline, {
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
        }
        catch (error) {
            console.error(`❌ Failed to start stream for session ${sessionId}:`, error);
            throw error;
        }
    }
    stopSessionStream(sessionId) {
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
        }
        else {
            console.log(`⚠️ No active stream found for session ${sessionId}`);
        }
    }
    buildGStreamerPipeline(device, rtspUrl, customArgs) {
        if (customArgs.length > 0) {
            return customArgs;
        }
        // Parse video size
        const [width, height] = config_1.CONFIG.VIDEO_SIZE.split('x').map(Number);
        const framerate = config_1.CONFIG.FRAME_RATE;
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
    getActiveStreams() {
        return Array.from(this.activeStreams.keys());
    }
    isStreamActive(sessionId) {
        return this.activeStreams.has(sessionId);
    }
    stopAllStreams() {
        console.log(`🛑 Stopping all active streams (${this.activeStreams.size})`);
        for (const sessionId of this.activeStreams.keys()) {
            this.stopSessionStream(sessionId);
        }
    }
    // Test de connectividad con GStreamer
    static async testGStreamerAvailability() {
        return new Promise((resolve) => {
            const testProcess = (0, child_process_1.spawn)('gst-launch-1.0', ['--version'], { stdio: 'pipe' });
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
    static async testVideoDevice(device) {
        if (!device.startsWith('/dev/video')) {
            return true; // Asumir que otros tipos son válidos
        }
        return new Promise((resolve) => {
            const testProcess = (0, child_process_1.spawn)('v4l2-ctl', ['--device', device, '--list-formats'], { stdio: 'pipe' });
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
exports.StreamProcessor = StreamProcessor;
