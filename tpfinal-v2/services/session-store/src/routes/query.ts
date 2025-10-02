import { Router } from 'express';
import { SessionController } from '../controllers';

const router = Router();
const sessionController = new SessionController();

// POST /query - Consultar sesiones con filtros
router.post('/', sessionController.query);

export { router as queryRoutes };