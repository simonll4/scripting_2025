# Operación del Sistema MQTT Agent

## Requisitos

- Node.js >= 18.0.0
- Broker MQTT (ej: Mosquitto)
- Dependencias: `npm install`

## Configuración

### Precedencia de Configuración
1. Variables de entorno (ENV)
2. Flags de línea de comandos (solo CLP)
3. Archivos TOML
4. Valores por defecto

### Variables de Entorno
```bash
# MQTT Connection
MQTT_URL=mqtt://localhost:1883
MQTT_USER=usuario
MQTT_PASS=password

# Agent
AGENT_NAME=agente86

# CLP
CLP_AGENT=agente86
```

### Archivo .env
Crear `.env` en la raíz del proyecto:
```
MQTT_URL=mqtt://localhost:1883
MQTT_USER=simonll4
MQTT_PASS=123
AGENT_NAME=agente86
```

## Ejecutar con Mosquitto

### 1. Iniciar Mosquitto
```bash
# Con Docker
docker run -it -p 1883:1883 eclipse-mosquitto

# O instalación local
mosquitto -v
```

### 2. Iniciar el Agente
```bash
# Con npm script
npm run agent

# O directamente
node tp3/tp3.1/agent/src/index.js
```

### 3. Iniciar el Cliente (CLP)
```bash
# Con npm script y variables de entorno
npm run clp

# O con flags específicos
node tp3/tp3.1/clp/src/index.js -h localhost -p 1883 -u simonll4 -P 123 -a agente86

# Ver ayuda
node tp3/tp3.1/clp/src/index.js --help
```

## Flags del CLI (CLP)

- `-h <host>` - Host MQTT (default: localhost)
- `-p <port>` - Puerto MQTT (default: 1883)
- `-u <user>` - Usuario MQTT
- `-P <pass>` - Password MQTT
- `-a <agent>` - Nombre del agente (default: agente86)
- `--help` - Mostrar ayuda

## Comandos Disponibles

### En el CLP
- `help` - Lista comandos disponibles
- `ls [path]` - Lista archivos y carpetas
- `quit` / `exit` - Salir del cliente

## Monitoreo

### Ver Presence
```bash
# Suscribirse a todos los agentes
mosquitto_sub -h localhost -t "presence/agents/+"

# Agente específico
mosquitto_sub -h localhost -t "presence/agents/agente86"
```

### Ver Requests/Responses
```bash
# Todos los requests
mosquitto_sub -h localhost -t "request/commands/+/+"

# Todas las responses
mosquitto_sub -h localhost -t "response/commands/+/+/+"

# Agente específico
mosquitto_sub -h localhost -t "request/commands/agente86/+"
mosquitto_sub -h localhost -t "response/commands/agente86/+/+"
```

### Logs Estructurados
Los logs usan formato JSON estructurado:
```json
{"level":"info","msg":"agent_ready","agent":"agente86","v5":true,"time":"2025-01-16T18:00:00Z"}
{"level":"info","msg":"request_handled","agent":"agente86","command":"ls","id":"abc123","durationMs":15}
```

## Configuración Avanzada

### Heartbeat de Presence
En `config/agent.toml`:
```toml
[presence]
enabled = true
heartbeat_seconds = 30  # 0 = sin heartbeat
```

### Seguridad del comando ls
```toml
[agent]
root_dir = "/ruta/permitida"  # Restringe acceso a esta carpeta
```

### QoS y Timeouts
```toml
[agent]
qos = 1

[clp]
request_timeout_ms = 5000
```

## Troubleshooting

### Problemas de Conexión
1. Verificar que Mosquitto esté corriendo: `netstat -an | grep 1883`
2. Probar conexión: `mosquitto_pub -h localhost -t test -m "hello"`
3. Revisar credenciales en .env o flags

### Agente No Responde
1. Verificar presence: `mosquitto_sub -h localhost -t "presence/agents/+"`
2. Revisar logs del agente
3. Verificar que el nombre del agente coincida entre agente y CLP

### Timeouts
1. Aumentar `request_timeout_ms` en config/clp.toml
2. Verificar latencia de red
3. Revisar carga del broker MQTT
