import { CONFIG } from "../../config.js";
import { PROTOCOL, makeErr } from "../../utils/index.js";

/**
 * Rate Limiter Middleware
 * Implementa Token Bucket Algorithm por socket y por acción
 */
export class RateLimiter {
  constructor() {
    // Map connection -> buckets por acción
    this.connectionBuckets = new Map();
  }

  async process(context) {
    const { connection, message } = context;
    
    // Permitir AUTH sin rate limiting para evitar bloquear autenticación inicial
    if (message.act === PROTOCOL.CORE_ACTS.AUTH) {
      return true;
    }

    const buckets = this._getBuckets(connection.id);
    
    // 1. Rate limit por socket (global)
    if (!buckets.socket.take(1)) {
      context.reply(makeErr(
        message.id,
        message.act,
        PROTOCOL.ERROR_CODES.RATE_LIMITED,
        "Rate limit exceeded (socket)"
      ));
      return false;
    }

    // 2. Rate limit por acción específica
    if (!buckets.getActionBucket(message.act).take(1)) {
      context.reply(makeErr(
        message.id,
        message.act,
        PROTOCOL.ERROR_CODES.RATE_LIMITED,
        `Rate limit exceeded (action: ${message.act})`
      ));
      return false;
    }

    return true;
  }

  _getBuckets(connectionId) {
    if (!this.connectionBuckets.has(connectionId)) {
      this.connectionBuckets.set(connectionId, new ConnectionBuckets());
    }
    return this.connectionBuckets.get(connectionId);
  }

  cleanup(connectionId) {
    this.connectionBuckets.delete(connectionId);
  }
}

/**
 * Token Bucket por conexión
 */
class ConnectionBuckets {
  constructor() {
    this.socket = new TokenBucket(CONFIG.RL_SOCKET);
    this.actionBuckets = new Map();
  }

  getActionBucket(action) {
    if (!this.actionBuckets.has(action)) {
      const config = CONFIG.RL_ACT[action] || CONFIG.RL_ACT_DEFAULT;
      this.actionBuckets.set(action, new TokenBucket(config));
    }
    return this.actionBuckets.get(action);
  }
}

/**
 * Implementación Token Bucket Algorithm
 */
class TokenBucket {
  constructor({ capacity, refillPerSec }) {
    this.capacity = Math.max(1, capacity | 0);
    this.refillRate = Math.max(0, refillPerSec);
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  take(count = 1) {
    this._refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    
    return false;
  }

  _refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    
    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getStatus() {
    this._refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      utilization: (this.capacity - this.tokens) / this.capacity
    };
  }
}
