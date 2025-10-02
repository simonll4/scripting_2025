#!/usr/bin/env python3
"""
Frame-based YOLO Inference Engine - receives frames via stdin
"""
import json
import sys
import cv2
import numpy as np
import onnxruntime as ort
from datetime import datetime
import argparse

class YOLOFrameEngine:
    def __init__(self, model_path='models/yolov5n.onnx', confidence_threshold=0.5):
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
        
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.input_size = (640, 640)
        
        # Inicializar modelo ONNX
        try:
            self.session = ort.InferenceSession(model_path)
            self.input_name = self.session.get_inputs()[0].name
            print(f"✅ YOLO model loaded: {model_path}", file=sys.stderr)
        except Exception as e:
            print(f"❌ Failed to load YOLO model: {str(e)}", file=sys.stderr)
            sys.exit(1)

    def preprocess_frame(self, frame):
        """Preprocesar frame para YOLO"""
        # Redimensionar manteniendo aspect ratio
        h, w = frame.shape[:2]
        scale = min(self.input_size[0] / w, self.input_size[1] / h)
        new_w, new_h = int(w * scale), int(h * scale)
        
        resized = cv2.resize(frame, (new_w, new_h))
        
        # Crear canvas del tamaño de entrada
        canvas = np.zeros((self.input_size[1], self.input_size[0], 3), dtype=np.uint8)
        
        # Centrar imagen redimensionada
        y_offset = (self.input_size[1] - new_h) // 2
        x_offset = (self.input_size[0] - new_w) // 2
        canvas[y_offset:y_offset+new_h, x_offset:x_offset+new_w] = resized
        
        # Normalizar y cambiar formato a float16 (requerido por el modelo)
        canvas = canvas.astype(np.float16) / 255.0
        canvas = np.transpose(canvas, (2, 0, 1))  # HWC -> CHW
        canvas = np.expand_dims(canvas, axis=0)   # Add batch dimension
        
        return canvas, scale, x_offset, y_offset

    def postprocess_outputs(self, outputs, original_shape, scale, x_offset, y_offset):
        """Post-procesar outputs del modelo"""
        predictions = outputs[0]  # [1, 25200, 85] para YOLOv5
        
        detections = []
        original_h, original_w = original_shape
        
        for detection in predictions[0]:
            # detection = [x, y, w, h, confidence, class_scores...]
            confidence = detection[4]
            
            if confidence > self.confidence_threshold:
                # Encontrar clase con mayor puntuación
                class_scores = detection[5:]
                class_id = np.argmax(class_scores)
                class_confidence = class_scores[class_id]
                
                if class_confidence > self.confidence_threshold:
                    # Coordenadas del bounding box
                    x_center = detection[0]
                    y_center = detection[1]
                    width = detection[2]
                    height = detection[3]
                    
                    # Convertir a coordenadas originales
                    x_center = (x_center - x_offset) / scale
                    y_center = (y_center - y_offset) / scale
                    width = width / scale
                    height = height / scale
                    
                    # Asegurar que están dentro de los límites
                    x_center = max(0, min(original_w, x_center))
                    y_center = max(0, min(original_h, y_center))
                    width = max(0, min(original_w - x_center + width/2, width))
                    height = max(0, min(original_h - y_center + height/2, height))
                    
                    detection_info = {
                        'class': self.class_names[class_id],
                        'confidence': float(class_confidence),
                        'bbox': {
                            'x': float(x_center - width/2),
                            'y': float(y_center - height/2),
                            'width': float(width),
                            'height': float(height)
                        }
                    }
                    
                    detections.append(detection_info)
        
        return detections

    def process_frame(self, image_data):
        """Procesar un frame individual"""
        try:
            # Decodificar imagen
            nparr = np.frombuffer(image_data, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                return []
                
            original_shape = frame.shape[:2]
            
            # Preprocesar
            input_tensor, scale, x_offset, y_offset = self.preprocess_frame(frame)
            
            # Inferencia
            outputs = self.session.run(None, {self.input_name: input_tensor})
            
            # Post-procesar
            detections = self.postprocess_outputs(outputs, original_shape, scale, x_offset, y_offset)
            
            return detections
            
        except Exception as e:
            print(f"❌ Frame processing error: {e}", file=sys.stderr)
            return []

def main():
    parser = argparse.ArgumentParser(description='YOLO Frame-based Inference Engine')
    parser.add_argument('--model', default='models/yolov5n.onnx', help='Path to ONNX model')
    parser.add_argument('--confidence', type=float, default=0.5, help='Confidence threshold')
    parser.add_argument('--classes', default='person,cup,bottle,car', help='Classes of interest (comma-separated)')
    
    args = parser.parse_args()
    
    # Classes of interest
    classes_of_interest = [cls.strip() for cls in args.classes.split(',')]
    
    # Initialize engine
    engine = YOLOFrameEngine(
        model_path=args.model,
        confidence_threshold=args.confidence
    )
    
    print("🚀 YOLO Frame Engine ready", file=sys.stderr)
    print("📝 Send image data via stdin, receive JSON detections via stdout", file=sys.stderr)
    
    # Process frames from stdin
    while True:
        try:
            # Read length of image data (4 bytes)
            length_bytes = sys.stdin.buffer.read(4)
            if len(length_bytes) != 4:
                break
                
            length = int.from_bytes(length_bytes, byteorder='little')
            
            # Read image data
            image_data = sys.stdin.buffer.read(length)
            if len(image_data) != length:
                break
            
            # Process frame
            detections = engine.process_frame(image_data)
            
            # Filter by classes of interest if specified
            if classes_of_interest:
                detections = [d for d in detections if d['class'] in classes_of_interest]
            
            # Output JSON result
            result = json.dumps(detections)
            print(result, flush=True)
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"❌ Processing error: {e}", file=sys.stderr)
            print("[]", flush=True)  # Empty result
    
    print("👋 YOLO Frame engine stopped", file=sys.stderr)

if __name__ == '__main__':
    main()