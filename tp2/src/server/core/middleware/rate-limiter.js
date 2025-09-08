import { CONFIG } from "../../config.js";
import { PROTOCOL, makeError } from "../../../protocol/index.js";

/**
 * ============================================================================
 * RATE LIMITER
 * ============================================================================
 * Implementa Token Bucket Algorithm para controlar la velocidad de requests.
 *
 * Estrategia simple:
 * - Un bucket por conexión TCP
 * - Permite AUTH sin rate limiting (para conexión inicial)
 * - Auto-cleanup cuando se cierra la conexión (GC automático)
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  async process(context) {
    const { connection, message, startedAt } = context;

    // Permitir AUTH sin rate limiting para evitar bloqueos en conexión inicial
    if (message.act === PROTOCOL.CORE_ACTS.AUTH) {
      return true;
    }

    // Obtener o crear bucket para esta conexión
    const bucket = this._getBucket(connection.id);

    // Verificar si puede procesar el request
    if (!bucket.take(1)) {
      const retryAfterMs = bucket.getRetryAfterMs();
      context.reply(
        makeError(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.RATE_LIMITED,
          "Rate limit exceeded",
          { retryAfterMs, startedAt }
        )
      );
      return false;
    }

    return true; // Continuar pipeline
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Obtiene o crea un token bucket para una conexión
   */
  _getBucket(connectionId) {
    if (!this.buckets.has(connectionId)) {
      this.buckets.set(connectionId, new TokenBucket(CONFIG.RL_SOCKET));
    }
    return this.buckets.get(connectionId);
  }
}

/**
 * ============================================================================
 * TOKEN BUCKET ALGORITHM
 * ============================================================================
 * Implementación simple y eficiente del algoritmo Token Bucket.
 *
 * Funcionamiento:
 * - Bucket tiene capacidad máxima de tokens
 * - Se rellenan tokens a velocidad constante (refillRate)
 * - Cada request consume tokens
 * - Si no hay tokens suficientes, se rechaza el request
 */
class TokenBucket {
  constructor({ capacity, refillPerSec }) {
    this.capacity = Math.max(1, capacity | 0);
    this.refillRate = Math.max(0, refillPerSec);
    this.tokens = this.capacity; // Comenzar lleno
    this.lastRefill = Date.now();
  }

  /**
   * Intenta consumir tokens del bucket
   */
  take(count = 1) {
    this._refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Rellena tokens basado en el tiempo transcurrido
   */
  _refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;

    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  /**
   * Calcula cuándo estará disponible el próximo token
   */
  getRetryAfterMs() {
    if (this.refillRate <= 0) return 5000; // Default fallback

    // Time to get 1 token
    const timePerToken = 1000 / this.refillRate;
    return Math.ceil(timePerToken);
  }
}
