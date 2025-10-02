# 02 -- MediaMTX

## Resumen ejecutivo

**MediaMTX** actúa como el plano de medios del sistema. Recibe los
flujos de vídeo publicados por el **Edge Agent** cuando una sesión está
activa y produce grabaciones segmentadas en formato **HLS/fMP4**. Cada
sesión de relevancia se almacena en un directorio independiente y se
expone a través de una URL local (`playlist_url`) que la **App UI**
utiliza para reproducir el contenido. MediaMTX también incluye etiquetas
`PROGRAM‑DATE‑TIME` en las playlists, facilitando la correlación
temporal entre grabaciones y detecciones.

## Responsabilidades y límites

### Qué hace

-   Escucha en un puerto HTTP local (por defecto `8888/tcp`) para servir
    playlists `.m3u8` y segmentos `.m4s`.
-   Actúa como servidor RTSP/RTMP de ingestión para los pipelines
    GStreamer del Edge Agent. Cada vez que el agente inicia una sesión,
    MediaMTX crea un flujo y comienza a escribir archivos en el sistema
    de ficheros.
-   Segmenta el vídeo en trozos de duración fija (p. ej., 2 s) y escribe
    un playlist con `PROGRAM‑DATE‑TIME` para cada segmento.

### Qué no hace

-   No gestiona la lógica de relevancia ni de apertura/cierre de
    sesiones; eso lo controla el Edge Agent.
-   No almacena metadatos de detecciones ni miniaturas. Estos datos
    residen en el Session Store y el Object Storage.
-   No ofrece TLS ni autenticación en este despliegue local.

## Configuración recomendada

MediaMTX se configura mediante un archivo YAML (`mediamtx.yml`). A
continuación se muestra un ejemplo adaptado a este proyecto:

    # mediamtx.yml
    hls:
      enabled: yes
      # tamaño del segmento en segundos
      segment_duration: 2
      # número máximo de segmentos en memoria; en local se puede subir a 20
      segment_count: 10
      # escribir segmentos en disco para reproducir sesiones completas
      segment_directory: "/var/lib/mediamtx/segments"
      # incluir etiquetas PROGRAM-DATE-TIME basadas en el reloj del servidor
      program_date_time: yes
      program_date_time_source: system

    paths:
      # plantilla para flujos publicados por el Edge Agent
      sess-~sessionId:
        # permite RTSP y RTMP
        source: no
        runOnInit: ''
        runOnReady: ''
        # graba siempre que exista una publicación
        hlsEnabled: yes
        hlsVariant: fmp4
        hlsSegmentDuration: 2

En este ejemplo, cuando el Edge Agent publica al endpoint
`rtsp://localhost:8554/sess-<sessionId>`, MediaMTX crea el directorio
`/var/lib/mediamtx/segments/sess-<sessionId>/` con los archivos
`index.m3u8` y segmentos `.m4s`. La ruta completa para reproducir una
sesión será:

    http://localhost:8888/recordings/sess-<sessionId>/index.m3u8

El `sessionId` debe coincidir exactamente con el utilizado por el
Edge Agent al iniciar el stream. El Session Store persistirá esta URL
como `playlist_url`.

### Mapeo session_id ↔ playlist_url ↔ start_pdt/end_pdt

-   **session_id**: generado por el Edge Agent (p. ej.
    `sess-20250929T120101Z`).
-   **playlist_url**:
    `http://<mediamtx_host>:8888/recordings/{session_id}/index.m3u8`.
-   **start_pdt**: se deriva del primer segmento HLS de la playlist,
    donde el primer `#EXT-X-PROGRAM-DATE-TIME` indica el inicio
    reproducible de la sesión. El Session Store utiliza este valor para
    rellenar `start_pdt` cuando cierra la sesión.
-   **end_pdt**: se toma del último `PROGRAM-DATE-TIME` en la playlist
    una vez que MediaMTX ha finalizado la grabación. Puede diferir de
    `edge_end_ts` debido al tamaño de segmento y al post‑roll.

## Criterios de aceptación

-   **Grabación por sesión**: al iniciar una sesión, MediaMTX debe crear
    un directorio `sess-<sessionId>` con su propio `index.m3u8` y
    segmentos `.m4s`. No se deben mezclar segmentos de distintas
    sesiones.
-   **Seguridad del tiempo**: cada línea `#EXT-X-PROGRAM-DATE-TIME` debe
    reflejar un timestamp preciso (RFC 3339) y monotónicamente
    creciente. Los desajustes con el `edge_start_ts` no deben superar
    100 ms.
-   **Duración del segmento**: la diferencia entre timestamps
    consecutivos debe acercarse a `segment_duration` (±0,2 s). Esto
    asegura un buffering uniforme.
-   **Persistencia**: los directorios de grabaciones deben conservarse
    mientras la política de retención no los elimine. La eliminación
    manual de directorios no controlada debe reflejarse como un error al
    reproducir.
-   **Respuesta HTTP**: al solicitar `index.m3u8` mediante GET, MediaMTX
    devuelve código `200 OK` y contenido
    `application/vnd.apple.mpegurl`. Al solicitar un segmento `.m4s`,
    devuelve `200 OK` y `video/iso.segment`.

## Observabilidad y métricas

-   MediaMTX expone un log de nivel `INFO` por defecto. Se recomienda
    habilitar log en formato JSON y configurar la ruta de log en un
    archivo dentro de `/var/log/mediamtx.log`.
-   Las métricas Prometheus (`/metrics`) pueden habilitarse para obtener
    indicadores como `hls_segment_count`, `hls_error_total`,
    `rtsp_sessions_current`. En un entorno de laboratorio, la
    recolección de métricas es opcional.

## Seguridad mínima local

El servicio se ejecuta en la misma máquina que los demás componentes y
escucha únicamente en interfaces locales. No se habilita TLS ni
autenticación; las URL `playlist_url` pueden ser accesibles por
cualquier usuario de la red local, por lo que se recomienda aislar la
red o proteger el puerto con firewall. En un entorno productivo se debe
implementar HTTPS y controles de acceso.

## Pruebas y criterios de aceptación

1.  **Pruebas unitarias de configuración**: se valida el fichero YAML
    mediante la herramienta de verificación de MediaMTX; se comprueba
    que las rutas se expanden correctamente para `sess-~sessionId`.
2.  **Pruebas de integración**: mediante un Edge Agent de prueba se
    publica un stream a `sess-test` y se verifica que MediaMTX crea
    `recordings/sess-test/index.m3u8` con segmentos de 2 s y
    `PROGRAM-DATE-TIME` consistente.
3.  **Pruebas manuales**: se utiliza un reproductor HLS (p. ej.
    `ffplay`) apuntando a `playlist_url` para comprobar que la
    reproducción incluye únicamente el periodo de relevancia y que el
    buffer no contiene contenido previo ni posterior.

## Definition of Done del módulo MediaMTX

-   \[ \] La configuración permite recibir flujos RTSP/RTMP del
    Edge Agent y grabarlos por sesión.
-   \[ \] La salida HLS/fMP4 incluye un archivo `.m3u8` con etiquetas
    `PROGRAM-DATE-TIME` y segmentos de duración constante.
-   \[ \] Las rutas de reproducción son determinísticas y dependientes
    de `session_id`.
-   \[ \] Los valores de `start_pdt` y `end_pdt` extraídos de la
    playlist son precisos (±100 ms) respecto a los timestamps del
    Edge Agent.
-   \[ \] El servicio se ejecuta en un puerto local y sin TLS, aceptando
    el riesgo en entorno de laboratorio.
