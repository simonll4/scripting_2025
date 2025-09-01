# Módulo de Protocolo

Este directorio contiene el módulo centralizado del protocolo de comunicación entre el cliente y el servidor del agente.

## Estructura

```
src/protocol/
├── index.js      # Punto de entrada principal
├── protocol.js   # Definiciones del protocolo (constantes, códigos de error, etc.)
├── messages.js   # Utilidades para construcción y validación de mensajes
└── README.md     # Esta documentación
```

## Características

### Definiciones del Protocolo (`protocol.js`)

- **PROTOCOL**: Constantes principales del protocolo
  - `VERSION`: Versión actual del protocolo
  - `TYPES`: Tipos de mensajes (HELLO, REQ, RES, ERR)
  - `ERROR_CODES`: Códigos de error estándar
  - `LIMITS`: Límites de frame, timeouts, etc.
  - `CORE_ACTS`: Acciones centrales del protocolo
  - `COMPAT`: Información de compatibilidad

> **Nota**: Los scopes de autorización se movieron al módulo `server/utils/auth/scopes.js` 
> ya que son específicos de la implementación del servidor, no del protocolo en sí.

### Utilidades de Mensajes (`messages.js`)

- **Constructores de mensajes**:
  - `makeHello()`: Mensaje de saludo inicial
  - `makeRequest()`: Mensaje de solicitud
  - `makeResponse()`: Mensaje de respuesta exitosa
  - `makeError()`: Mensaje de error

- **Validación**:
  - `validateMessageEnvelope()`: Valida estructura básica de mensajes
  - `ErrorTemplates`: Plantillas para errores comunes

## Uso

### En el Servidor

```javascript
import { PROTOCOL, ErrorTemplates } from "../../protocol/index.js";
import { SCOPES } from "./auth/scopes.js"; // Scopes específicos del servidor

// Crear respuesta exitosa
const response = makeResponse(messageId, action, data);

// Crear error
const error = makeError(messageId, action, PROTOCOL.ERROR_CODES.UNAUTHORIZED, "Auth required");

// Usar scopes
if (!hasScope(session, SCOPES.GET_OS_INFO)) { /* denied */ }
```

### En el Cliente

```javascript
import { PROTOCOL, makeRequest } from "../protocol/index.js";

// Crear request
const request = makeRequest(id, PROTOCOL.CORE_ACTS.GET_OS_INFO, { seconds: 60 });
```

## Ventajas

1. **Consistencia**: Tanto cliente como servidor usan las mismas definiciones
2. **Mantenibilidad**: Cambios en el protocolo se reflejan automáticamente en ambos
3. **Centralización**: Un solo lugar para definir el protocolo
4. **Documentación**: Todas las constantes y utilidades están documentadas
5. **Validación**: Funciones centralizadas para validar mensajes

## Compatibilidad

El módulo mantiene aliases para compatibilidad hacia atrás:
- `makeRes` → `makeResponse`
- `makeErr` → `makeError`  
- `assertEnvelope` → `validateMessageEnvelope`

## Extensión

Para agregar nuevas funcionalidades al protocolo:

1. Agregar constantes en `protocol.js` si es necesario
2. Crear constructores de mensajes en `messages.js` si se requieren nuevos tipos
3. Exportar las nuevas funciones en `index.js`
4. Actualizar esta documentación
