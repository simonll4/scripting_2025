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
const serve_static_1 = __importDefault(require("serve-static"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const dotenv_1 = require("dotenv");
// Load environment variables
(0, dotenv_1.config)({ path: path_1.default.resolve(__dirname, '../../.env') });
const CONFIG = {
    PORT: parseInt(process.env.OBJECT_STORAGE_PORT || '8090'),
    STORAGE_BASE: process.env.OBJECT_STORAGE_BASE || path_1.default.join(__dirname, '../../data/storage'),
    MAX_STORAGE_GB: parseInt(process.env.MAX_STORAGE_GB || '10'),
    MAX_DAYS: parseInt(process.env.MAX_DAYS || '7'),
    NODE_ENV: process.env.NODE_ENV || 'development'
};
const app = (0, express_1.default)();
exports.app = app;
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? ['http://localhost:3000', 'http://localhost:8080']
        : true,
    credentials: true
}));
app.use((0, compression_1.default)());
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
            size: res.get('content-length') || 0,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        }));
    });
    next();
});
// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await promises_1.default.access(CONFIG.STORAGE_BASE);
        const stats = await getStorageStats();
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            service: 'object-storage',
            storage: {
                basePath: CONFIG.STORAGE_BASE,
                exists: true,
                ...stats
            }
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            service: 'object-storage',
            error: 'Storage directory not accessible'
        });
    }
});
// Storage statistics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getStorageStats();
        res.json(stats);
    }
    catch (error) {
        console.error('Error getting storage stats:', error);
        res.status(500).json({ error: 'Failed to get storage statistics' });
    }
});
// Session info endpoint
app.get('/api/sessions/:sessionId/info', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionPath = path_1.default.join(CONFIG.STORAGE_BASE, sessionId);
        // Check if session exists
        try {
            await promises_1.default.access(sessionPath);
        }
        catch {
            return res.status(404).json({ error: 'Session not found' });
        }
        const info = await getSessionInfo(sessionId);
        res.json(info);
    }
    catch (error) {
        console.error('Error getting session info:', error);
        res.status(500).json({ error: 'Failed to get session info' });
    }
});
// Cleanup endpoint (for maintenance)
app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        // Validate session ID format
        if (!/^sess-[a-zA-Z0-9_-]+$/.test(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }
        const sessionPath = path_1.default.join(CONFIG.STORAGE_BASE, sessionId);
        await promises_1.default.rm(sessionPath, { recursive: true, force: true });
        res.json({
            message: 'Session deleted successfully',
            sessionId
        });
    }
    catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});
// Serve static files
app.use((0, serve_static_1.default)(CONFIG.STORAGE_BASE, {
    dotfiles: 'deny',
    index: false,
    setHeaders: (res, path) => {
        // Set appropriate content types
        if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
            res.setHeader('Content-Type', 'image/jpeg');
        }
        else if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
        // Cache control
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    }
}));
// 404 handler for file requests
app.use((req, res) => {
    res.status(404).json({
        error: 'File not found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});
// Error handler
app.use((error, req, res, next) => {
    console.error('Object Storage error:', error);
    res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: CONFIG.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});
// Helper functions
async function getStorageStats() {
    let totalSize = 0;
    let sessionCount = 0;
    let fileCount = 0;
    try {
        const sessions = await promises_1.default.readdir(CONFIG.STORAGE_BASE);
        for (const sessionId of sessions) {
            const sessionPath = path_1.default.join(CONFIG.STORAGE_BASE, sessionId);
            const stat = await promises_1.default.stat(sessionPath);
            if (stat.isDirectory()) {
                sessionCount++;
                const sessionSize = await getDirectorySize(sessionPath);
                totalSize += sessionSize.size;
                fileCount += sessionSize.files;
            }
        }
    }
    catch (error) {
        console.warn('Error calculating storage stats:', error);
    }
    return {
        totalSizeBytes: totalSize,
        totalSizeGB: Math.round(totalSize / 1024 / 1024 / 1024 * 100) / 100,
        sessionCount,
        fileCount,
        maxStorageGB: CONFIG.MAX_STORAGE_GB,
        maxDays: CONFIG.MAX_DAYS
    };
}
async function getDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    async function processDirectory(currentPath) {
        try {
            const items = await promises_1.default.readdir(currentPath);
            for (const item of items) {
                const itemPath = path_1.default.join(currentPath, item);
                const stat = await promises_1.default.stat(itemPath);
                if (stat.isDirectory()) {
                    await processDirectory(itemPath);
                }
                else {
                    totalSize += stat.size;
                    fileCount++;
                }
            }
        }
        catch (error) {
            console.warn(`Error reading directory ${currentPath}:`, error);
        }
    }
    await processDirectory(dirPath);
    return { size: totalSize, files: fileCount };
}
async function getSessionInfo(sessionId) {
    const sessionPath = path_1.default.join(CONFIG.STORAGE_BASE, sessionId);
    const framesPath = path_1.default.join(sessionPath, 'frames');
    let framesCount = 0;
    let hasThumb = false;
    let hasMeta = false;
    let totalSize = 0;
    // Count frames
    try {
        const frames = await promises_1.default.readdir(framesPath);
        framesCount = frames.filter(f => f.endsWith('.jpg')).length;
    }
    catch {
        // Frames directory doesn't exist
    }
    // Check thumbnail
    try {
        const thumbStat = await promises_1.default.stat(path_1.default.join(sessionPath, 'thumb.jpg'));
        hasThumb = true;
        totalSize += thumbStat.size;
    }
    catch {
        // Thumb doesn't exist
    }
    // Check metadata
    try {
        const metaStat = await promises_1.default.stat(path_1.default.join(sessionPath, 'meta.json'));
        hasMeta = true;
        totalSize += metaStat.size;
    }
    catch {
        // Meta doesn't exist
    }
    // Calculate total size
    const dirSize = await getDirectorySize(sessionPath);
    totalSize = dirSize.size;
    return {
        sessionId,
        framesCount,
        hasThumb,
        hasMeta,
        totalSize,
        totalFiles: dirSize.files
    };
}
// Cleanup scheduler (runs every hour)
setInterval(async () => {
    try {
        await performCleanup();
    }
    catch (error) {
        console.error('Cleanup error:', error);
    }
}, 60 * 60 * 1000); // 1 hour
async function performCleanup() {
    console.log('🧹 Running storage cleanup...');
    const stats = await getStorageStats();
    const exceedsSize = stats.totalSizeGB > CONFIG.MAX_STORAGE_GB;
    if (!exceedsSize) {
        console.log(`✅ Storage within limits: ${stats.totalSizeGB}GB / ${CONFIG.MAX_STORAGE_GB}GB`);
        return;
    }
    console.log(`⚠️ Storage exceeds limit: ${stats.totalSizeGB}GB / ${CONFIG.MAX_STORAGE_GB}GB`);
    // Get sessions sorted by creation time (oldest first)
    const sessions = await promises_1.default.readdir(CONFIG.STORAGE_BASE);
    const sessionDates = [];
    for (const sessionId of sessions) {
        try {
            const sessionPath = path_1.default.join(CONFIG.STORAGE_BASE, sessionId);
            const stat = await promises_1.default.stat(sessionPath);
            if (stat.isDirectory()) {
                sessionDates.push({
                    sessionId,
                    createdAt: stat.birthtime
                });
            }
        }
        catch (error) {
            console.warn(`Error checking session ${sessionId}:`, error);
        }
    }
    // Sort oldest first
    sessionDates.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    // Remove sessions until under limit
    let currentSize = stats.totalSizeGB;
    for (const { sessionId } of sessionDates) {
        if (currentSize <= CONFIG.MAX_STORAGE_GB)
            break;
        try {
            const sessionPath = path_1.default.join(CONFIG.STORAGE_BASE, sessionId);
            const sessionSize = await getDirectorySize(sessionPath);
            const sessionSizeGB = sessionSize.size / 1024 / 1024 / 1024;
            await promises_1.default.rm(sessionPath, { recursive: true });
            currentSize -= sessionSizeGB;
            console.log(`🗑️ Removed session ${sessionId} (${Math.round(sessionSizeGB * 100) / 100}GB)`);
        }
        catch (error) {
            console.error(`❌ Failed to remove session ${sessionId}:`, error);
        }
    }
    console.log(`✅ Cleanup complete. New size: ${Math.round(currentSize * 100) / 100}GB`);
}
// Ensure storage directory exists
async function ensureStorageDirectory() {
    try {
        await promises_1.default.access(CONFIG.STORAGE_BASE);
        console.log(`📁 Storage directory exists: ${CONFIG.STORAGE_BASE}`);
    }
    catch {
        console.log(`📁 Creating storage directory: ${CONFIG.STORAGE_BASE}`);
        await promises_1.default.mkdir(CONFIG.STORAGE_BASE, { recursive: true });
    }
}
// Start server
async function startServer() {
    try {
        await ensureStorageDirectory();
        app.listen(CONFIG.PORT, () => {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'object-storage',
                event: 'server_started',
                port: CONFIG.PORT,
                environment: CONFIG.NODE_ENV,
                storageBase: CONFIG.STORAGE_BASE
            }));
        });
    }
    catch (error) {
        console.error('Failed to start Object Storage server:', error);
        process.exit(1);
    }
}
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
if (require.main === module) {
    startServer();
}
