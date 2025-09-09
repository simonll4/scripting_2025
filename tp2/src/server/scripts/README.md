# admin.js — Gestión de tokens

Script CLI para crear y revocar tokens de acceso del agente. Usa SQLite como backend y `argon2id` para resguardar el secreto.

## Tipo de token y formato

- Tipo: token dividido en dos partes: `tokenId.secret`.
  - `tokenId`: 16 bytes aleatorios en hex (identificador público).
  - `secret`: 32 bytes aleatorios en Base64URL (se almacena hasheado con Argon2id).
- El valor que se entrega al cliente es la concatenación exacta `tokenId.secret` (incluyendo el punto).

## Almacenamiento

- Base: `tp2/db/db.sqlite` (creada/inicializada por el server al arrancar).
- Tabla `tokens` (campos relevantes):
  - `tokenId` (texto): clave pública del token.
  - `secretHash` (texto): hash Argon2id del `secret`.
  - `scopes` (json): lista de permisos asociados.
  - `created_at` (ms epoch), `expires_at` (ms epoch o null), `revoked` (0/1).

## Roles y scopes

- Los scopes se derivan del rol al crear el token: ver `tp2/src/server/security/scopes.js` (`ROLE_SCOPES`).
- Ejemplos de scopes: `getosinfo`, `watch`, `getwatches`, `ps`, `oscmd`, `*` (admin).

## Expiración y revocación

- Expiración opcional al crear (`expiresSeconds`). Si es `null`, no expira por tiempo.
- Revocación lógica marcando `revoked = 1`.

## Validación en el server (resumen)

1. El cliente envía `AUTH` con el token `tokenId.secret`.
2. El server busca `tokenId` en SQLite y verifica: no revocado, no expirado y `argon2.verify(secretHash, secret)`.
3. Si es válido, se crea sesión con los `scopes` del token.

## Ejemplos de uso

- Crear token sin expiración (rol user):

  - `node admin.js create user`

- Crear token admin que expira en 1h:

  - `node admin.js create admin 3600`

- Revocar token (se usa solo el tokenId, sin el secreto):
  - `node admin.js revoke <tokenId>`

Salida típica de "create":

```
Token:
9fa5bbe86bf46b2f2d22198d9f1b4721.lONPgh9qvAwRo314YUOcuZ0achIll3VfQY3P6wDYmME
Scopes: [ 'getosinfo', 'watch', 'getwatches' ] Expira: 2025-09-09T12:00:00.000Z
```

> El "token" es exactamente la cadena impresa tras `Token:` (incluye el punto entre `tokenId` y `secret`).
