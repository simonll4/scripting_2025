# TP Final v3 - Streaming Prototype

Este repositorio contiene la tercera iteración del TP Final, enfocada exclusivamente en la captura, grabación y recuperación de sesiones de video mediante MediaMTX y PostgreSQL. A diferencia de `tpfinal-v2`, esta versión inicial **no incluye modelos de IA ni detecciones**; su objetivo es disponer del pipeline mínimo para:

1. Tomar video desde un Edge Agent conectado a la cámara local o, si no hay cámara, usar una fuente sintética (`testsrc`).
2. Publicar el stream hacia MediaMTX y generar grabaciones HLS persistentes en disco.
3. Registrar metadatos básicos de la sesión en una base de datos (`sessions` table).
4. Permitir a un cliente recuperar los `playlist_url` para reproducir las grabaciones guardadas.

## Componentes

- **MediaMTX (`services/mediamtx`)**: servidor RTSP/RTMP/HLS configurado para almacenar cada sesión en `data/recordings/` y exponer playlists HLS (`http://localhost:8888/<session_id>/index.m3u8`).
- **Session Store (`services/session-store`)**: API mínima en Node.js + PostgreSQL con endpoints `POST /sessions`, `POST /sessions/:id/close`, `GET /sessions` y `GET /sessions/:id`.
- **Edge Agent (`services/edge-agent`)**: CLI que orquesta sesiones simuladas. Arranca `ffmpeg` para publicar a MediaMTX, abre/cierra sesiones en la base y aplica un `post-roll` para asegurar que todos los segmentos HLS se escriban.

## Flujo de alto nivel

1. El Edge Agent crea un `session_id`, abre sesión vía Session Store y publica en `rtsp://mediamtx:8554/sess-<id>`.
2. MediaMTX persiste el stream como HLS bajo `data/recordings/sess-<id>/` y sirve la playlist en `http://localhost:8888/sess-<id>/index.m3u8`.
3. Tras la duración configurada + post-roll, el Edge Agent cierra la sesión y actualiza `playlist_url` en PostgreSQL.
4. Clientes pueden consultar `GET /sessions` y reproducir el `playlist_url` directamente desde MediaMTX.

## Requisitos

- Docker y Docker Compose.
- FFmpeg instalado en caso de ejecutar el Edge Agent fuera de contenedor.
- Cámara accesible en `/dev/video0` (opcional). Si no existe se usará un `testsrc` generado por ffmpeg.

## Puesta en marcha rápida

1. **Construir y levantar infraestructura base:**
   ```bash
   docker compose up -d postgres mediamtx session-store
   ```
   Esto inicia PostgreSQL (con migración automática `sessions`), MediaMTX y el Session Store.

2. **Ejecutar una sesión de prueba con el Edge Agent:**
   - En contenedor (usa testsrc si no se monta la cámara):
     ```bash
     ./scripts/run-edge-once.sh --duration=45 --postRoll=5
     ```
     Flags disponibles: `--with-camera` para intentar montar `/dev/video0`, `--no-camera` para forzar `testsrc`.

   - Directo en tu Ubuntu (acceso sin Docker a `/dev/video0`):
     ```bash
     ./scripts/run-edge-local.sh --with-camera --duration=45 --postRoll=5
     ```
     El script usa los archivos precompilados en `services/edge-agent/dist/` y respeta `--camera-device=<path>` o `--no-camera`.

3. **Consultar sesiones registradas:**
   ```bash
   curl http://localhost:8080/sessions | jq
   ```
   Verás campos como `session_id`, `playlist_url` y timestamps.

4. **Reproducir la grabación en tu navegador o con ffplay:**
   ```bash
   ffplay http://localhost:8888/<session_id>/index.m3u8
   ```
   (Reemplaza `<session_id>` por el ID retornado por la API.)

## Estructura del repositorio

```
services/
  mediamtx/            # Configuración YAML montada por Docker
  session-store/       # API mínima (Express + PostgreSQL)
  edge-agent/          # CLI para simular sesiones y publicar a MediaMTX
scripts/
  run-edge-once.sh     # Helper para lanzar una sesión desde Docker

data/recordings        # Volumen bind para salidas HLS (creado automáticamente)
docker-compose.yml     # Orquesta PostgreSQL + MediaMTX + servicios
README.md              # Este documento
```

## Endpoints del Session Store

- `POST /sessions`
  ```json
  {
    "sessionId": "sess-20240214T120000Z",
    "deviceId": "cam-local",
    "streamPath": "sess-20240214T120000Z",
    "edgeStartTs": 1707912000000
  }
  ```

- `POST /sessions/:id/close`
  ```json
  {
    "edgeEndTs": 1707912060000,
    "playlistUrl": "http://localhost:8888/sess-20240214T120000Z/index.m3u8"
  }
  ```

- `GET /sessions?limit=50` → `{ "sessions": [...] }`
- `GET /sessions/:id` → registro individual.

## Próximos pasos sugeridos

- Añadir un cliente web simple que consuma el Session Store y reproduzca HLS.
- Incluir reglas de retención/limpieza para `data/recordings` y registros antiguos.
- Extender el modelo de datos para almacenar detecciones y atributos cuando se integre IA en futuras iteraciones.
