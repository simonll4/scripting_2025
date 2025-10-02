"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = void 0;
const winston_1 = __importDefault(require("winston"));
const createLogger = (service, level = 'info') => {
    return winston_1.default.createLogger({
        level,
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json(), winston_1.default.format.printf(({ timestamp, level, message, service: svc, ...meta }) => {
            return JSON.stringify({
                timestamp,
                level,
                service: svc || service,
                message,
                ...meta
            });
        })),
        defaultMeta: { service },
        transports: [
            new winston_1.default.transports.Console({
                format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
            }),
            new winston_1.default.transports.File({
                filename: `logs/${service}-error.log`,
                level: 'error'
            }),
            new winston_1.default.transports.File({
                filename: `logs/${service}.log`
            })
        ]
    });
};
exports.createLogger = createLogger;
//# sourceMappingURL=logger.js.map