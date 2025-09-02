# Documentación del Pipeline de Mensajes del Servidor TCP

## Resumen General

El servidor TCP implementa un sistema de procesamiento de mensajes basado en el patrón **Chain of Responsibility** (Cadena de Responsabilidad). Cada mensaje que llega pasa por una serie de middlewares ordenados que validan, autentican, autorizan y finalmente ejecutan el comando solicitado.

## Pipeline de Procesamiento de Mensajes

```
Mensaje TCP crudo
    ↓
MessageDeframer
    ↓ (length-prefix parsing)
JSON Parser
    ↓ (string → objeto)
MessagePipeline
    ↓
MessageValidator
    ↓ (estructura básica válida?)
RateLimiter  
    ↓ (dentro del límite?)
AuthGuard
    ↓ (autenticado o AUTH request?)
PayloadValidator
    ↓ (datos específicos válidos?)
CommandRouter
    ↓ (permisos OK?)
Command Handler
    ↓ (ejecutar lógica)
Response
    ↓
Close? (si closeAfter=true)
```

**Notas del flujo:**
- Cada `↓` puede terminar en error y respuesta inmediata
- AuthGuard tiene lógica especial para requests AUTH
- Solo CommandRouter ejecuta lógica de negocio
- El pipeline se puede cortar en cualquier middleware

## Flujo Detallado por Componentes

### 1. TCPServer (Punto de Entrada)

**Archivo:** `core/server.js`

El servidor TCP es el punto de entrada principal que:
- Acepta conexiones TCP entrantes
- Inicializa la base de datos y módulos de comandos
- Configura el pipeline de mensajes
- Gestiona el ciclo de vida del servidor

```javascript
// Cuando llega una nueva conexión TCP
_handleConnection(socket) {
    const connection = this.connectionManager.create(socket);
    this.pipeline.setup(connection);
}
```

### 2. ConnectionManager (Gestión de Conexiones)

**Archivo:** `core/connection-manager.js`

El gestor de conexiones:
- Asigna un ID único a cada conexión
- Configura el pipeline de transporte (framing + parsing)
- Envía mensaje HELLO inicial con configuración del servidor
- Gestiona el cleanup automático cuando se cierran conexiones
- Maneja sesiones de usuarios autenticados

**Características importantes:**
- Cada conexión recibe un ID único generado con `crypto.randomUUID()`
- Se configura el transporte con `setupTransportPipeline()` que maneja el framing automático
- Envía mensaje HELLO con configuración (`maxFrame`, `heartbeat`)

### 3. Transport Pipeline (Framing y Parsing)

**Archivo:** `protocol/modules/transport.js`

El pipeline de transporte maneja:
- **Framing**: Delimitación de mensajes usando length-prefix (4 bytes little-endian)
- **Parsing**: Conversión de JSON string a objeto JavaScript
- **Event emission**: Emite eventos `message` y `transport-error`

```
Raw TCP Data → MessageDeframer → JSON.parse() → Event 'message'
```

### 4. MessagePipeline (Orquestador Principal)

**Archivo:** `core/message-pipeline.js`

El pipeline de mensajes es el cerebro del sistema:
- Implementa el patrón Chain of Responsibility
- Coordina la ejecución secuencial de middlewares
- Maneja errores de forma centralizada
- Crea el contexto que se comparte entre middlewares

**Contexto compartido:**
```javascript
{
    connection,    // Conexión actual
    message,       // Mensaje parseado
    session,       // Sesión del usuario (si autenticado)
    db,           // Acceso a base de datos
    reply,        // Función para responder
    close         // Función para cerrar conexión
}
```

### 5. Middleware 1: MessageValidator

**Archivo:** `core/middleware/message-validator.js`

**Responsabilidad:** Validar estructura básica del mensaje (envelope del protocolo)

**Validaciones:**
- Verifica que el mensaje no sea null/undefined
- Valida estructura del envelope: `{ id, act, data? }`
- Usa `validateMessageEnvelope()` del protocolo

**Resultado:**
- ✅ Válido → Continúa al siguiente middleware
- ❌ Inválido → Responde con error BAD_REQUEST y termina pipeline

### 6. ⏱️ Middleware 2: RateLimiter

**Archivo:** `core/middleware/rate-limiter.js`

**Responsabilidad:** Control de velocidad por conexión/acción

**Características:**
- Límites configurables por tipo de acción
- Previene spam y ataques de denegación de servicio
- Tracking por conexión individual

**Resultado:**
- ✅ Bajo límite → Continúa al siguiente middleware
- ❌ Excede límite → Responde con error RATE_LIMIT y termina pipeline

### 7. 🔐 Middleware 3: AuthGuard

**Archivo:** `core/middleware/auth-guard.js`

**Responsabilidad:** Autenticación y autorización

**Lógica especial:**
- Si `act === "AUTH"` → Procesa autenticación y crea sesión
- Si no hay sesión → Bloquea acceso (excepto AUTH)
- Si hay sesión → Permite continuar

**Proceso de autenticación:**
```
AUTH request → validateAuth() → validateToken() → createSession() → Response
```

**Resultado:**
- 🆔 AUTH exitoso → Responde con confirmación
- ❌ No autenticado → Responde UNAUTHORIZED y termina
- ✅ Autenticado → Continúa al siguiente middleware

### 8. 📝 Middleware 4: PayloadValidator

**Archivo:** `core/middleware/payload-validator.js`

**Responsabilidad:** Validar payload específico del comando usando JSON Schema

**Proceso:**
- Busca el comando por `act`
- Si tiene schema → Valida `message.data` contra el schema
- Si no tiene schema → Siempre válido

**Resultado:**
- ✅ Válido → Continúa al router con `context.validatedData`
- ❌ Inválido → Responde con errores de validación y termina

### 9. 🎯 Middleware 5: CommandRouter (Terminal)

**Archivo:** `core/middleware/command-router.js`

**Responsabilidad:** Resolver y ejecutar comandos de negocio

**Proceso:**
1. **Resolución:** Busca comando por `act` en el registro de comandos
2. **Autorización:** Verifica scopes/permisos del usuario
3. **Ejecución:** Invoca el handler del comando
4. **Respuesta:** Envía resultado o error al cliente
5. **Cleanup:** Cierra conexión si `closeAfter: true`

**Contexto del handler:**
```javascript
{
    session,      // Datos del usuario autenticado
    data,         // Payload validado del mensaje
    db,           // Acceso a base de datos
    socket,       // Socket TCP directo
    connection    // Wrapper de conexión
}
```

**Resultado:**
- Siempre termina el pipeline (`return false`)
- Responde con SUCCESS o ERROR
- Opcionalmente cierra la conexión

## Registro y Ejecución de Comandos

### Registro de Comandos

**Archivo:** `business/index.js`

Los comandos se registran en el sistema durante la inicialización:

```javascript
// Cada comando exporta: act, command, schema
const commands = new Map();     // act -> command definition
const validators = new Map();   // act -> JSON schema validator

function registerModule(module) {
    commands.set(module.act, module.command);
    if (module.schema) {
        validators.set(module.act, ajv.compile(module.schema));
    }
}
```

### Estructura de un Comando

**Ejemplo:** `business/commands/getosinfo/`

```javascript
// index.js - Exporta la tríada
export const act = "GET_OS_INFO";
export { command } from "./command.js";
export { schema } from "./schema.js";

// command.js - Definición del comando
export default {
    scope: "GET_OS_INFO",        // Permiso requerido
    closeAfter: false,           // No cerrar después de ejecutar
    handler: async (context) => {
        // Lógica de negocio
        return { result: "data" };
    }
};

// schema.js - Validación de payload (opcional)
export default {
    type: "object",
    properties: {
        seconds: { type: "number", minimum: 1 }
    }
};
```
