"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("./config");
const routes_1 = require("./routes");
const database_1 = require("./database");
const app = (0, express_1.default)();
exports.app = app;
// Middleware de seguridad
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? ['http://localhost:3000']
        : true,
    credentials: true
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.CONFIG.RATE_LIMIT_WINDOW_MS,
    max: config_1.CONFIG.RATE_LIMIT_MAX_REQUESTS,
    message: {
        error: 'Too many requests, please try again later'
    }
});
app.use(limiter);
// Middleware de parseo
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        }));
    });
    next();
});
// API routes
app.use('/api', routes_1.apiRoutes);
// Catch-all para rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
    });
});
// Error handler global
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await database_1.db.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await database_1.db.close();
    process.exit(0);
});
// Start server
const startServer = async () => {
    try {
        // Test database connection
        const dbHealthy = await database_1.db.healthCheck();
        if (!dbHealthy) {
            throw new Error('Database connection failed');
        }
        app.listen(config_1.CONFIG.PORT, () => {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'session-store',
                event: 'server_started',
                port: config_1.CONFIG.PORT,
                environment: config_1.CONFIG.NODE_ENV,
                database: 'connected'
            }));
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};
if (require.main === module) {
    startServer();
}
