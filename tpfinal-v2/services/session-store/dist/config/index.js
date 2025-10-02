"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = exports.isDevelopment = exports.CONFIG = void 0;
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
// Cargar variables de entorno
(0, dotenv_1.config)({ path: path_1.default.resolve(__dirname, '../../../.env') });
exports.CONFIG = {
    // Servidor
    PORT: parseInt(process.env.SESSION_STORE_PORT || '8080'),
    NODE_ENV: process.env.NODE_ENV || 'development',
    // Base de datos
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/session_store',
    // Servicios externos
    ATTRIBUTE_ENRICHER_URL: process.env.ATTRIBUTE_ENRICHER_URL || 'http://localhost:8081',
    OBJECT_STORAGE_URL: process.env.OBJECT_STORAGE_URL || 'http://localhost:8090',
    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    // Rate limiting
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutos
    RATE_LIMIT_MAX_REQUESTS: 1000, // requests por ventana
    // Paginación
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 1000,
    // Query limits
    MAX_QUERY_TOKENS: 10
};
exports.isDevelopment = exports.CONFIG.NODE_ENV === 'development';
exports.isProduction = exports.CONFIG.NODE_ENV === 'production';
