#!/usr/bin/env python3
"""
Real YOLO Inference Engine - Detección real con ONNX
"""
import json
import sys
import time
import cv2
import numpy as np
import onnxruntime as ort
from datetime import datetime

class YOLOInferenceEngine:
    def __init__(self, model_path='models/yolov8n.onnx', camera_device=0):
        # Clases COCO que nos interesan
        self.class_names = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
            'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
            'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
            'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
            'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
            'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
            'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
            'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
            'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
            'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
            'toothbrush'
        ]
        
        # Clases que el usuario quiere detectar
        self.target_classes = ['person', 'mouse', 'cup', 'cell phone', 'wine glass', 'bottle']
        
        self.model_path = model_path
        self.camera_device = camera_device
        self.confidence_threshold = 0.5
        self.input_size = (640, 640)
        
        # Inicializar modelo ONNX
        try:
            self.session = ort.InferenceSession(model_path)
            self.input_name = self.session.get_inputs()[0].name
            print(json.dumps({
                'type': 'status',
                'message': f'YOLO model loaded: {model_path}',
                'timestamp': datetime.now().isoformat()
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                'type': 'error',
                'message': f'Failed to load YOLO model: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }), flush=True)
            sys.exit(1)
        
        # No inicializar cámara aquí - se inicializará cuando sea necesario
        self.cap = None
        
        # Enviar mensaje de ready para que el Edge Agent sepa que está listo
        print(json.dumps({
            'type': 'status',
            'message': 'YOLO Inference Engine ready - starting continuous detection...',
            'timestamp': datetime.now().isoformat()
        }), flush=True)
        
        # Enviar señal ready a stderr para el Edge Agent
        print("ready", file=sys.stderr, flush=True)
        
        # Ejecutar loop de detección automáticamente
        self.run()

    def preprocess_frame(self, frame):
        """Preprocesar frame para YOLO"""
        # Redimensionar manteniendo aspect ratio
        h, w = frame.shape[:2]
        scale = min(self.input_size[0] / w, self.input_size[1] / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        resized = cv2.resize(frame, (new_w, new_h))
        
        # Crear imagen con padding
        input_img = np.full((self.input_size[1], self.input_size[0], 3), 114, dtype=np.uint8)
        input_img[:new_h, :new_w] = resized
        
        # Normalizar y cambiar formato
        input_img = input_img.astype(np.float16) / 255.0  # Usar float16
        input_img = np.transpose(input_img, (2, 0, 1))  # HWC to CHW
        input_img = np.expand_dims(input_img, axis=0)  # Add batch dimension
        
        return input_img, scale

    def postprocess_detections(self, outputs, scale, frame_shape):
        """Postprocesar detecciones YOLO"""
        detections = []
        
        if len(outputs) > 0:
            output = outputs[0]
            
            # YOLOv5 output format: [batch, num_detections, 5+num_classes]
            # Cada detección: [x_center, y_center, width, height, objectness, class_scores...]
            
            for detection in output[0]:  # Remove batch dimension
                # Extraer bbox y objectness
                x_center, y_center, width, height, objectness = detection[:5]
                objectness = float(objectness)
                
                if objectness > 0.4:  # Filtro de objectness
                    scores = detection[5:]
                    
                    # Encontrar la clase con mayor score
                    class_id = int(np.argmax(scores))
                    class_confidence = float(scores[class_id])
                    
                    # Confianza final es objectness * class_confidence
                    final_confidence = float(objectness * class_confidence)
                    
                    if final_confidence > self.confidence_threshold:
                        class_name = self.class_names[class_id] if class_id < len(self.class_names) else f'class_{class_id}'
                        
                        # Solo detectar clases objetivo
                        if class_name in self.target_classes:
                            # Coordenadas YOLOv5 vienen en formato [0-640, 0-640]
                            # Convertir a coordenadas de esquina en píxeles
                            x1_px = float(x_center - width / 2)
                            y1_px = float(y_center - height / 2)
                            w_px = float(width)
                            h_px = float(height)
                            
                            # Normalizar a [0, 1] basado en el tamaño del input (640x640)
                            x1 = x1_px / self.input_size[0]
                            y1 = y1_px / self.input_size[1]
                            w = w_px / self.input_size[0]
                            h = h_px / self.input_size[1]
                            
                            # Asegurar que las coordenadas estén en [0, 1]
                            x1 = max(0, min(1, x1))
                            y1 = max(0, min(1, y1))
                            w = max(0, min(1 - x1, w))
                            h = max(0, min(1 - y1, h))
                            
                            detections.append({
                                'class': class_name,
                                'confidence': round(final_confidence, 3),
                                'bbox': {
                                    'x': round(x1, 3),
                                    'y': round(y1, 3),
                                    'width': round(w, 3),
                                    'height': round(h, 3)
                                },
                                'timestamp': datetime.now().isoformat()
                            })
        
        return detections

    def run(self):
        """Loop principal del motor de inferencia"""
        print(json.dumps({
            'type': 'status',
            'message': 'YOLO Inference Engine started - initializing camera...',
            'timestamp': datetime.now().isoformat()
        }), flush=True)
        
        # Inicializar cámara cuando sea necesario
        try:
            self.cap = cv2.VideoCapture(self.camera_device)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 15)
            
            if not self.cap.isOpened():
                raise Exception(f"Cannot open camera {self.camera_device}")
                
            print(json.dumps({
                'type': 'status',
                'message': f'Camera {self.camera_device} initialized for YOLO processing',
                'timestamp': datetime.now().isoformat()
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                'type': 'error',
                'message': f'Failed to initialize camera: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }), flush=True)
            return
        
        try:
            frame_count = 0
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    print(json.dumps({
                        'type': 'error',
                        'message': 'Failed to read frame from camera',
                        'timestamp': datetime.now().isoformat()
                    }), flush=True)
                    break
                
                frame_count += 1
                
                # Procesar cada 5 frames para mejor rendimiento
                if frame_count % 5 == 0:
                    # Preprocesar
                    input_img, scale = self.preprocess_frame(frame)
                    
                    # Inferencia
                    outputs = self.session.run(None, {self.input_name: input_img})
                    
                    # Postprocesar
                    detections = self.postprocess_detections(outputs, scale, frame.shape)
                    
                    # Enviar detecciones
                    for detection in detections:
                        print(json.dumps({
                            'type': 'detection',
                            'data': detection
                        }), flush=True)
                
                # Control de FPS
                time.sleep(1/15)  # ~15 FPS
                
        except KeyboardInterrupt:
            print(json.dumps({
                'type': 'status',
                'message': 'YOLO Inference Engine stopped',
                'timestamp': datetime.now().isoformat()
            }), flush=True)
        except Exception as e:
            print(json.dumps({
                'type': 'error',
                'message': f'YOLO engine error: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }), flush=True)
        finally:
            if hasattr(self, 'cap'):
                self.cap.release()

if __name__ == '__main__':
    # Parsear argumentos
    model_path = 'models/yolov8n.onnx'
    camera_device = 0
    
    if len(sys.argv) > 1:
        model_path = sys.argv[1]
    if len(sys.argv) > 2:
        camera_device = int(sys.argv[2])
    
    engine = YOLOInferenceEngine(model_path, camera_device)
    engine.run()