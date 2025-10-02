import { Router } from 'express';
import { SessionController } from '../controllers';

const router = Router();
const sessionController = new SessionController();

// POST /sessions/open - Abrir nueva sesión
router.post('/open', sessionController.openSession);

// POST /sessions/close - Cerrar sesión
router.post('/close', sessionController.closeSession);

// GET /sessions/:sessionId - Obtener sesión específica
router.get('/:sessionId', sessionController.getSession);

// PATCH /sessions/:sessionId - Actualizar metadatos de sesión
router.patch('/:sessionId', sessionController.updateSessionMetadata);

export { router as sessionRoutes };