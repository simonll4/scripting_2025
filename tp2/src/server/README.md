# Server: Arquitectura Breve y Flujo

## Módulos

- Core: server, connection-manager, message-pipeline, middlewares, health-service.
- Business: commands/_ (act, handler, schema), services/_.
- Security: auth (token + validator), scopes, session.
- DB: DAO
- Utils: logger

## Flujo del mensaje

```
TCP crudo
  ↓
Deframer + JSON
  (length-prefix → objeto)
  ↓
MessagePipeline
  ↓
MessageValidator
  (envelope OK?)
  ↓
RateLimiter
  (bucket OK?)
  ↓
AuthGuard
  (AUTH o sesión?)
  ↓
PayloadValidator
  (schema OK?)
  ↓
CommandRouter
  (permiso + run)
  ↓
Response
```

## Pipeline (resumen)

- Deframer + JSON: separa frames por length-prefix y emite objetos (`setupTransportPipeline` hace el `JSON.parse`).
- MessagePipeline: chain-of-responsibility por conexión; envía `HELLO`, maneja `PING/PONG`, aplica `MAX_IN_FLIGHT`, `MAX_PAYLOAD_BYTES` y timeout `CMD_TIMEOUT_MS`.
- MessageValidator: valida envelope (`id/act/data`); si falla, responde `BAD_REQUEST` y corta.
- RateLimiter: token bucket por conexión; `AUTH` no consume; si excede, responde `RATE_LIMITED` con `retryAfterMs`.
- AuthGuard: procesa `AUTH` (valida payload + token en DB), crea sesión y responde; para otros `act` exige sesión o devuelve `UNAUTHORIZED/INVALID_TOKEN`.
- PayloadValidator: valida `data` con el schema AJV del comando (saltea `AUTH`); retorna hasta 3 errores de validación.
- CommandRouter: resuelve comando por `act`, chequea `scope`, ejecuta el handler y responde; si `closeAfter`, cierra la conexión (p.ej., `QUIT`).
- Response / Close: siempre usa `makeResponse` o `makeError`; cierre por QUIT, heartbeat perdido o shutdown.

Coberturas adicionales del flujo:

- Solo se procesa `REQ`; `PING/PONG` se responden/consumen automáticamente.
- Pre‑checks previos a middlewares: `MAX_IN_FLIGHT` → `TOO_MANY_IN_FLIGHT`; `MAX_PAYLOAD_BYTES` → `PAYLOAD_TOO_LARGE`.
- Deadline por request: `CMD_TIMEOUT_MS` → `DEADLINE_EXCEEDED` si la cadena no responde a tiempo.
- Transporte: `MAX_FRAME` en deframer; `bad-frame`/`bad-json` emiten `transport-error` y el socket se destruye defensivamente.
- Contexto: `reply()` agrega `latencyMs` en `meta`; `touchSession()` renueva `lastUsed` de la sesión por actividad.
- Router: si el `act` no existe → `UNKNOWN_ACTION`; sin permisos → `FORBIDDEN`.
- Backpressure: si `writableNeedDrain`, se pausa el deframer y se reanuda en `drain`.
