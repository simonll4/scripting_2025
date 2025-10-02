"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraCapture = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const config_1 = require("../config");
const sharp_1 = __importDefault(require("sharp"));
class CameraCapture extends events_1.EventEmitter {
    constructor(device = config_1.CONFIG.DEVICE_PATH, frameRate = config_1.CONFIG.FRAME_RATE, videoSize = config_1.CONFIG.VIDEO_SIZE) {
        super();
        this.captureProcess = null;
        this.isCapturing = false;
        this.frameBuffer = Buffer.alloc(0);
        this.device = device;
        this.frameRate = frameRate;
        const [w, h] = videoSize.split('x').map(Number);
        this.width = w;
        this.height = h;
    }
    async start() {
        if (this.isCapturing) {
            console.log('⚠️ Camera capture already started');
            return;
        }
        console.log(`📹 Starting camera capture: ${this.device} at ${this.width}x${this.height}@${this.frameRate}fps`);
        try {
            await this.startFFmpegCapture();
            this.isCapturing = true;
            this.emit('started');
        }
        catch (error) {
            console.error('❌ Failed to start camera capture:', error);
            throw error;
        }
    }
    async startFFmpegCapture() {
        return new Promise((resolve, reject) => {
            const ffmpegArgs = this.buildFFmpegArgs();
            console.log(`🎬 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
            this.captureProcess = (0, child_process_1.spawn)('ffmpeg', ffmpegArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            let resolved = false;
            this.captureProcess.stderr?.on('data', (data) => {
                const message = data.toString();
                console.log(`[FFmpeg stderr] ${message.trim()}`);
                if (message.includes('frame=') && !message.includes('fps=')) {
                    // Log progreso cada cierto tiempo
                    if (Math.random() < 0.01) { // 1% de las veces
                        console.log(`[FFmpeg] ${message.trim()}`);
                    }
                }
                else if ((message.includes('Stream mapping:') || message.includes('Output #0')) && !resolved) {
                    resolved = true;
                    resolve();
                }
            });
            this.captureProcess.stdout?.on('data', (data) => {
                this.handleFrameData(data);
            });
            this.captureProcess.on('error', (error) => {
                console.error('❌ FFmpeg process error:', error);
                this.isCapturing = false;
                reject(error);
            });
            this.captureProcess.on('exit', (code, signal) => {
                console.log(`🔚 FFmpeg process exited: code=${code}, signal=${signal}`);
                this.isCapturing = false;
                this.emit('stopped');
            });
            // Timeout para el inicio
            setTimeout(() => {
                if (!resolved) {
                    reject(new Error('FFmpeg startup timeout'));
                }
            }, 20000); // 20 segundos
        });
    }
    buildFFmpegArgs() {
        const args = [];
        // Input source
        if (this.device.startsWith('/dev/video')) {
            // V4L2 device - sin forzar framerate de entrada
            args.push('-f', 'v4l2', '-video_size', `${this.width}x${this.height}`, '-i', this.device);
        }
        else if (this.device.startsWith('rtsp://')) {
            // RTSP source
            args.push('-rtsp_transport', 'tcp', '-i', this.device);
        }
        else if (this.device === 'test') {
            // Test pattern
            args.push('-f', 'lavfi', '-i', `testsrc=duration=3600:size=${this.width}x${this.height}:rate=${this.frameRate}`);
        }
        else {
            throw new Error(`Unsupported device: ${this.device}`);
        }
        // Output format (raw JPEG frames)
        args.push('-vf', `fps=${this.frameRate}`, '-c:v', 'mjpeg', '-q:v', '5', // Calidad JPEG (1-31, menor = mejor)
        '-f', 'image2pipe', '-');
        return args;
    }
    handleFrameData(data) {
        // Acumular datos en buffer
        this.frameBuffer = Buffer.concat([this.frameBuffer, data]);
        // Buscar marcadores JPEG
        let startIndex = 0;
        while (true) {
            // Buscar inicio de JPEG (FF D8)
            const jpegStart = this.frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]), startIndex);
            if (jpegStart === -1)
                break;
            // Buscar final de JPEG (FF D9)
            const jpegEnd = this.frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), jpegStart + 2);
            if (jpegEnd === -1)
                break;
            // Extraer frame completo
            const frameLength = jpegEnd - jpegStart + 2;
            const frameData = this.frameBuffer.slice(jpegStart, jpegEnd + 2);
            // Emitir frame
            this.emit('frame', {
                buffer: frameData,
                timestamp: Date.now(),
                width: this.width,
                height: this.height
            });
            // Remover frame procesado del buffer
            startIndex = jpegEnd + 2;
        }
        // Mantener solo datos no procesados
        if (startIndex > 0) {
            this.frameBuffer = this.frameBuffer.slice(startIndex);
        }
        // Limitar tamaño del buffer para evitar memory leaks
        if (this.frameBuffer.length > 1024 * 1024) { // 1MB
            console.log('⚠️ Frame buffer too large, resetting');
            this.frameBuffer = Buffer.alloc(0);
        }
    }
    stop() {
        if (!this.isCapturing) {
            console.log('⚠️ Camera capture not started');
            return;
        }
        console.log('🛑 Stopping camera capture');
        if (this.captureProcess) {
            this.captureProcess.kill('SIGTERM');
            // Force kill after 5 seconds
            setTimeout(() => {
                if (this.captureProcess && !this.captureProcess.killed) {
                    console.log('🔨 Force killing FFmpeg process');
                    this.captureProcess.kill('SIGKILL');
                }
            }, 5000);
        }
        this.isCapturing = false;
        this.frameBuffer = Buffer.alloc(0);
    }
    isActive() {
        return this.isCapturing;
    }
    // Capturar un frame individual (para testing)
    async captureFrame() {
        return new Promise((resolve, reject) => {
            if (!this.isCapturing) {
                reject(new Error('Camera not started'));
                return;
            }
            const timeout = setTimeout(() => {
                this.removeListener('frame', onFrame);
                reject(new Error('Frame capture timeout'));
            }, 5000);
            const onFrame = (frame) => {
                clearTimeout(timeout);
                this.removeListener('frame', onFrame);
                resolve(frame);
            };
            this.once('frame', onFrame);
        });
    }
    // Test de disponibilidad de dispositivo
    static async testDevice(device) {
        if (device === 'test')
            return true;
        if (device.startsWith('rtsp://'))
            return true; // Asumimos válido
        if (device.startsWith('/dev/video')) {
            // Test V4L2 device
            return new Promise((resolve) => {
                const testProcess = (0, child_process_1.spawn)('v4l2-ctl', ['--device', device, '--list-formats'], {
                    stdio: 'pipe'
                });
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
        return false;
    }
    // Redimensionar frame usando Sharp
    static async resizeFrame(frameBuffer, targetWidth, targetHeight) {
        try {
            return await (0, sharp_1.default)(frameBuffer)
                .resize(targetWidth, targetHeight, {
                fit: 'cover',
                position: 'center'
            })
                .jpeg({ quality: 80 })
                .toBuffer();
        }
        catch (error) {
            console.error('❌ Frame resize error:', error);
            throw error;
        }
    }
}
exports.CameraCapture = CameraCapture;
