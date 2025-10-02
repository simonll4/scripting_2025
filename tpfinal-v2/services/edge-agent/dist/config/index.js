"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLASS_MAPPING = exports.COCO_CLASSES = exports.CONFIG = void 0;
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
// Cargar variables de entorno
(0, dotenv_1.config)({ path: path_1.default.resolve(__dirname, '../../../.env') });
exports.CONFIG = {
    // Cámara y video
    DEVICE_PATH: process.env.DEVICE_PATH || '/dev/video0',
    FRAME_RATE: parseInt(process.env.FRAME_RATE || '15'),
    VIDEO_SIZE: process.env.VIDEO_SIZE || '640x360',
    // Detección
    CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.4'),
    CLASSES_OF_INTEREST: (process.env.CLASSES_OF_INTEREST || 'person,mouse,cup,cell phone,glasses,wine glass,bottle').split(','),
    POST_ROLL_MS: parseInt(process.env.POST_ROLL_MS || '5000'),
    // URLs de servicios
    MEDIAMTX_URL: process.env.MEDIAMTX_URL || 'rtsp://localhost:8554',
    SESSION_STORE_URL: process.env.SESSION_STORE_URL || 'http://localhost:8080',
    OBJECT_STORAGE_BASE: process.env.OBJECT_STORAGE_BASE || '/home/simonll4/Desktop/scritping/tpfinal-v2/data/storage',
    // Modelo ONNX
    MODEL_PATH: process.env.MODEL_PATH || '/home/simonll4/Desktop/scritping/tpfinal-v2/services/edge-agent/models/yolov5s.onnx',
    MODEL_INPUT_SIZE: 640,
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    // DeviceID
    DEVICE_ID: process.env.DEVICE_ID || 'cam01',
    // GStreamer pipeline template
    GST_PIPELINE_TEMPLATE: process.env.GST_PIPELINE_TEMPLATE ||
        'v4l2src device={DEVICE} ! videoconvert ! video/x-raw,format=I420 ! x264enc bitrate=2000 tune=zerolatency ! h264parse ! rtph264pay pt=96 ! udpsink host=127.0.0.1 port={PORT}'
};
exports.COCO_CLASSES = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
    'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
    'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
    'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop',
    'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
];
// Mapping de clases español a inglés COCO
exports.CLASS_MAPPING = {
    'persona': 'person',
    'sombrero': 'person', // Aproximación - detectaremos personas y luego haremos post-procesado
    'mascota': 'cat', // O 'dog' - podemos hacer lógica más compleja
    'gato': 'cat',
    'perro': 'dog',
    'coche': 'car',
    'bicicleta': 'bicycle'
};
