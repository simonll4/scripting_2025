# TP Final v3 - Streaming Prototype

Este repositorio contiene la tercera iteración del TP Final, enfocada exclusivamente en la captura, grabación y recuperación de sesiones de video mediante MediaMTX y PostgreSQL. A diferencia de `tpfinal-v2`, esta versión inicial **no incluye modelos de IA ni detecciones**; su objetivo es disponer del pipeline mínimo para:

1. Tomar video desde un Edge Agent conectado a la cámara local.
2. Publicar el stream hacia MediaMTX usando RTSP y generar grabaciones `fMP4` persistentes.
3. Registrar metadatos básicos de cada sesión (inicio/fin en UTC) en una base de datos (`sessions`).
4. Permitir a un cliente recuperar clips MP4 por rango horario consumiendo el playback server integrado de MediaMTX (`/get`).

## Componentes

- **MediaMTX (`services/mediamtx`)**: servidor RTSP con `record: yes` y playback HTTP habilitado. Persiste cada transmisión en `/recordings/<path>/YYYY/MM/DD/...` y expone los clips en `http://<host>:9996/get?...`.
- **Session Store (`services/session-store`)**: API mínima en Node.js + PostgreSQL que registra una sesión por conexión RTSP (`POST /sessions/open`, `POST /sessions/close`, `GET /sessions`, `GET /sessions/range`) y construye URLs de reproducción (`GET /sessions/:id/clip`).
- **Edge Agent (`services/edge-agent`)**: CLI que orquesta sesiones. Arranca `ffmpeg` para publicar a un path estable (`rtsp://<host>:8554/<device>`), abre y cierra la sesión en el Session Store con timestamps RFC3339 y respeta un post-roll antes de finalizar.
- **Web UI (`services/web-ui`)**: interfaz básica que consulta sesiones por rango y, al elegir una, obtiene el clip MP4 listo para reproducir desde MediaMTX.

## Flujo de alto nivel

1. El Edge Agent recibe una orden (CLI o API interna) para iniciar una sesión.
2. Genera un `session_id`, abre sesión vía Session Store y comienza a publicar a `rtsp://mediamtx:8554/<deviceId>`.
3. MediaMTX graba toda la vida de la conexión en `fMP4` y lo indexa por timestamp dentro del path del dispositivo.
4. El Edge Agent detecta el fin de la transmisión, espera el post-roll configurado y cierra la sesión informando `end_ts` y `postroll_sec` al Session Store.
5. La UI (o cualquier cliente) consulta las sesiones por rango horario y solicita a `GET /sessions/<sessionId>/clip` la `playbackUrl` (`http://<host>:9996/get?path=...&start=...&duration=...&format=mp4`) para reproducir o descargar el video.

## Estructura del repositorio

```
services/
  mediamtx/            # Configuración YAML montada por Docker
  session-store/       # API mínima (Express + PostgreSQL)
  edge-agent/          # CLI para simular sesiones y publicar a MediaMTX
  web-ui/              # UI básica de consulta y reproducción
scripts/               # Utilidades para correr el Edge Agent
 data/                 # Volumen local para grabaciones (creado al correr docker compose)
docker-compose.yml     # Orquesta PostgreSQL + MediaMTX + services
README.md              # Este documento
```

## Puesta en marcha rápida

0. **Instalar dependencias y levantar todo con un solo comando:**
   ```bash
   ./scripts/setup-and-up.sh
   ```
   Este script ejecuta `npm install && npm run build` en los servicios Node, y luego hace `docker compose up -d`.

1. **Infra base:**
   ```bash
   docker compose up -d postgres mediamtx session-store
   ```
   Esperá a que `postgres` reporte `healthy` (`docker compose ps`).
   > Nota: Postgres se expone en `localhost:15432` (mapeo del host), dentro de la red de Docker sigue siendo `postgres:5432`.

2. **Simular una sesión (contenedor):**
   ```bash
   ./scripts/run-edge-once.sh --duration=45 --postRoll=5
   ```
   El wrapper acepta `--with-camera` (monta `/dev/video0` si existe) y `--no-camera`. Requiere que el daemon de Docker pueda acceder al dispositivo real.

3. **Ejecutar el Edge Agent directamente en Ubuntu (para usar la webcam del host):**
   ```bash
   ./scripts/run-edge-local.sh --with-camera --duration=45 --postRoll=5
   ```
   Este script usa los binarios ya compilados (`services/edge-agent/dist`). Configurá `CAMERA_DEVICE` o `CAMERA_FALLBACK` según tu caso.

4. **Listar sesiones registradas:**
   ```bash
   curl http://localhost:8080/sessions | jq
   ```

5. **Solicitar un clip MP4 a MediaMTX (playback server):**
   ```bash
   curl "http://localhost:9996/get?path=cam-local&start=2025-01-01T12:34:56Z&duration=30s&format=mp4" \
     --output clip.mp4
   ```
   Ajustá `path`, `start` y `duration` usando los valores devueltos por el Session Store (`start_ts`, `end_ts`).
   > El Session Store ya publica las URLs de reproducción con `http://localhost:9996`, accesibles desde el navegador del host.

6. **Levantar la UI web (opcional):**
   ```bash
   docker compose up -d web-ui
   ```
   Luego entrá a <http://localhost:3000>, indicá una fecha/hora y la duración deseada. La UI consulta al Session Store, lista las sesiones y solicita el clip MP4 por `GET /sessions/<id>/clip`.

## Próximos pasos sugeridos

- Incorporar autenticación/autorización para los endpoints.
- Añadir lógica de detecciones y enriquecimiento una vez validado el pipeline de streaming.
- Automatizar la rotación/eliminación de grabaciones viejas en `recordings/`.
