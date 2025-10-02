"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStoreClient = void 0;
const axios_1 = __importDefault(require("axios"));
const shared_1 = require("@tpfinal/shared");
const config_1 = require("../config");
class SessionStoreClient {
    constructor(baseURL = config_1.CONFIG.SESSION_STORE_URL) {
        this.baseURL = baseURL;
    }
    async openSession(sessionData) {
        return (0, shared_1.retry)(async () => {
            const response = await axios_1.default.post(`${this.baseURL}/api/sessions/open`, sessionData, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Session opened: ${sessionData.session_id}`);
            return response.data;
        }, 3, 1000);
    }
    async closeSession(closeData) {
        return (0, shared_1.retry)(async () => {
            const response = await axios_1.default.post(`${this.baseURL}/api/sessions/close`, closeData, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Session closed: ${closeData.session_id}`);
            return response.data;
        }, 3, 1000);
    }
    async sendDetectionsBatch(batch) {
        return (0, shared_1.retry)(async () => {
            const response = await axios_1.default.post(`${this.baseURL}/api/detections/batch`, batch, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log(`✅ Sent ${batch.batch.length} detections for session ${batch.session_id}`);
            return response.data;
        }, 3, 1000);
    }
    async getSession(sessionId) {
        const response = await axios_1.default.get(`${this.baseURL}/api/sessions/${sessionId}`, { timeout: 5000 });
        return response.data;
    }
    async updateSessionMetadata(sessionId, updates) {
        const response = await axios_1.default.patch(`${this.baseURL}/api/sessions/${sessionId}`, updates, {
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data.session;
    }
    async healthCheck() {
        try {
            const response = await axios_1.default.get(`${this.baseURL}/api/health`, { timeout: 3000 });
            return response.status === 200 && response.data.status === 'healthy';
        }
        catch (error) {
            console.warn(`⚠️ Session Store health check failed:`, error);
            return false;
        }
    }
    // Enviar evento personalizado (para futuras extensiones)
    async sendEvent(eventType, sessionId, data) {
        await axios_1.default.post(`${this.baseURL}/api/events`, {
            event_type: eventType,
            session_id: sessionId,
            timestamp: Date.now(),
            data
        }, {
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
}
exports.SessionStoreClient = SessionStoreClient;
