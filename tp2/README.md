# TP2 — Agente TCP

Solución compuesta por un agente TCP (server) y un cliente CLI (client) que se comunican con un protocolo binario simple (length‑prefix + JSON). La autenticación se realiza con tokens administrados por un script `admin.js` que persiste en SQLite.

## Vista general

- Agent (server): procesa conexiones TCP, autentica con tokens y ejecuta comandos de negocio.
- Client (CLI): se conecta, se autentica con el token y envía comandos (`REQ`).
- SQLite: almacenamiento de tokens, watches y métricas del sistema.
- admin.js: gestiona tokens (crear/revocar) contra la base.

Diagrama (alto nivel):

```
          (script)              token
          [admin.js] ===========================> [Client]
              |                                      |
              | create/revoke tokens                 | REQ/RES
              v                                      v
          [SQLite] <============================== [Agent]
      (persistencia)                                (server)
```

## Cómo correr

1. Instalar dependencias (raíz del repo)

- `npm install`

2. Levantar el server

- `node tp2/src/server/index.js`
  - Escucha en `PORT=4000` por defecto (configurable en `tp2/src/server/config.js`).

3. Crear un token con admin.js (desde `tp2/src/server/scripts`)

- `node admin.js create <role> [expiresSeconds]`
  - Roles disponibles: `user`, `admin` (ver `security/scopes.js`).
  - Muestra `tokenId.secret` (usa ese valor completo como token del cliente).
- Revocar: `node admin.js revoke <tokenId>`

4. Ejecutar el cliente

- Con variable de entorno: `AGENT_TOKEN=<token> node tp2/src/client/index.js`
- O como argumento: `node tp2/src/client/index.js <token>`

## Protocolo (`tp2/src/protocol`)

- Framing length‑prefix + JSON y handshake `HELLO` con hints.
- Tipos: `REQ/RES/ERR`, `PING/PONG`, `SRV_CLOSE`; límites globales: `MAX_FRAME`, `MAX_PAYLOAD_BYTES`, `MAX_IN_FLIGHT`, `CMD_TIMEOUT_MS`.
- Detalle completo: `tp2/src/protocol/README.md`.

## Notas

- Persistencia: tokens + datos de negocio en SQLite (el server inicializa la DB al arrancar).

## Documentación

- Server docs: `tp2/src/server/README.md`
- Script admin: `tp2/src/server/scripts/README.md`
- Client docs: `tp2/src/client/README.md.md`
- Protocol docs: `tp2/src/protocol/README.md`
