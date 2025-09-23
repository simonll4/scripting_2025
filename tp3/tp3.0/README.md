# TP3.0

## Descripción General

Este proyecto implementa un sistema distribuido de captura y almacenamiento de imágenes mediante webcam, utilizando TCP, MQTT y almacenamiento local. La solución está compuesta por tres servicios independientes que trabajan de manera coordinada.

## Solución

Según los requerimientos del TP0.txt:

1. **Módulo TCP**: Recibir comando `snapshot` via TCP, capturar foto con webcam y publicarla por MQTT (base64)
2. **Scheduler**: Enviar comando `snapshot` cada cierto tiempo configurable
3. **Saver**: Escuchar tópico MQTT y almacenar fotos con formato `yyyyMMdd_HHmmss.jpg`

## Arquitectura de la Solución

```
┌─────────────────┐    TCP    ┌─────────────────┐    MQTT    ┌──────────────────┐    MQTT    ┌──────────────────┐
│   SCHEDULER     │ ────────► │   AGENT-TCP     │ ─────────► │ BROKER MOSQUITTO │ ─────────► │     SAVER        │
│                 │ snapshot  │                 │ image/b64  │                  │ image/b64  │                  │
│ Envía comando   │           │ Recibe TCP      │            │                  │            │ Recibe MQTT      │
│ cada X tiempo   │           │ Captura webcam  │            │                  │            │ Guarda archivos  │
└─────────────────┘           └─────────────────┘            └──────────────────┘            └──────────────────┘
```

### Flujo de Datos

```
1. SCHEDULER ──[TCP: snapshot]──► AGENT-TCP
2. AGENT-TCP ──[FFmpeg capture]──► Webcam
3. AGENT-TCP ──[MQTT publish: base64]──► BROKER MOSQUITTO
4. BROKER MOSQUITTO ──[MQTT delivery]──► SAVER (subscriber)
5. SAVER ──[Save file]──► Sistema de archivos
```

## Servicios Implementados

### 1. Agent-TCP (`agent-tcp/`)

- **Función**: Servidor TCP que procesa comandos de captura
- **Tecnologías**: Node.js, FFmpeg, MQTT
- **Características**:
  - Servidor TCP en puerto configurable
  - Autenticación por token opaco, generado con script `admin.js`
  - Captura via FFmpeg con parámetros configurables
  - Publicación MQTT con codificación base64
  - Manejo de timeouts y errores

### 2. Scheduler (`scheduler/`)

- **Función**: Cliente que envía comandos snapshot periódicamente
- **Tecnologías**: Node.js, TCP sockets
- **Características**:
  - Intervalo configurable
  - Reconexión automática
  - Manejo graceful de shutdown

### 3. Saver (`saver/`)

- **Función**: Suscriptor MQTT que almacena imágenes
- **Tecnologías**: Node.js, MQTT, File System
- **Características**:
  - Suscripción a tópicos
  - Decodificación base64
  - Organización por cámara y fecha
  - Detección de duplicados
  - Formato de archivo: `yyyyMMdd_HHmmss.jpg`

## Estructura del Proyecto

```
tp3.0/
├── agent-tcp/src/          # Servidor TCP + captura webcam
│   ├── core/              # Lógica principal del servidor
│   ├── business/          # Comandos y captura
│   ├── adapters/          # Integración MQTT
│   └── config.js          # Configuración del servicio
├── scheduler/src/          # Cliente programado
│   ├── core/              # Lógica del scheduler
│   └── config.js          # Configuración del servicio
├── saver/src/             # Suscriptor y almacenamiento
│   ├── core/              # Lógica del saver
│   └── config.js          # Configuración del servicio
├── protocol/              # Protocolo TCP compartido
├── utils/                 # Utilidades compartidas (logger)
├── scripts/               # Herramientas de administración
│   └── admin.js           # Gestión de tokens de autenticación
├── .env                   # Configuración global
└── README.md              # Esta documentación
```

## Configuración

El sistema utiliza variables de entorno definidas en `.env`:

```bash
# MQTT Broker
MQTT_URL=mqtt://localhost:1883
MQTT_USER=simonll4
MQTT_PASS=123

# Agent TCP
AGENT_TCP_PORT=5001
AGENT_DEFAULT_CAMERA=/dev/video0
AGENT_DEFAULT_TOPIC=cameras/dev-01/snapshot

# Scheduler
SCHEDULER_INTERVAL_MS=5000
SCHEDULER_AGENT_HOST=127.0.0.1
SCHEDULER_AGENT_PORT=5001

# Saver
SAVER_MQTT_TOPIC=cameras/+/snapshot
SAVER_OUT_DIR=./snapshots
```

## Base de Datos y Autenticación

El servicio **agent-tcp** incluye una base de datos SQLite para:

- **Tokens de autenticación**: Sistema de tokens opacos con hash Argon2, scopes y expiración
- **Logs de capturas**: Auditoría completa de todas las operaciones de captura
- **Estadísticas**: Métricas de rendimiento y éxito de capturas

### Gestión de Tokens (admin.js)

Script de administración para crear y gestionar tokens de autenticación:

```bash
# Crear token para scheduler (sin expiración)
node scripts/admin.js create scheduler

# Crear token con expiración (1 hora)
node scripts/admin.js create scheduler 3600

# Listar todos los tokens
node scripts/admin.js list

# Revocar un token
node scripts/admin.js revoke <tokenId>

# Ver estadísticas de capturas
node scripts/admin.js stats
```

## Ejecución

### Iniciar servicios

```bash
# Terminal 1: Agent TCP
cd agent-tcp/src && node index.js

# Terminal 2: Saver
cd saver/src && node index.js

# Terminal 3: Scheduler
cd scheduler/src && node index.js
```

## Características Técnicas

### Protocolo TCP

- Mensajes JSON con framing
- Autenticación por token
- Timeouts configurables

### Captura de Imágenes

- FFmpeg para captura de webcam
- Resolución y calidad configurables
- Timeout de captura
- Validación de tamaño de imagen

### MQTT

- Tópicos organizados por cámara
- Codificación base64 para imágenes
- QoS configurable
- Reconexión automática

### Almacenamiento

- Organización por fecha y cámara
- Detección de duplicados
- Formato de nombre estándar
- Límites de concurrencia
