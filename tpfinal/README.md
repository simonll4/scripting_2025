# 🎥 Streaming Client - TPFinal

Sistema completo de streaming en tiempo real con captura de webcam, servidor MediaMTX y cliente web Vue.js elegante.

## 📋 Descripción

Este proyecto implementa una solución completa de streaming que permite:

- **📹 Captura de webcam** con agente Node.js y GStreamer
- **📡 Streaming en tiempo real** via MediaMTX (RTSP/WebRTC/HLS)
- **💻 Cliente web elegante** desarrollado en Vue 3 + TypeScript
- **📁 Visualización de grabaciones** históricas
- **📊 Métricas en tiempo real** y estadísticas de conexión

## 🏗️ Arquitectura

```
┌─────────────────┐    RTSP     ┌──────────────┐    WebRTC/HLS    ┌─────────────────┐
│   Webcam Agent  │ ──────────► │   MediaMTX   │ ───────────────► │   Vue Client    │
│   (Node.js +    │             │   (Docker)   │                  │   (Web Browser) │
│   GStreamer)    │             │              │                  │                 │
└─────────────────┘             └──────────────┘                  └─────────────────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │  Recordings  │
                                │   (fMP4)     │
                                └──────────────┘
```

## 🚀 Inicio Rápido

### 1. Prerequisitos

**Ubuntu/Debian:**
```bash
# GStreamer (requerido para webcam-agent)
sudo apt update
sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-base \
                 gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
                 gstreamer1.0-plugins-ugly v4l2-utils

# Docker y Docker Compose
sudo apt install docker.io docker-compose

# Node.js ≥ 16
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs
```

### 2. Configuración y Ejecución

#### Paso 1: Iniciar MediaMTX
```bash
cd tpfinal/infra-streaming-local
docker-compose up -d
```

#### Paso 2: Iniciar Webcam Agent
```bash
cd tpfinal/webcam-agent
npm install
npm start
```

#### Paso 3: Iniciar Cliente Web
```bash
cd tpfinal/streaming-client
npm install
npm run dev
```

### 3. Acceso

- **Cliente Web**: http://localhost:5173
- **Streaming HLS**: http://localhost:8888/webcam/index.m3u8
- **WebRTC WHEP**: http://localhost:8889/whep/webcam
- **RTSP**: rtsp://localhost:8554/webcam

## 🔧 Configuración

### MediaMTX (infra-streaming-local/mediamtx.yml)

```yaml
# Configuración principal
rtspAddress: :8554          # Puerto RTSP
hlsAddress: :8888           # Puerto HLS
webrtcAddress: :8889        # Puerto WebRTC WHEP

# Grabación
pathDefaults:
  record: yes
  recordFormat: fmp4
  recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S-%f
  recordDeleteAfter: 168h   # 7 días
```

### Webcam Agent (.env)

```bash
# Dispositivo de video
VIDEO_DEVICE=/dev/video0
VIDEO_WIDTH=640
VIDEO_HEIGHT=480
VIDEO_FPS=30

# Encoding
VIDEO_BITRATE=1000
X264_PRESET=ultrafast

# MediaMTX
MEDIAMTX_HOST=localhost
MEDIAMTX_RTSP_PORT=8554
```

### Cliente Vue (.env)

```bash
# Endpoints MediaMTX
VITE_WHEP_URL=http://localhost:8889/whep
VITE_HLS_BASE=http://localhost:8888
VITE_STREAM_PATH=webcam
```

## 📊 Funcionalidades

### ⚡ Streaming WebRTC (WHEP)
- **Baja latencia** (~100-500ms)
- **Estadísticas en tiempo real**
- **Conexión P2P optimizada**
- **Métricas de calidad**

### 📺 Streaming HLS
- **Alta compatibilidad** con navegadores
- **Streaming adaptativo**
- **Buffer automático**
- **Recuperación de errores**

### 📁 Gestión de Grabaciones
- **Formato fMP4** compacto
- **Nomenclatura por timestamp**
- **Reproducción integrada**
- **Información de metadatos**

### 📱 Interfaz Responsiva
- **Diseño moderno** con gradientes
- **Componentes reutilizables**
- **TypeScript** para type safety
- **Responsive design**

## 🛠️ Comandos Útiles

### Docker
```bash
# Ver logs de MediaMTX
docker logs mediamtx -f

# Reiniciar MediaMTX
docker-compose restart

# Ver estado de contenedores
docker-compose ps
```

### Webcam Agent
```bash
# Ver dispositivos de video disponibles
v4l2-ctl --list-devices

# Probar cámara
ffplay /dev/video0

# Modo desarrollo con logs detallados
LOG_LEVEL=debug npm start
```

### Cliente Vue
```bash
# Desarrollo
npm run dev

# Build para producción
npm run build

# Preview de build
npm run preview

# Type checking
npm run type-check
```

## 🌐 Puertos

| Servicio | Puerto | Protocolo | Descripción |
|----------|--------|-----------|-------------|
| MediaMTX RTSP | 8554 | TCP | Ingesta y reproducción RTSP |
| MediaMTX HLS | 8888 | HTTP | Streaming HLS |
| MediaMTX WebRTC | 8889 | HTTP | WHEP WebRTC API |
| MediaMTX Media | 8189 | UDP/TCP | Datos de media WebRTC |
| Vue Dev Server | 5173 | HTTP | Cliente web (desarrollo) |

## 🔍 Troubleshooting

### Webcam no detectada
```bash
# Verificar dispositivos
ls -la /dev/video*
v4l2-ctl --list-devices

# Permisos (agregar usuario a grupo video)
sudo usermod -a -G video $USER
```

### Error de GStreamer
```bash
# Verificar instalación
gst-launch-1.0 --version
gst-inspect-1.0 rtspclientsink

# Reinstalar plugins
sudo apt install --reinstall gstreamer1.0-plugins-bad
```

### WebRTC no conecta
```bash
# Verificar puertos
netstat -tlnp | grep 8889

# Comprobar configuración STUN/ICE
# Revisar logs del navegador (F12)
```

### MediaMTX no inicia
```bash
# Verificar configuración
docker-compose config

# Ver logs detallados
docker logs mediamtx --tail 50
```

## 📝 TODO / Mejoras Futuras

- [ ] **API REST** para gestión de grabaciones
- [ ] **Autenticación** y control de acceso
- [ ] **Múltiples cámaras** simultáneas
- [ ] **Transcodificación** automática H.265
- [ ] **Notificaciones** push para eventos
- [ ] **Dashboard** de administración
- [ ] **Métricas** con Prometheus/Grafana
- [ ] **Deployment** con CI/CD

## 🤝 Contribución

1. Fork del proyecto
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 👨‍💻 Autor

**Trabajo Práctico Final - Scripting 2025**

---

*Desarrollado con ❤️ usando Vue.js, Node.js, Docker y GStreamer*