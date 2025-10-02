"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectStorageClient = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const shared_1 = require("@tpfinal/shared");
const config_1 = require("../config");
class ObjectStorageClient {
    constructor(basePath = config_1.CONFIG.OBJECT_STORAGE_BASE) {
        this.basePath = basePath;
    }
    async saveFrame(sessionId, frameBuffer, timestamp) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        const framesDir = path_1.default.join(sessionDir, 'frames');
        // Asegurar que el directorio existe
        await (0, shared_1.ensureDirectoryExists)(framesDir);
        // Nombre del archivo
        const filename = `frame_${timestamp}.jpg`;
        const filePath = path_1.default.join(framesDir, filename);
        // Guardar frame
        await promises_1.default.writeFile(filePath, frameBuffer);
        // Retornar URL relativa
        return `/${sessionId}/frames/${filename}`;
    }
    async saveThumb(sessionId, thumbBuffer) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        // Asegurar que el directorio existe
        await (0, shared_1.ensureDirectoryExists)(sessionDir);
        const filePath = path_1.default.join(sessionDir, 'thumb.jpg');
        // Guardar thumbnail  
        await promises_1.default.writeFile(filePath, thumbBuffer);
        // Retornar URL relativa
        return `/${sessionId}/thumb.jpg`;
    }
    async saveMetadata(sessionId, metadata) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        // Asegurar que el directorio existe
        await (0, shared_1.ensureDirectoryExists)(sessionDir);
        const filePath = path_1.default.join(sessionDir, 'meta.json');
        // Guardar metadatos como JSON
        await promises_1.default.writeFile(filePath, JSON.stringify(metadata, null, 2));
        // Guardar timestamp de actualización
        const tsFilePath = path_1.default.join(sessionDir, 'meta.ts');
        await promises_1.default.writeFile(tsFilePath, Date.now().toString());
        // Retornar URL relativa
        return `/${sessionId}/meta.json`;
    }
    async readFrame(sessionId, frameFilename) {
        const filePath = path_1.default.join(this.basePath, sessionId, 'frames', frameFilename);
        return await promises_1.default.readFile(filePath);
    }
    async readThumb(sessionId) {
        const filePath = path_1.default.join(this.basePath, sessionId, 'thumb.jpg');
        return await promises_1.default.readFile(filePath);
    }
    async readMetadata(sessionId) {
        const filePath = path_1.default.join(this.basePath, sessionId, 'meta.json');
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    async listFrames(sessionId) {
        const framesDir = path_1.default.join(this.basePath, sessionId, 'frames');
        try {
            const files = await promises_1.default.readdir(framesDir);
            return files.filter(file => file.endsWith('.jpg')).sort();
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    async sessionExists(sessionId) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        try {
            await promises_1.default.access(sessionDir);
            return true;
        }
        catch {
            return false;
        }
    }
    async getSessionStats(sessionId) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        let framesCount = 0;
        let hasThumb = false;
        let hasMeta = false;
        let totalSize = 0;
        try {
            // Contar frames
            const framesDir = path_1.default.join(sessionDir, 'frames');
            try {
                const frames = await promises_1.default.readdir(framesDir);
                framesCount = frames.filter(f => f.endsWith('.jpg')).length;
                // Calcular tamaño de frames
                for (const frame of frames) {
                    const stats = await promises_1.default.stat(path_1.default.join(framesDir, frame));
                    totalSize += stats.size;
                }
            }
            catch {
                // Directorio no existe
            }
            // Verificar thumb
            try {
                const thumbStats = await promises_1.default.stat(path_1.default.join(sessionDir, 'thumb.jpg'));
                hasThumb = true;
                totalSize += thumbStats.size;
            }
            catch {
                // Thumb no existe
            }
            // Verificar meta
            try {
                const metaStats = await promises_1.default.stat(path_1.default.join(sessionDir, 'meta.json'));
                hasMeta = true;
                totalSize += metaStats.size;
            }
            catch {
                // Meta no existe
            }
        }
        catch (error) {
            console.warn(`⚠️ Error getting session stats for ${sessionId}:`, error);
        }
        return { framesCount, hasThumb, hasMeta, totalSize };
    }
    async cleanupSession(sessionId) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        try {
            await promises_1.default.rm(sessionDir, { recursive: true, force: true });
            console.log(`🗑️ Cleaned up session directory: ${sessionId}`);
        }
        catch (error) {
            console.error(`❌ Failed to cleanup session ${sessionId}:`, error);
            throw error;
        }
    }
    // Crear estructura de directorio para una nueva sesión
    async initializeSession(sessionId) {
        const sessionDir = path_1.default.join(this.basePath, sessionId);
        const framesDir = path_1.default.join(sessionDir, 'frames');
        await (0, shared_1.ensureDirectoryExists)(framesDir);
    }
    getAbsolutePath(relativePath) {
        // Remover slash inicial si existe
        const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
        return path_1.default.join(this.basePath, cleanPath);
    }
    getRelativeUrl(sessionId, filename) {
        return `/${sessionId}/${filename}`;
    }
}
exports.ObjectStorageClient = ObjectStorageClient;
