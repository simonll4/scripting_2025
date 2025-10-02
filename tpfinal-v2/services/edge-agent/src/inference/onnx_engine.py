#!/usr/bin/env python3
"""
Inference Engine for ONNX models using YOLO
Módulo 1 del TP - Procesamiento de inferencia ONNX
"""

import sys
import json
import numpy as np
import cv2
import onnxruntime as ort
from typing import List, Dict, Any, Tuple
import argparse
from pathlib import Path

class ONNXInferenceEngine:
    def __init__(self, model_path: str, confidence_threshold: float = 0.5, 
                 input_height: int = 640, input_width: int = 640, 
                 class_names: List[str] = None):
        """
        Initialize ONNX model for object detection
        
        Args:
            model_path: Path to ONNX model file
            confidence_threshold: Minimum confidence threshold
            input_height: Model input height
            input_width: Model input width  
            class_names: List of class names (COCO format)
        """
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.input_height = input_height
        self.input_width = input_width
        self.class_names = class_names or self._get_coco_classes()
        
        # Load ONNX model
        try:
            self.session = ort.InferenceSession(model_path)
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [output.name for output in self.session.get_outputs()]
            print(f"✅ Model loaded: {model_path}", file=sys.stderr)
        except Exception as e:
            print(f"❌ Error loading model: {e}", file=sys.stderr)
            raise
    
    def _get_coco_classes(self) -> List[str]:
        """Return COCO dataset class names"""
        return [
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
        ]
    
    def preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for YOLO model input
        
        Args:
            image: Input image in BGR format
            
        Returns:
            Preprocessed image tensor
        """
        # Resize image
        resized = cv2.resize(image, (self.input_width, self.input_height))
        
        # Convert BGR to RGB
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        # Normalize to [0, 1] and convert to float16
        normalized = rgb.astype(np.float16) / 255.0
        
        # HWC to CHW format
        transposed = np.transpose(normalized, (2, 0, 1))
        
        # Add batch dimension
        batched = np.expand_dims(transposed, axis=0)
        
        return batched
    
    def postprocess_outputs(self, outputs: List[np.ndarray], 
                          original_shape: Tuple[int, int]) -> List[Dict[str, Any]]:
        """
        Post-process ONNX model outputs to extract detections
        
        Args:
            outputs: Raw model outputs
            original_shape: Original image shape (height, width)
            
        Returns:
            List of detection dictionaries
        """
        detections = []
        
        # Assuming YOLOv5 output format: [batch_size, num_detections, 85]
        # Where 85 = x, y, w, h, confidence, class_probs...
        predictions = outputs[0][0]  # Remove batch dimension
        
        orig_h, orig_w = original_shape
        scale_x = orig_w / self.input_width
        scale_y = orig_h / self.input_height
        
        for detection in predictions:
            # Extract confidence
            confidence = detection[4]
            
            if confidence >= self.confidence_threshold:
                # Extract class scores
                class_scores = detection[5:]
                class_id = np.argmax(class_scores)
                class_confidence = class_scores[class_id]
                
                if class_confidence >= self.confidence_threshold:
                    # Extract and convert coordinates
                    x_center, y_center, width, height = detection[:4]
                    
                    # Convert from center format to corner format
                    x1 = (x_center - width / 2) * scale_x
                    y1 = (y_center - height / 2) * scale_y
                    x2 = (x_center + width / 2) * scale_x
                    y2 = (y_center + height / 2) * scale_y
                    
                    # Normalize coordinates to [0, 1]
                    x1_norm = max(0, min(1, x1 / orig_w))
                    y1_norm = max(0, min(1, y1 / orig_h))
                    x2_norm = max(0, min(1, x2 / orig_w))
                    y2_norm = max(0, min(1, y2 / orig_h))
                    
                    # Get class name
                    class_name = self.class_names[class_id] if class_id < len(self.class_names) else f"class_{class_id}"
                    
                    detections.append({
                        'class': class_name,
                        'score': float(confidence * class_confidence),
                        'bbox': [x1_norm, y1_norm, x2_norm, y2_norm]
                    })
        
        return detections
    
    def run(self, image_data: bytes, classes_of_interest: List[str] = None) -> List[Dict[str, Any]]:
        """
        Run inference on image data
        
        Args:
            image_data: Image data as bytes (JPEG format)
            classes_of_interest: Filter detections by these classes
            
        Returns:
            List of detections matching criteria
        """
        try:
            # Decode image
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Failed to decode image")
            
            original_shape = image.shape[:2]  # (height, width)
            
            # Preprocess
            input_tensor = self.preprocess_image(image)
            
            # Run inference
            outputs = self.session.run(self.output_names, {self.input_name: input_tensor})
            
            # Post-process
            detections = self.postprocess_outputs(outputs, original_shape)
            
            # Filter by classes of interest if specified
            if classes_of_interest:
                detections = [d for d in detections if d['class'] in classes_of_interest]
            
            return detections
            
        except Exception as e:
            print(f"❌ Inference error: {e}", file=sys.stderr)
            return []

def main():
    parser = argparse.ArgumentParser(description='ONNX Inference Engine')
    parser.add_argument('--model', required=True, help='Path to ONNX model')
    parser.add_argument('--confidence', type=float, default=0.5, help='Confidence threshold')
    parser.add_argument('--size', type=int, default=640, help='Input size')
    parser.add_argument('--classes', help='Comma-separated list of classes of interest')
    
    args = parser.parse_args()
    
    # Parse classes
    classes_of_interest = args.classes.split(',') if args.classes else None
    
    # Initialize engine
    engine = ONNXInferenceEngine(
        model_path=args.model,
        confidence_threshold=args.confidence,
        input_height=args.size,
        input_width=args.size
    )
    
    print("🚀 ONNX Inference Engine ready", file=sys.stderr)
    print("📝 Send image data via stdin, receive JSON detections via stdout", file=sys.stderr)
    
    # Process images from stdin
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
            
            # Run inference
            detections = engine.run(image_data, classes_of_interest)
            
            # Output JSON result
            result = json.dumps(detections)
            print(result, flush=True)
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"❌ Processing error: {e}", file=sys.stderr)
            print("[]", flush=True)  # Empty result
    
    print("👋 Inference engine stopped", file=sys.stderr)

if __name__ == '__main__':
    main()