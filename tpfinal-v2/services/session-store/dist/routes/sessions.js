"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRoutes = void 0;
const express_1 = require("express");
const controllers_1 = require("../controllers");
const router = (0, express_1.Router)();
exports.sessionRoutes = router;
const sessionController = new controllers_1.SessionController();
// POST /sessions/open - Abrir nueva sesión
router.post('/open', sessionController.openSession);
// POST /sessions/close - Cerrar sesión
router.post('/close', sessionController.closeSession);
// GET /sessions/:sessionId - Obtener sesión específica
router.get('/:sessionId', sessionController.getSession);
// PATCH /sessions/:sessionId - Actualizar metadatos de sesión
router.patch('/:sessionId', sessionController.updateSessionMetadata);
