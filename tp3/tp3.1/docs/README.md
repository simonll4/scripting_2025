# TP3.1 - Sistema MQTT Agent + Cliente CLP

## 📋 Descripción
Sistema distribuido compuesto por:
- **Agent**: Servidor MQTT que ejecuta comandos remotos (`ls`, `help`)
- **CLP**: Cliente de línea de comandos interactivo para enviar comandos al agente

## 🚀 Uso Rápido

### 1. Iniciar el Agente
```bash
cd agent
node src/index.js
```

### 2. Conectar Cliente CLP
```bash
cd clp  
node src/index.js -h localhost -p 1883 -a agente86
```

### 3. Comandos Disponibles
- `ls [path]` - Lista archivos y directorios del path especificado
- `help` - Muestra comandos disponibles del agente
- `quit` - Termina la sesión del cliente

## ⚙️ Configuración

### Agent (agent/agent.toml)
```toml
[agent]
name = "agente86"
qos = 1
keepalive = 30

[mqtt]
url = "mqtt://localhost:1883"
username = "usuario"
password = "contraseña"

[presence]
enabled = true
topic = "presence/agents/{agent}"
```

### CLP (clp/clp.toml)
```toml
[clp]
agent = "agente86"
qos = 1
request_timeout_ms = 5000

[mqtt]
url = "mqtt://localhost:1883"
username = "usuario"
password = "contraseña"
```

### Parámetros CLI del CLP
```bash
node clp/src/index.js [opciones]

Opciones:
  -h <host>     Host MQTT (sobrescribe TOML)
  -p <port>     Puerto MQTT (default: 1883)
  -u <user>     Usuario MQTT (sobrescribe TOML)
  -P <pass>     Password MQTT (sobrescribe TOML)
  -a <agent>    Nombre del agente (sobrescribe TOML)
  --help        Mostrar ayuda
```

## 📡 Protocolo de Comunicación

### Tópicos MQTT
- **Request**: `request/commands/{agent}/{command}`
- **Response**: `response/commands/{agent}/{command}/{clientId}`
- **Presence**: `presence/agents/{agent}`

### Ejemplo de Flujo
```
1. CLP → request/commands/agente86/ls → Agent
2. Agent → response/commands/agente86/ls/clp-abc123 → CLP
```

### Formato de Mensajes

**Request (JSON)**:
```json
{
  "id": "req-12345",
  "args": {"path": "/home/user"},
  "replyTo": "response/commands/agente86/ls/clp-abc123"
}
```

**Response (JSON)**:
```json
{
  "date": "2025-09-16T10:30:00.000Z",
  "command": "ls",
  "name": "agente86",
  "id": "req-12345",
  "payload": {
    "message": "OK",
    "result": [
      {"path": "/home/user/file.txt", "type": "file"},
      {"path": "/home/user/folder", "type": "folder"}
    ]
  }
}
```

## 🔧 Características Técnicas

- **MQTT v5** con fallback a **v3.1.1**
- **Correlation-Data** para evitar cross-talk entre clientes
- **Path traversal protection** en comando `ls`
- **Graceful shutdown** con señales SIGINT/SIGTERM
- **Presence/heartbeat** configurable
- **Request timeout** configurable
- **Logging estructurado** en formato JSON

## 🏗️ Arquitectura

```
┌─────────────┐    MQTT     ┌─────────────┐
│   Cliente   │ ◄─────────► │   Broker    │
│    CLP      │             │   MQTT      │
└─────────────┘             └─────────────┘
                                   ▲
                                   │ MQTT
                                   ▼
                            ┌─────────────┐
                            │   Agente    │
                            │    MQTT     │
                            └─────────────┘
```

## 📝 Notas de Implementación

- El agente valida paths contra `root_dir` por seguridad
- Los clientes múltiples usan `clientId` único para evitar conflictos
- Las respuestas usan retained messages para presence
- El sistema soporta reconexión automática
- Los timeouts son configurables por cliente

## 🔍 Troubleshooting

### Problemas Comunes
1. **"Connection refused"**: Verificar que el broker MQTT esté ejecutándose
2. **"Agent not responding"**: Verificar que el agente esté conectado al mismo broker
3. **"Permission denied"**: Verificar credenciales MQTT en configuración
4. **"Path not found"**: El comando `ls` está restringido a `root_dir` del agente

### Logs
Los logs se imprimen en formato JSON estructurado para facilitar debugging:
```json
{"ts":"2025-09-16T10:30:00.000Z","level":"info","event":"agent_ready","agent":"agente86"}
```