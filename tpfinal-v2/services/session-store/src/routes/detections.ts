import { Router } from 'express';
import { DetectionController } from '../controllers';

const router = Router();
const detectionController = new DetectionController();

// POST /detections/batch - Crear lote de detecciones
router.post('/batch', detectionController.createBatch);

// GET /detections/:detectionId - Obtener detección específica
router.get('/:detectionId', detectionController.getDetection);

// PATCH /detections/:detectionId/attributes - Actualizar atributos de detección
router.patch('/:detectionId/attributes', detectionController.updateAttributes);

// GET /detections/session/:sessionId - Obtener detecciones de una sesión
router.get('/session/:sessionId', detectionController.getSessionDetections);

// GET /detections/stats - Obtener estadísticas de detecciones
router.get('/stats', detectionController.getDetectionStats);

export { router as detectionRoutes };