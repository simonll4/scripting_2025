# TP Final — Sistema de Streaming (MediaMTX + WebRTC + HLS)

Este README documenta a fondo el directorio `tpfinal` y cómo se arma el sistema de streaming end‑to‑end: captura de webcam con GStreamer, ingesta a MediaMTX por RTMP, distribución en tiempo real por WebRTC (WHEP) y reproducción en HLS con grabación automática. Incluye recomendaciones críticas para robustecerlo y operarlo en producción.

Si solo querés arrancar: ejecutá `tpfinal/streaming.sh start` y abrí `http://localhost:8080/web/player.html`.

## Objetivo

- Capturar una webcam local y publicar un stream accesible desde navegadores.
- Ofrecer reproducción de ultra baja latencia con WebRTC (WHEP).
- Ofrecer reproducción compatible y cacheable con HLS (latencia mayor) y grabación automática en disco.
- Facilitar el uso vía Docker (MediaMTX + Caddy) y un agente Node.js con GStreamer.

## Arquitectura

- MediaMTX (distribución y grabación)
  - Ingesta: RTMP en `:1935` (p.ej., desde el agente o OBS)
  - Playback: WebRTC WHEP en `:8889`, HLS en `:8888`, RTSP en `:8554`
  - Grabación fMP4 en `tpfinal/streaming-local/recordings`
- Agente de Webcam (Node.js + GStreamer)
  - Captura `/dev/video0`, encodea H.264 y publica por RTMP a MediaMTX
  - Auto‑reconexión y health‑checks
- Caddy (servidor web + reverse proxy)
  - Sirve UI en `:8080` y proxya `/webrtc/*` hacia MediaMTX
  - Expone `/recordings/` estático
- Web UI (estático)
  - Reproductor WebRTC (`/web/player.html`) y pruebas HLS/WebRTC

Estructura relevante de archivos:

- `tpfinal/streaming-local/docker-compose.yml` — servicios `mediamtx` y `web` (Caddy)
- `tpfinal/streaming-local/mediamtx.yml` — configuración de protocolos y grabación
- `tpfinal/streaming-local/Caddyfile` — reverse proxy WHEP/WHIP y HLS; estáticos
- `tpfinal/streaming-local/web/` — UI: `player.html`, assets y tests
- `tpfinal/webcam-agent/` — agente de captura GStreamer (Node.js)
- `tpfinal/streaming.sh` — script para gestionar todo (check/install/start/stop/logs)

## Protocolos: qué hace cada uno

- WebRTC (WHEP/WHIP)
  - Ideal para tiempo real en navegador (latencia sub‑segundo).
  - Usa ICE/STUN/TURN para atravesar NAT. Media por UDP (`8189/udp`), con fallback TCP.
  - En este proyecto, se consume con WHEP vía Caddy en `/webrtc/whep/<path>`.

- HLS (HTTP Live Streaming)
  - Segmentado sobre HTTP, robusto y ampliamente compatible; latencia típicamente 5–30 s.
  - Útil para grabaciones y para reproducción estable, no estrictamente “tiempo real”.
  - Puede operarse en modo Low‑Latency HLS (LL‑HLS) para bajar a ~2–3 s si se configura.

- RTMP (Real‑Time Messaging Protocol)
  - Usado como protocolo de ingesta hacia MediaMTX desde el agente o desde OBS.
  - No se consume en navegador moderno; es solo para entrada.

- RTSP
  - Playback pull por clientes nativos (VLC, ffplay). Alternativa a HLS/WebRTC.

Corrección rápida a tu entendimiento: HLS no es “solo para grabaciones”; también sirve para vivo, pero con más latencia que WebRTC. WebRTC es lo adecuado para latencia mínima en navegadores.

## Flujo end‑to‑end

1) Baja latencia (recomendado en navegador)
- Webcam → GStreamer (x264) → RTMP → MediaMTX → WebRTC (WHEP) → Navegador

2) Grabación y reproducción estable (latencia mayor)
- Webcam → GStreamer (x264) → RTMP → MediaMTX → HLS (+ archivos en `recordings/`) → Navegador/VLC

## Cómo levantar el entorno

Requisitos locales:
- Docker y Docker Compose
- Node.js ≥ 16 (para `tpfinal/webcam-agent`)
- GStreamer (linux): `gstreamer1.0-tools gstreamer1.0-plugins-{base,good,bad,ugly}`
- Webcam en `/dev/video0` (configurable)

Pasos rápidos:
- `bash tpfinal/streaming.sh check` — verifica prerequisitos
- `bash tpfinal/streaming.sh start` — levanta MediaMTX + Caddy y el agente de webcam
- Abrí `http://localhost:8080/web/player.html` — reproductor WebRTC listo para `webcam`

Útiles:
- `bash tpfinal/streaming.sh status` — puertos/URLs y estado
- `bash tpfinal/streaming.sh logs mediamtx` — logs del server
- `bash tpfinal/streaming.sh logs webcam` — logs del agente (también en `tpfinal/webcam-agent/logs/`)
- `bash tpfinal/streaming.sh stop` — detiene todo

## Uso de los endpoints

- Web UI: `http://localhost:8080/web/player.html` (WebRTC WHEP)
- WebRTC WHEP (proxy Caddy): `http://localhost:8080/webrtc/whep/webcam`
- HLS directo MediaMTX: `http://localhost:8888/webcam/index.m3u8`
- HLS vía Caddy (recomendado por CORS/un único origen): `http://localhost:8080/hls/webcam/index.m3u8`
- RTSP: `rtsp://localhost:8554/webcam`
- RTMP ingest (OBS/agentes): `rtmp://localhost:1935/webcam`
- Grabaciones: `http://localhost:8080/recordings/`

Tip: En `tpfinal/streaming-local/web/index.html` y `hls-test.html` hoy se apunta directo a `:8888`. Para simplificar CORS y orígenes, podés cambiar a `/hls/...` y acceder todo por `:8080`.

## Configuración clave

- MediaMTX (`tpfinal/streaming-local/mediamtx.yml`)
  - `rtmp: yes`, `rtmpAddress: :1935` — ingesta desde agente/OBS
  - `hls: yes`, `hlsAddress: :8888` — playback HLS
  - `webrtc: yes`, `webrtcAddress: :8889` — WHEP/WHIP y API JSON WebRTC
  - `webrtcLocalUDPAddress: :8189` y `webrtcLocalTCPAddress: :8189` — media ports
  - `webrtcEncryption: no` — solo válido para local; en prod activar TLS
  - ICE: `webrtcIPSFromInterfaces: yes`, `webrtcAdditionalHosts: [127.0.0.1, localhost]`, y STUN
  - Grabación: `record: yes`, `recordFormat: fmp4`, `recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S-%f`, `recordDeleteAfter: 168h`
  - Paths: `webcam` hereda defaults de grabación

- Caddy (`tpfinal/streaming-local/Caddyfile`)
  - Sirve en `:8080` (container en `:80` mapeado por compose)
  - Proxy de WHEP/WHIP: `/webrtc/whep/webcam` → `mediamtx:8889`
  - Proxy HLS: `/hls/*` → `mediamtx:8888`
  - Estáticos: `/web/*` y `/recordings/*`

- Agente de Webcam (`tpfinal/webcam-agent`)
  - Config por env o `config.js`: dispositivo, resolución, bitrate, destino RTMP
  - Pipeline GStreamer (simplificado):
    - `v4l2src ! jpegdec ! videoconvert ! x264enc ... ! flvmux ! rtmpsink location=rtmp://localhost:1935/webcam`
  - Eventos: reconexión, health check, logs (winston)

## Grabaciones

- MediaMTX guarda segmentos fMP4 de `webcam` bajo `tpfinal/streaming-local/recordings/webcam/`.
- Navegá desde `http://localhost:8080/recordings/`.
- Mantenimiento: controla espacio en disco y ajustá `recordDeleteAfter`.

## Observabilidad y depuración

- Ver HLS manifest para chequear si el stream está activo: `http://localhost:8080/hls/webcam/index.m3u8`
- Logs MediaMTX: `bash tpfinal/streaming.sh logs mediamtx`
- Logs agente: `bash tpfinal/streaming.sh logs webcam` y `tpfinal/webcam-agent/logs/`
- GStreamer local: `bash tpfinal/streaming.sh test-gstreamer /dev/video0`

## Recomendaciones críticas (mejora/producción)

- TLS y seguridad de WebRTC
  - Activar `webrtcEncryption: yes` en MediaMTX o terminar TLS en Caddy (`:443`) y asegurar orígenes HTTPS.
  - Restringir CORS en Caddy (hoy está en `*`), al dominio esperado.

- NAT traversal
  - Para clientes fuera de la LAN, agregá TURN (coturn) y configurá `webrtcICEServers` (STUN+TURN). Si no, puede fallar o caer a TCP con mayor latencia.
  - Si exponés MediaMTX directo, abrí `8189/udp` y `8189/tcp` además de `8889`.

- HLS de baja latencia
  - Si necesitás vivo “casi real” pero compatible con players HLS, considerá habilitar LL‑HLS (CMAF) en MediaMTX. Requiere ajustar parámetros de HLS y el player.

- Audio y calidad de video
  - El pipeline actual solo publica video. Si querés audio, agregá `pulsesrc/alsasrc ! audioconvert ! voaacenc/faac/opusaacenc ! queue !` al flujograma y dejá que MediaMTX lo entregue por WebRTC/HLS.
  - Ajustá `x264enc` (bitrate/preset/tune) o usa aceleración por HW (`vaapih264enc`, `nvh264enc`) según el equipo.

- Unificación de orígenes
  - En los HTML de prueba, preferí llamar HLS vía Caddy (`/hls/...`) en vez de `http://localhost:8888/...` para evitar CORS y mantener un solo puerto.

- Limpieza del repo
  - `tpfinal/mediamtx-bin` no se usa si corrés por Docker; podrías removerlo para aligerar el repo.
  - `tpfinal/mediamtx-webrtc.js` y `tpfinal/reader.js` parecen assets/samples sueltos; centralizá el cliente en `streaming-local/web/assets/webrtc-player.js` y eliminá duplicados.

- Healthchecks y orquestación
  - Agregá healthchecks en Docker Compose para `mediamtx` y `web`.
  - Considerá systemd o PM2 para el agente si lo corrés fuera del script.

## Comandos rápidos

- Iniciar todo: `bash tpfinal/streaming.sh start`
- Detener todo: `bash tpfinal/streaming.sh stop`
- Ver estado: `bash tpfinal/streaming.sh status`

## Notas

- También podés publicar desde OBS usando: `rtmp://localhost:1935/webcam`.
- Reproducción RTSP (VLC): `rtsp://localhost:8554/webcam`.

---

### Dependencias generales del repo

Instalar dependencias Node (si algún TP lo requiere además del agente):

```bash
npm install
```
