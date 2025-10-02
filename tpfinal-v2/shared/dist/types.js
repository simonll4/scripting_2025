"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseToken = exports.generateDetectionId = exports.generateSessionId = exports.DetectionError = exports.SessionError = exports.SessionState = void 0;
// Estados del Edge Agent
var SessionState;
(function (SessionState) {
    SessionState["IDLE"] = "IDLE";
    SessionState["OPEN"] = "OPEN";
    SessionState["ACTIVE"] = "ACTIVE";
    SessionState["CLOSING"] = "CLOSING";
    SessionState["CLOSED"] = "CLOSED";
})(SessionState || (exports.SessionState = SessionState = {}));
// Errores tipados
class SessionError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'SessionError';
    }
}
exports.SessionError = SessionError;
class DetectionError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'DetectionError';
    }
}
exports.DetectionError = DetectionError;
// Utilidades
const generateSessionId = () => {
    const now = new Date();
    return `sess-${now.toISOString().replace(/[:.]/g, '').slice(0, -1)}Z`;
};
exports.generateSessionId = generateSessionId;
const generateDetectionId = (sessionId, timestamp, className) => {
    return `${sessionId}:${timestamp}:${className}`;
};
exports.generateDetectionId = generateDetectionId;
const parseToken = (token) => {
    if (token.includes(':')) {
        const [className, attr] = token.split(':', 2);
        if (attr.includes('=')) {
            const [key, value] = attr.split('=', 2);
            return { class: className, attribute: { key, value } };
        }
        return { class: className, attribute: { key: attr } };
    }
    return { class: token };
};
exports.parseToken = parseToken;
//# sourceMappingURL=types.js.map