# Protocolo MQTT Agent System

## Topics

### Request Topics
- `request/commands/{agent}/{command}` - Envío de comandos a un agente específico

### Response Topics
- `response/commands/{agent}/{command}/{clientId}` - Respuestas específicas por cliente

### Presence Topics
- `presence/agents/{agent}` - Estado de presencia del agente (retained + LWT)

## Message Envelopes

### Request Envelope
```json
{
  "id": "string",           // Identificador único del request
  "args": {},              // Argumentos del comando
  "replyTo": "string"      // Topic de respuesta (opcional en v5)
}
```

### Response Envelope
```json
{
  "date": "2025-01-16T18:00:00.000Z",
  "command": "string",
  "name": "agente86",
  "id": "string",
  "payload": {
    "message": "string",
    "result": "any",
    "code": "string"       // Código de error opcional
  }
}
```

## MQTT v5 vs v3.1.1

### MQTT v5
- Usa `Response-Topic` property para indicar dónde responder
- Usa `Correlation-Data` property para correlación de requests/responses
- Soporte para propiedades extendidas

### MQTT v3.1.1
- Usa campo `replyTo` en el payload JSON
- Correlación por `id` en el payload
- Compatibilidad con brokers legacy

## Comandos Disponibles

### help
- **Descripción**: Lista comandos disponibles
- **Args**: ninguno
- **Response**: `{ message: "OK", result: [{ command, description }] }`

### ls
- **Descripción**: Lista archivos y carpetas
- **Args**: `{ path: "string" }`
- **Response**: `{ message: "OK", result: [{ path, type }] }`

## Códigos de Error

- `UNKNOWN_COMMAND` - Comando no reconocido
- `INVALID_REQUEST` - Request malformado o inválido
- `ENOENT` - Path no encontrado o acceso denegado

## Ejemplos

### Request MQTT v5
```
Topic: request/commands/agente86/ls
Properties:
  - responseTopic: response/commands/agente86/ls/clp-abc123
  - correlationData: "req-xyz789"
Payload: {"id":"req-xyz789","args":{"path":"."}}
```

### Request MQTT v3.1.1
```
Topic: request/commands/agente86/ls
Payload: {"id":"req-xyz789","args":{"path":"."},"replyTo":"response/commands/agente86/ls/clp-abc123"}
```

### Response
```
Topic: response/commands/agente86/ls/clp-abc123
Payload: {
  "date": "2025-01-16T18:00:00.000Z",
  "command": "ls",
  "name": "agente86",
  "id": "req-xyz789",
  "payload": {
    "message": "OK",
    "result": [
      {"path": "./file1.txt", "type": "file"},
      {"path": "./folder1", "type": "folder"}
    ]
  }
}
```
