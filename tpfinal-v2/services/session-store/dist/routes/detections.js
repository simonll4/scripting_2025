"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectionRoutes = void 0;
const express_1 = require("express");
const controllers_1 = require("../controllers");
const router = (0, express_1.Router)();
exports.detectionRoutes = router;
const detectionController = new controllers_1.DetectionController();
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
