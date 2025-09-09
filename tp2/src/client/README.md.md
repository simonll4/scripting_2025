# Client: Resumen

CLI TCP que se conecta al server, se autentica con token y ejecuta comandos remotos. Usa frames length‑prefix + JSON para transportar mensajes.

## Organización

- Core: `core/client.js` (estado, colas, in‑flight, timeouts) y `core/socket.js` (TCP + transporte + reconfig por HELLO).
- CLI: `cli/prompt.js` (REPL + history) y `cli/commands/*` (parseo y armado de payloads).
- Utils: `utils/formatter.js` (salidas), `utils/logger.js`, `utils/history.js`.
- Config: `config.js` (host/port/token, timeouts, keepalive).

## Ciclo básico

- Conexión → llega `HELLO` y se ajusta transporte/limites.
- Auth automática con el token (`AUTH`).
- Comandos: se envían `REQ` respetando `MAX_IN_FLIGHT` y timeouts; responde `PONG` a `PING`.
- Cierre: muestra `RES/ERR`; cierra en `SRV_CLOSE`, `QUIT` o error crítico de auth.

## Config

- Env vars: `AGENT_HOST`, `AGENT_PORT`, `AGENT_TOKEN`, `AGENT_CONNECT_TIMEOUT`, `AGENT_REQUEST_TIMEOUT`, `AGENT_KEEPALIVE`.
