# Computer Vision System - TP Final v2

Sistema completo de detección de objetos y análisis de video en tiempo real utilizando inteligencia artificial.

## 🏗️ Arquitectura del Sistema

El sistema está compuesto por los siguientes servicios:

### 1. **Edge Agent** (`services/edge-agent/`)
- **Tecnología**: Node.js + Python (ONNX Runtime)
- **Puerto**: No aplica (servicio de procesamiento)
- **Funciones**:
  - Captura de video desde cámara
  - Detección de objetos usando YOLOv8
  - Streaming HLS via MediaMTX
  - Gestión de sesiones y almacenamiento

### 2. **Session Store** (`services/session-store/`)
- **Tecnología**: Node.js + TypeScript + PostgreSQL
- **Puerto**: 8080
- **Funciones**:
  - API REST para gestión de sesiones
  - Almacenamiento de detecciones
  - Metadatos y atributos enriquecidos
  - Consultas avanzadas

### 3. **Object Storage** (`services/object-storage/`)
- **Tecnología**: Node.js + TypeScript
- **Puerto**: 8090
- **Funciones**:
  - Servidor de archivos estáticos
  - Gestión de frames y thumbnails
  - Políticas de retención
  - API de estadísticas

### 4. **Attribute Enricher** (`services/attribute-enricher/`)
- **Tecnología**: Node.js + TypeScript + Sharp
- **Puerto**: 8091
- **Funciones**:
  - Análisis de color de detecciones
  - Enriquecimiento de atributos
  - Procesamiento de imágenes
  - API de análisis visual

### 5. **Web UI** (`services/web-ui/`)
- **Tecnología**: Vue.js 3 + TypeScript + Vite
- **Puerto**: 8092
- **Funciones**:
  - Interfaz web de usuario
  - Visualización de sesiones
  - Reproducción de streams HLS
  - Dashboard analítico

### 6. **MediaMTX**
- **Tecnología**: Streaming server (Go)
- **Puertos**: 8888 (HLS), 8889 (API), 1935 (RTMP)
- **Funciones**:
  - Streaming HLS
  - Grabación de sesiones
  - Gestión de paths dinámicos

## 🚀 Instalación y Configuración

### Prerrequisitos

- **Node.js** >= 18.0.0
- **Docker** y **Docker Compose**
- **Python** >= 3.8
- **PostgreSQL** (via Docker)
- **FFmpeg/GStreamer** para procesamiento de video

### Instalación Rápida

```bash
# 1. Clonar/navegar al directorio del proyecto
cd tpfinal-v2

# 2. Usar el script de inicio automático (RECOMENDADO)
./scripts/start-system.sh

# O alternativamente, configuración manual:
npm run setup && npm run dev
```

### Scripts de Gestión del Sistema

```bash
# Iniciar todo el sistema de manera automática
./scripts/start-system.sh

# Monitorear el estado de todos los servicios en tiempo real
./scripts/monitor-system.sh

# Detener todos los servicios
./scripts/stop-system.sh

# Ejecutar pruebas de integración
./scripts/test-integration.sh
```

### Instalación Manual

```bash
# 1. Instalar dependencias de todos los workspaces
npm run install:all

# 2. Iniciar servicios de infraestructura
npm run docker:up

# 3. Esperar a que PostgreSQL esté listo (10-15 segundos)
sleep 10

# 4. Ejecutar migraciones de base de datos
npm run setup:db

# 5. Descargar modelo ONNX
npm run setup:models

# 6. Iniciar servicios de desarrollo
npm run dev:services
```

## 🔧 Configuración del Entorno

El archivo `.env` contiene todas las variables de configuración:

```bash
# Base de datos
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/session_store

# URLs de servicios
SESSION_STORE_URL=http://localhost:8080
OBJECT_STORAGE_URL=http://localhost:8090
ATTRIBUTE_ENRICHER_URL=http://localhost:8091
MEDIAMTX_URL=rtsp://localhost:8554

# Configuración de cámara
DEVICE_PATH=/dev/video0
FRAME_RATE=15
VIDEO_SIZE=640x360

# Configuración de detección
CONFIDENCE_THRESHOLD=0.5
CLASSES_OF_INTEREST=persona,sombrero,mascota
POST_ROLL_MS=5000

# Almacenamiento
OBJECT_STORAGE_BASE=./data/storage
MAX_STORAGE_GB=10
MAX_DAYS=7
```

## 📋 Scripts Disponibles

### Desarrollo
```bash
npm run dev              # Iniciar todos los servicios en modo desarrollo
npm run dev:minimal      # Solo servicios esenciales (sin Edge Agent)
npm run dev:services     # Solo servicios backend
npm run dev:ui           # Solo interfaz web
```

### Producción
```bash
npm run build           # Compilar todos los servicios
npm run start:prod      # Iniciar en modo producción
```

### Mantenimiento
```bash
npm run test:integration  # Pruebas de integración completas
npm run clean            # Limpiar node_modules y builds
npm run docker:logs      # Ver logs de Docker
npm run docker:down      # Detener servicios Docker
```

## 🔄 Flujo de Datos

```mermaid
graph TB
    A[Cámara] --> B[Edge Agent]
    B --> C[ONNX Inference]
    B --> D[MediaMTX Streaming]
    C --> E[Session Store]
    B --> F[Object Storage]
    E --> G[Attribute Enricher]
    F --> G
    G --> E
    E --> H[Web UI]
    F --> H
    D --> H
```

## 🌐 Endpoints API

### Session Store (Puerto 8080)
```
GET    /health                           # Health check
GET    /api/sessions                     # Listar sesiones
POST   /api/sessions                     # Crear sesión
GET    /api/sessions/:id                 # Obtener sesión
PATCH  /api/sessions/:id                 # Actualizar sesión
DELETE /api/sessions/:id                 # Eliminar sesión
GET    /api/sessions/:id/detections      # Detecciones de sesión
POST   /api/detections                   # Crear detección
GET    /api/detections/:id               # Obtener detección
PATCH  /api/detections/:id               # Actualizar detección
```

### Object Storage (Puerto 8090)
```
GET    /health                           # Health check
GET    /api/stats                        # Estadísticas de almacenamiento
GET    /api/sessions/:id/info            # Info de sesión
DELETE /api/sessions/:id                 # Eliminar sesión
GET    /:sessionId/frames/:filename      # Servir archivos
GET    /:sessionId/thumb.jpg             # Thumbnail de sesión
GET    /:sessionId/meta.json             # Metadatos de sesión
```

### Attribute Enricher (Puerto 8091)
```
GET    /health                           # Health check
POST   /api/enrich                       # Enriquecer detección
POST   /api/enrich/upload                # Enriquecer imagen subida
POST   /api/enrich/batch                 # Enriquecimiento por lotes
POST   /api/colors/palette               # Extraer paleta de colores
```

## 🎯 Acceso a la Aplicación

Una vez iniciados todos los servicios:

- **Web UI**: http://localhost:8092
- **Session Store API**: http://localhost:8080
- **Object Storage**: http://localhost:8090
- **Attribute Enricher**: http://localhost:8091
- **MediaMTX HLS Streams**: http://localhost:8888

## 🧪 Pruebas

### Pruebas de Integración
```bash
# Ejecutar suite completa de pruebas
npm run test:integration

# Las pruebas verifican:
# - Conectividad de base de datos
# - APIs de todos los servicios
# - Flujo completo de detección
# - Disponibilidad del modelo ONNX
```

### Pruebas Manuales
```bash
# 1. Verificar que todos los servicios están corriendo
curl http://localhost:8080/health
curl http://localhost:8090/health
curl http://localhost:8091/health

# 2. Crear una sesión de prueba
curl -X POST http://localhost:8080/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2024-01-01T00:00:00.000Z",
    "state": "active",
    "metadata": {"test": true}
  }'

# 3. Verificar estadísticas de almacenamiento
curl http://localhost:8090/api/stats
```

## 📊 Estructura de Datos

### Sesión
```typescript
interface Session {
  id: string;
  startTime: Date;
  endTime?: Date;
  state: 'active' | 'completed' | 'error';
  metadata: Record<string, any>;
  detectionCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Detección
```typescript
interface Detection {
  id: string;
  sessionId: string;
  timestamp: Date;
  className: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, any>;
  enrichedAttributes?: {
    dominantColor: ColorInfo;
    secondaryColors: ColorInfo[];
    averageColor: ColorInfo;
    colorDistribution: Record<string, number>;
    brightness: number;
    contrast: number;
    saturation: number;
  };
}
```

## 🛠️ Desarrollo

### Estructura del Proyecto
```
tpfinal-v2/
├── services/
│   ├── edge-agent/          # Servicio principal de detección
│   ├── session-store/       # API y base de datos
│   ├── object-storage/      # Servidor de archivos
│   ├── attribute-enricher/  # Análisis de color
│   └── web-ui/             # Interfaz web
├── shared/                  # Tipos y utilidades compartidas
├── scripts/                 # Scripts de utilidad
├── models/                  # Modelos ONNX
├── data/                    # Datos persistentes
├── docker-compose.yml       # Servicios de infraestructura
└── package.json            # Configuración workspace
```

### Agregar Nuevas Funcionalidades

1. **Nuevos tipos**: Definir en `shared/src/types.ts`
2. **Nuevos endpoints**: Agregar en el servicio correspondiente
3. **Nuevas dependencias**: Instalar en el workspace específico
4. **Migraciones DB**: Crear en `services/session-store/src/db/migrations/`

## 🔍 Monitoreo y Logs

```bash
# Ver logs de todos los servicios Docker
npm run docker:logs

# Ver logs de servicios Node.js
# Los servicios envían logs estructurados a stdout en formato JSON

# Ejemplo de log:
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "session-store",
  "level": "info",
  "message": "Server started",
  "port": 8080
}
```

## 🚨 Troubleshooting

### Problemas Comunes

1. **Puerto ocupado**: Verificar que los puertos 8080-8092 estén libres
2. **Base de datos**: Verificar que PostgreSQL esté corriendo con `docker ps`
3. **Modelo ONNX**: Descargar manualmente si falla el script automático
4. **Permisos de cámara**: Verificar acceso a `/dev/video0`

### Comandos de Diagnóstico
```bash
# Verificar servicios Docker
docker-compose ps

# Verificar conectividad de base de datos
PGPASSWORD=postgres psql -h localhost -U postgres -d session_store -c "SELECT 1;"

# Verificar modelo ONNX
ls -la ./models/yolov8n.onnx

# Verificar puertos
netstat -tlnp | grep -E ":(808[0-9]|8888|8889)"
```

## 📝 Licencia

MIT License - Ver archivo `LICENSE` para más detalles.

## 🤝 Contribuciones

1. Fork del proyecto
2. Crear feature branch (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la branch (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

---

**Sistema desarrollado para el TP Final - Computer Vision & Object Detection**