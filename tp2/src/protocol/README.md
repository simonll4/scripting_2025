# Protocolo — Guía Rápida

## Transporte (framing)

Cada mensaje viaja en un frame binario de **dos partes**:

```
+---------------------------+-------------------------+
| len (4 bytes, uint32 BE) | json (UTF-8, compacto)  |
+---------------------------+-------------------------+
```

- `len` es la longitud (en bytes) del JSON.
- **Receptor**: deframenta por longitud y luego parsea el JSON.
- **Errores de transporte**: frame demasiado grande o JSON inválido ⇒ emitir `transport-error` y cerrar el socket.


###  Handshake de Aplicación (Capa de Aplicación)
```
Cliente ← SERVER HELLO (capabilities) 
Cliente AUTH → SERVER
Cliente ← SERVER AUTH_OK (sesionId) 
```

## Versionado

Todos los envelopes incluyen `v` (versión).

## Tipos de mensajes

### 1) HELLO (servidor → cliente)

Mensaje informativo inicial con _hints_ (no hay negociación).

```json
{
  "v": 1,
  "t": "hello",
  "data": {
    "maxFrame": 262144,
    "maxPayload": 64000,
    "heartbeatMs": 15000,
    "maxInFlight": 8,
    "serverVersion": 1
  }
}
```

**Uso**: el cliente ajusta keep-alive y límites locales según estos valores.

---

### 2) REQ (request)

Solicitud de acción.

```json
{
  "v": 1,
  "t": "req",
  "id": "1d3a2f...",
  "act": "GET_OS_INFO",
  "data": {},
  "meta": { "clientTs": 1736291200000 }
}
```

- `id`: correlación request/response (string ≤ 64).
- `act`: nombre de la acción (string ≤ 64).
- `data`: payload del comando (puede ser `null`).
- `meta.clientTs`: timestamp local del envío (ms).

---

### 3) RES (response OK)

Respuesta exitosa a un `REQ`.

```json
{
  "v": 1,
  "t": "res",
  "id": "1d3a2f...",
  "act": "GET_OS_INFO",
  "ok": true,
  "data": {},
  "meta": { "serverTs": 1736291200123, "latencyMs": 45 }
}
```

- `meta.serverTs`: cuándo se construyó la respuesta (ms).
- `meta.latencyMs`: `serverTs - startedAt`

---

### 4) ERR (response error)

Respuesta de error a un `REQ`.

```json
{
  "v": 1,
  "t": "err",
  "id": "1d3a2f...",
  "act": "GET_OS_INFO",
  "ok": false,
  "code": "FORBIDDEN",
  "msg": "Required scope: admin",
  "retryAfterMs": 2000,
  "details": {},
  "meta": { "serverTs": 1736291200123, "latencyMs": 2 }
}
```

- `code`: uno de los códigos estándar (ver sección Códigos).
- `msg`: descripción breve para humanos.
- `retryAfterMs` (opcional): ventana sugerida de reintento.
- `details` (opcional): info adicional para diagnóstico.

---

### 5) PING / PONG

Keep-alive de aplicación.

```json
{ "v": 1, "t": "ping" }
{ "v": 1, "t": "pong" }
```

---

### 6) SRV_CLOSE

Señalización de cierre ordenado antes de cortar la conexión.

```json
{ "v": 1, "t": "srv_close" }
```

## Códigos de error (resumen)

```
BAD_REQUEST, UNAUTHORIZED, AUTH_REQUIRED, INVALID_TOKEN, TOKEN_EXPIRED,
FORBIDDEN, UNKNOWN_ACTION, PAYLOAD_TOO_LARGE, RATE_LIMITED, TOO_MANY_IN_FLIGHT,
DEADLINE_EXCEEDED, INTERNAL_ERROR, CONNECTION, CMD_NOT_ALLOWED, BIN_NOT_FOUND,
INVALID_REGEX
```

## Límites recomendados (hints)

```
MAX_FRAME: 256 KB
MAX_PAYLOAD_BYTES: 64 KB
HEARTBEAT_MS: 15 s
MAX_IN_FLIGHT: 8
REQUEST_TIMEOUT_MS (cliente): 30 s
CMD_TIMEOUT_MS (servidor): 10 s
```

## Flujo típico

1. Conexión TCP → servidor envía `HELLO`.
2. Cliente inicia `PING/PONG` periódico (según `heartbeatMs`).
3. Cliente envía `REQ` con `id` único.
4. Servidor responde `RES`/`ERR` con `serverTs` (+ `latencyMs` si corresponde).
5. Para cierre ordenado: `SRV_CLOSE` y luego cerrar el socket.
