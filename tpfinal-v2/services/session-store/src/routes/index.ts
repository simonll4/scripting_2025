import { Router } from 'express';
import { sessionRoutes } from './sessions';
import { detectionRoutes } from './detections';
import { queryRoutes } from './query';
import { db } from '../database';

const router = Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const dbHealthy = await db.healthCheck();
    const status = dbHealthy ? 'healthy' : 'unhealthy';
    const statusCode = dbHealthy ? 200 : 503;

    res.status(statusCode).json({
      status,
      timestamp: new Date().toISOString(),
      service: 'session-store',
      database: dbHealthy ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'session-store',
      error: 'Health check failed'
    });
  }
});

// API routes
router.use('/sessions', sessionRoutes);
router.use('/detections', detectionRoutes);
router.use('/query', queryRoutes);

export { router as apiRoutes };