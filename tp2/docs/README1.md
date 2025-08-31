# Agente TCP - Protocolo de Comunicación

Este proyecto implementa un agente que se ejecuta como servidor TCP y permite la ejecución de comandos remotos con un protocolo de comunicación estandarizado.

## Protocolo

### Características principales:
- **Canal**: TCP (Node.js net)
- **Framing**: length-prefixed (UInt32BE length + JSON UTF-8)
- **Modelo**: mensajes con envelope estándar (v/t/id/act/data)
- **Control-plane**: HELLO y AUTH
- **Data-plane**: acciones despachadas por Command Registry
- **Validación**: JSON Schema (AJV) por acción
- **Autorización**: por scopes del token

### Estructura del envelope:
```json
{
  "v": 1,                          // versión del protocolo
  "t": "hello | req | res | err",  // tipo
  "id": "string",                  // correlación (obligatorio en req/res/err)
  "act": "STRING",                 // acción (AUTH, GET_OS_INFO, QUIT, etc.)
  "data": { }                      // payload específico por acción
}
```

## Estructura del proyecto

```
tp2/
├── src/
│   ├── server.js           # Servidor principal
│   ├── client.js           # Cliente de ejemplo
│   ├── admin.js            # Gestión de tokens
│   ├── config.js           # Configuración del servidor
│   ├── commands/           # Comandos disponibles
│   │   ├── index.js        # Registry de comandos
│   │   ├── getosinfo.js    # Comando GET_OS_INFO
│   │   └── quit.js         # Comando QUIT
│   ├── db/
│   │   └── db.js           # Gestión de base de datos
│   ├── protocol/
│   │   ├── standard.js     # Constantes del protocolo
│   │   └── messages.js     # Helpers para crear mensajes
│   ├── schemas/
│   │   ├── auth.schema.js  # Schema para AUTH
│   │   └── commands/       # Schemas de comandos
│   │       ├── getosinfo.schema.js
│   │       └── quit.schema.js
│   ├── security/
│   │   ├── auth.js         # Autenticación y autorización
│   │   └── validation.js   # Validación AJV
│   └── transport/
│       ├── codec.js        # Framing/Deframing
│       └── msg.js          # Envío de mensajes
├── db/
│   ├── db.sqlite           # Base de datos principal
│   └── schema.sql          # Esquema de base de datos
└── README.md
```

## Uso

### 1. Crear tokens
```bash
# Crear token de usuario (scopes limitados)
node src/admin.js create user [segundos_expiracion]

# Crear token de admin (scope *)
node src/admin.js create admin [segundos_expiracion]

# Revocar token
node src/admin.js revoke <tokenId>
```

### 2. Ejecutar servidor
```bash
node src/server.js
# Servidor escucha en puerto 4000 por defecto
```

### 3. Usar cliente
```bash
node src/client.js <token>
```

#### Comandos disponibles en el cliente:
- `getosinfo [segundos]` - Obtiene información del OS
- `ping` - Ping al servidor
- `quit` - Termina la conexión

## Comandos implementados

### GET_OS_INFO
- **Scope requerido**: `getosinfo`
- **Parámetros**: `seconds` (0-3600, default: 60)
- **Respuesta**: Array de muestras con CPU, memoria y timestamp

### QUIT
- **Scope requerido**: ninguno
- **Parámetros**: ninguno
- **Respuesta**: `{ bye: true }`
- **Comportamiento**: Cierra la conexión después de responder

## Seguridad

- **Tokens**: formato `tokenId.secret` con hash Argon2id
- **Scopes**: autorización granular por funcionalidad
- **Validación**: JSON Schema para todos los payloads
- **Rate limiting**: configuración para límites de frame (256KB default)

## Comandos pendientes de implementar

Según la consigna original, faltan estos comandos:
- `watch path [time]` - Monitoreo de directorio
- `getwatches token` - Obtener eventos de watch
- `ps` - Lista de procesos
- `oscmd "comando"` - Ejecución de comandos del SO (con whitelist de seguridad)

## Variables de entorno

- `PORT`: Puerto del servidor (default: 4000)
- `AGENT_TOKEN`: Token para el cliente (alternativa al argumento CLI)

## Dependencias

- `sqlite3` & `sqlite`: Base de datos
- `argon2`: Hashing de passwords
- `ajv` & `ajv-formats`: Validación JSON Schema
