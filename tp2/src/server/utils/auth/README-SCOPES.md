# Authorization Scopes Module

Este módulo contiene las definiciones de scopes de autorización específicas del servidor.

## Ubicación

```
src/server/utils/auth/scopes.js
```

## ¿Por qué están aquí?

Los scopes **NO son parte del protocolo** sino una **implementación específica del servidor**. El protocolo solo define que existe autorización basada en scopes, pero no cuáles scopes existen.

### Separación de Responsabilidades

- **Protocolo** (`src/protocol/`): Define la estructura de comunicación
- **Servidor** (`src/server/utils/auth/scopes.js`): Define qué permisos existen

## Exports

### `SCOPES`
Constantes de scopes individuales:
```javascript
export const SCOPES = {
  GET_OS_INFO: "getosinfo",
  WATCH: "watch", 
  GET_WATCHES: "getwatches",
  PS: "ps",
  OSCMD: "oscmd",
  ADMIN: "admin",
  ALL: "*",
}
```

### `ROLE_SCOPES`
Mapeo de roles a conjuntos de scopes para administración:
```javascript
export const ROLE_SCOPES = {
  user: [SCOPES.GET_OS_INFO, SCOPES.WATCH, SCOPES.GET_WATCHES],
  admin: [SCOPES.ALL],
  readonly: [SCOPES.GET_OS_INFO, SCOPES.GET_WATCHES],
}
```

## Uso

### En comandos del servidor
```javascript
import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.GET_OS_INFO,
  handler: async (context) => {
    // ...
  }
};
```

### En admin.js
```javascript
import { ROLE_SCOPES } from "../server/utils/auth/scopes.js";

await createToken("user", 3600); // Usa ROLE_SCOPES.user
```

### En middlewares
```javascript
import { SCOPES, hasScope } from "../../utils/index.js";

if (!hasScope(session, SCOPES.ADMIN)) {
  // Denegar acceso
}
```

## Agregar Nuevos Scopes

1. Agregar a `SCOPES`:
```javascript
export const SCOPES = Object.freeze({
  // ... existentes
  NEW_FEATURE: "newfeature",
});
```

2. Actualizar `ROLE_SCOPES` si es necesario:
```javascript
export const ROLE_SCOPES = Object.freeze({
  user: [...existingScopes, SCOPES.NEW_FEATURE],
  // ...
});
```

3. Usar en comandos:
```javascript
export default {
  scope: SCOPES.NEW_FEATURE,
  // ...
};
```

## Ventajas de esta Arquitectura

1. **Flexibilidad**: Diferentes servidores pueden tener diferentes scopes
2. **Protocolo Limpio**: El protocolo no está atado a implementaciones específicas
3. **Mantenibilidad**: Scopes centralizados en un solo lugar del servidor
4. **Reutilización**: ROLE_SCOPES facilita la administración de tokens
