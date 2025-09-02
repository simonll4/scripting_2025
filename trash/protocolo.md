# Protocolo del Agente (v1)

## 1) Visión general
- **Canal**: TCP (Node `net`).
- **Framing**: length-prefixed (`UInt32BE length` + `JSON UTF-8`).
- **Modelo**: mensajes con **envelope estándar** (`v/t/id/act/data`).
- **Control-plane**: `HELLO` y `AUTH`.
- **Data-plane**: acciones (p. ej. `GET_OS_INFO`, `QUIT`), despachadas por un **Command Registry**.
- **Validación**: JSON Schema (AJV) por acción.
- **Autorización**: por **scopes** del token (roles solo para crear tokens).

---

## 2) Transporte y framing

### 2.1 Transporte
- TCP full-duplex, un socket por cliente.
- Optimizaciones:
  - `setNoDelay(true)` (baja latencia).
  - `setKeepAlive(true, HEARTBEAT_MS)` (detección de zombies).

### 2.2 Framing (obligatorio)
```
[ 4 bytes UInt32BE = L ][ L bytes de JSON UTF-8 ]
```
- `MAX_FRAME` por defecto: **262144 bytes** (256 KiB).  
- Si un frame excede `MAX_FRAME` → conexión cerrada con `ERR: PAYLOAD_TOO_LARGE`.

---

## 3) Envelope (contrato del mensaje)

```json
{
  "v": 1,
  "t": "hello | req | res | err",
  "id": "string",
  "act": "STRING",
  "data": { }
}
```

- `hello`: sólo server→cliente (capabilities iniciales).
- `req`: cliente→server; **siempre** con `id` único y `act`.
- `res`: server→cliente; **mismo** `id` y `act` que el `req`.
- `err`: server→cliente; **mismo** `id` y `act` del `req` fallido, con `code`/`msg`.

---

## 4) Handshake y keep-alive

### 4.1 HELLO
- **Server → Client (al conectar)**
```json
{ "v":1, "t":"hello", "data": { "maxFrame": 262144, "heartbeat": 30000 } }
```

### 4.2 AUTH
- **Única acción permitida sin sesión**.
- **Request**:
```json
{ "v":1, "t":"req", "id":"c1", "act":"AUTH", "data": { "token": "<opaque>" } }
```
- **Response OK**:
```json
{ "v":1, "t":"res", "id":"c1", "act":"AUTH",
  "data": { "sessionId":"S-abc", "scopes":["getosinfo", "..."] } }
```
- **Response Error**:
```json
{ "v":1, "t":"err", "id":"c1", "act":"AUTH",
  "code":"INVALID_TOKEN", "msg":"revoked/expired/invalid" }
```

### 4.3 Keep-alive (recomendado)
- Cliente envía `PING` cada `heartbeat` ms y espera `RES`.
- Server responde siempre al `PING`.

**Request**
```json
{ "v":1, "t":"req", "id":"hb1", "act":"PING" }
```
**Response**
```json
{ "v":1, "t":"res", "id":"hb1", "act":"PING", "data": { "pong": true, "ts": 16934... } }
```

---

## 5) Autenticación y autorización

### 5.1 Token
- **Formato en el protocolo**: string opaco (`data.token`).  
- **Implementación interna** (recomendada):
  - `tokenId.secret` generado por admin.
  - En DB se guarda **solo el hash** Argon2id del `secret`.
  - Campos: `tokenId`, `secretHash`, `scopes` (JSON), `expires_at`, `revoked`.

### 5.2 Scopes
- Autorización **por scope** (no por rol).  
- Ejemplos: `getosinfo`, `watch`, `getwatches`, `ps`, `oscmd`.  
- `*` → acceso total.

### 5.3 Sesión
- Tras `AUTH OK`, el server crea `session { sessionId, tokenId, scopes, socket }` ligada a esa conexión.

---

## 6) Acciones (data-plane)

### 6.1 Validación (AJV)
- Cada acción define un **JSON Schema** para `data`.
- Opciones habilitadas: `coerceTypes`, `useDefaults`, `removeAdditional`.

### 6.2 Ejemplos

#### GET_OS_INFO
**Request**
```json
{ "v":1, "t":"req", "id":"c2", "act":"GET_OS_INFO", "data": { "seconds": 60 } }
```
**Response**
```json
{ "v":1, "t":"res", "id":"c2", "act":"GET_OS_INFO",
  "data": { "samples":[ { "cpu":0.12, "mem":2048, "time":16934... } ] } }
```

#### QUIT
**Request**
```json
{ "v":1, "t":"req", "id":"c9", "act":"QUIT" }
```
**Response**
```json
{ "v":1, "t":"res", "id":"c9", "act":"QUIT", "data": { "bye": true } }
```

---

## 7) Errores (códigos)

- `BAD_REQUEST`
- `AUTH_REQUIRED`
- `INVALID_TOKEN`
- `TOKEN_EXPIRED`
- `FORBIDDEN`
- `UNKNOWN_ACTION`
- `PAYLOAD_TOO_LARGE`
- `RATE_LIMITED`
- `INTERNAL_ERROR`
- `CONNECTION`

Formato:
```json
{ "v":1, "t":"err", "id":"<reqId>", "act":"<act>",
  "code":"FORBIDDEN", "msg":"scope getosinfo required" }
```

---

## 8) Flujo de ejemplo

```
Client                                Server
  |                                      |
  |---------------------- TCP connect --->|
  |                                      |
  |<----------- HELLO {maxFrame,heartbeat}|
  |                                      |
  |-- REQ id=c1 act=AUTH {token} ------->|
  |                                      |
  |<-- RES id=c1 act=AUTH {sessionId,scopes}
  |                                      |
  |-- REQ id=c2 act=GET_OS_INFO {60} --->|
  |                                      |
  |<-- RES id=c2 act=GET_OS_INFO {samples}
  |                                      |
  |-- REQ id=c3 act=QUIT --------------->|
  |                                      |
  |<-- RES id=c3 act=QUIT {bye:true}     |
  |                                      X (close)
```

---

## 9) Seguridad (laboratorio vs. producción)

- **Laboratorio**: TCP plano, token opaco aceptable.  
- **Producción**: TLS, Argon2id, revocación inmediata, rate-limiting.

---

## 10) Versionado

- `v=1`.  
- Cambios incompatibles → nueva versión.  
- Cliente y server deben coincidir en versión.
