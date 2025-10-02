"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRoutes = void 0;
const express_1 = require("express");
const sessions_1 = require("./sessions");
const detections_1 = require("./detections");
const query_1 = require("./query");
const database_1 = require("../database");
const router = (0, express_1.Router)();
exports.apiRoutes = router;
// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        const dbHealthy = await database_1.db.healthCheck();
        const status = dbHealthy ? 'healthy' : 'unhealthy';
        const statusCode = dbHealthy ? 200 : 503;
        res.status(statusCode).json({
            status,
            timestamp: new Date().toISOString(),
            service: 'session-store',
            database: dbHealthy ? 'connected' : 'disconnected'
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            service: 'session-store',
            error: 'Health check failed'
        });
    }
});
// API routes
router.use('/sessions', sessions_1.sessionRoutes);
router.use('/detections', detections_1.detectionRoutes);
router.use('/query', query_1.queryRoutes);
