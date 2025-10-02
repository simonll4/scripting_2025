"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InferenceEngine = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
class InferenceEngine extends events_1.EventEmitter {
    constructor(modelPath = config_1.CONFIG.MODEL_PATH, confidenceThreshold = config_1.CONFIG.CONFIDENCE_THRESHOLD, inputSize = config_1.CONFIG.MODEL_INPUT_SIZE, classNames = []) {
        super();
        this.pythonProcess = null;
        this.isReady = false;
        this.modelPath = modelPath;
        this.confidenceThreshold = confidenceThreshold;
        this.inputSize = inputSize;
        this.classNames = classNames;
    }
    async initialize() {
        return new Promise((resolve, reject) => {
            const pythonScript = path_1.default.join(__dirname, 'yolo_frame_engine.py');
            // Usar Python del sistema con YOLO frame engine
            const pythonExecutable = 'python3';
            const args = [
                pythonScript,
                '--model', this.modelPath,
                '--confidence', this.confidenceThreshold.toString(),
                '--classes', 'person,cup,bottle,car' // Classes of interest
            ];
            this.pythonProcess = (0, child_process_1.spawn)(pythonExecutable, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            this.pythonProcess.stderr?.on('data', (data) => {
                const message = data.toString();
                console.log(`[YOLO Frame Engine] ${message.trim()}`);
                if (message.includes('ready')) {
                    this.isReady = true;
                    resolve();
                }
            });
            // Escuchar detecciones desde stdout (JSON format)
            this.pythonProcess.stdout?.on('data', (data) => {
                try {
                    const lines = data.toString().split('\n').filter((line) => line.trim());
                    for (const line of lines) {
                        const detections = JSON.parse(line);
                        if (Array.isArray(detections) && detections.length > 0) {
                            // Emitir evento de detección para cada detección encontrada
                            this.emit('detections', detections);
                        }
                    }
                }
                catch (error) {
                    // Ignore parsing errors - might be partial JSON
                }
            });
            this.pythonProcess.on('error', (error) => {
                console.error('Failed to start Python ONNX inference process:', error);
                reject(error);
            });
            this.pythonProcess.on('exit', (code) => {
                console.log(`Python inference process exited with code ${code}`);
                this.isReady = false;
                this.pythonProcess = null;
            });
            // Timeout para inicialización
            setTimeout(() => {
                if (!this.isReady) {
                    reject(new Error('Inference engine initialization timeout'));
                }
            }, 60000); // 60 segundos
        });
    }
    async run(imageBuffer, classesOfInterest = []) {
        if (!this.isReady || !this.pythonProcess) {
            throw new Error('Inference engine not ready');
        }
        return new Promise((resolve, reject) => {
            let result = '';
            let timeout;
            // Listener para la respuesta
            const onData = (data) => {
                result += data.toString();
                // Intentar parsear JSON (puede venir en múltiples chunks)
                try {
                    const parsed = JSON.parse(result);
                    cleanup();
                    // Mapear y filtrar detecciones
                    const detections = this.processDetections(parsed, classesOfInterest);
                    resolve(detections);
                }
                catch {
                    // Aún no tenemos JSON completo, seguir esperando
                }
            };
            const cleanup = () => {
                this.pythonProcess?.stdout?.removeListener('data', onData);
                if (timeout)
                    clearTimeout(timeout);
            };
            // Configurar timeout
            timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Inference timeout'));
            }, 5000);
            // Escuchar respuesta
            if (this.pythonProcess && this.pythonProcess.stdout) {
                this.pythonProcess.stdout.on('data', onData);
            }
            try {
                // Enviar longitud de la imagen (4 bytes little-endian)
                const lengthBuffer = Buffer.allocUnsafe(4);
                lengthBuffer.writeUInt32LE(imageBuffer.length, 0);
                if (this.pythonProcess && this.pythonProcess.stdin) {
                    this.pythonProcess.stdin.write(lengthBuffer);
                }
                // Enviar datos de la imagen
                if (this.pythonProcess && this.pythonProcess.stdin) {
                    this.pythonProcess.stdin.write(imageBuffer);
                }
            }
            catch (error) {
                cleanup();
                reject(error);
            }
        });
    }
    processDetections(rawDetections, classesOfInterest) {
        const detections = [];
        const timestamp = Date.now();
        for (const raw of rawDetections) {
            // Mapear clase si es necesario
            let className = raw.class;
            const mappedClass = this.findMappedClass(className, classesOfInterest);
            if (mappedClass) {
                className = mappedClass;
            }
            // Filtrar por clases de interés si se especifican
            if (classesOfInterest.length > 0 && !classesOfInterest.includes(className)) {
                continue;
            }
            // Validar datos
            if (!raw.bbox || raw.bbox.length !== 4 || raw.score < this.confidenceThreshold) {
                continue;
            }
            detections.push({
                class: className,
                score: raw.score,
                bbox: raw.bbox,
                ts: timestamp,
                frame_url: '', // Se asignará más tarde
                attributes: {}
            });
        }
        return detections;
    }
    findMappedClass(detectedClass, classesOfInterest) {
        // Buscar mapeo directo
        for (const interest of classesOfInterest) {
            if (config_1.CLASS_MAPPING[interest] === detectedClass) {
                return interest;
            }
        }
        // Buscar mapeo inverso
        if (classesOfInterest.includes(detectedClass)) {
            return detectedClass;
        }
        return null;
    }
    async setOnnxModel(modelName, confidenceThreshold, height, width, classNames) {
        // Cerrar proceso actual si existe
        await this.close();
        // Actualizar configuración
        this.modelPath = modelName;
        this.confidenceThreshold = confidenceThreshold;
        this.inputSize = Math.max(height, width); // YOLO usa cuadrado
        this.classNames = classNames;
        // Reinicializar
        await this.initialize();
    }
    async processFrame(frameBuffer) {
        if (!this.isReady || !this.pythonProcess || !this.pythonProcess.stdin) {
            return;
        }
        try {
            // Enviar longitud del frame (4 bytes little-endian)
            const lengthBuffer = Buffer.allocUnsafe(4);
            lengthBuffer.writeUInt32LE(frameBuffer.length, 0);
            this.pythonProcess.stdin.write(lengthBuffer);
            // Enviar datos del frame
            this.pythonProcess.stdin.write(frameBuffer);
        }
        catch (error) {
            console.error('Error processing frame:', error);
        }
    }
    async close() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        this.isReady = false;
    }
    isInitialized() {
        return this.isReady;
    }
}
exports.InferenceEngine = InferenceEngine;
