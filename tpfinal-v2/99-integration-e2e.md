# 99 -- Integración end-to-end

## Resumen ejecutivo

Este documento describe los flujos de extremo a extremo (E2E) entre los
diferentes módulos de la solución: desde la detección de un evento
relevante en el Edge Agent hasta la reproducción de la grabación en la
App UI. Incluye diagramas de secuencia, ejemplos de datos de prueba y
una lista de verificación para validar que todos los componentes
interactúan correctamente.

## Secuencias E2E principales

### 1. Creación, grabación y cierre de una sesión

    sequenceDiagram
      participant Cam as Cámara
      participant EA as Edge Agent
      participant MM as MediaMTX
      participant SS as Session Store
      participant OE as Object Storage
      participant UI as App UI

      Cam->>EA: frames en tiempo real
      loop Detección continua
        EA->>EA: run() sobre frame
        alt Detección relevante
          EA->>EA: generar session_id (si no hay sesión)
          EA->>MM: startSessionStream(session_id)
          EA->>SS: POST /sessions/open
          EA->>SS: POST /detections/batch
        else Ninguna detección
          EA->>EA: comprobar timeout POST_ROLL
        end
      end
      Note right of EA: Tras POST_ROLL sin detecciones
      EA->>SS: POST /sessions/close (edge_end_ts, playlist_url, start_pdt, end_pdt)
      EA->>MM: stopSessionStream
      EA->>OE: guardar thumb.jpg y meta.json
      SS->>SS: persistir meta_url y thumb_url

### 2. Consulta y reproducción en la UI

    sequenceDiagram
      participant UI as App UI
      participant SS as Session Store
      participant MM as MediaMTX
      participant OE as Object Storage

      UI->>SS: POST /query { existen, noExisten }
      SS-->>UI: lista de sesiones (session_id, playlist_url, thumb_url, meta_url, ...)
      loop Para cada sesión seleccionada
        UI->>OE: GET thumb_url
        UI-->>UI: mostrar miniatura
        UI->>MM: HLS GET playlist_url (index.m3u8)
        UI-->>UI: reproducir vídeo HLS
        alt Overlay activado
          UI->>OE: GET meta_url
          UI-->>UI: sincronizar meta.json con el tiempo del vídeo y dibujar BB
        else
          UI-->>UI: ocultar anotaciones
        end
      end

## Contrato temporal entre start_pdt/end_pdt y segmentos HLS

Al cierre de una sesión, el Session Store registra `start_pdt` y
`end_pdt` basándose en la playlist generada por MediaMTX. **El cliente
(App UI) debe asumir que la grabación contiene únicamente el intervalo
de relevancia**, por lo que la reproducción se inicia en `start_pdt` y
termina en `end_pdt`. Los segmentos HLS anteriores o posteriores no
forman parte de la sesión. La correlación de eventos visuales con las
marcas de anotaciones se garantiza gracias a que el Edge Agent
sincroniza sus timestamps con la hora del sistema.

## Datos de prueba (fixtures)

Para validar la integración se proporcionan dos sesiones ficticias en
formato JSON. Pueden insertarse manualmente en el Session Store o
crearse usando un Edge Agent de prueba.

### Sesión A (con sombrero rojo)

    {
      "session_id": "sess-A",
      "dev_id": "cam01",
      "stream_path": "sess-A",
      "edge_start_ts": 1700000000000,
      "edge_end_ts": 1700000005000,
      "playlist_url": "http://localhost:8888/recordings/sess-A/index.m3u8",
      "start_pdt": "2025-09-29T12:00:00Z",
      "end_pdt": "2025-09-29T12:00:05Z",
      "thumb_url": "/thumbs/sess-A/thumb.jpg",
      "thumb_ts": "2025-09-29T12:00:02Z",
      "meta_url": "/meta/sess-A/annotations.json",
      "classes": ["persona","sombrero"],
      "detections": [
        {"detection_id":"sess-A:1700000001000:persona","class":"persona","score":0.90,"attributes":{}},
        {"detection_id":"sess-A:1700000001000:sombrero","class":"sombrero","score":0.80,"attributes":{"color":"red"}}
      ]
    }

### Sesión B (sin sombrero)

    {
      "session_id": "sess-B",
      "dev_id": "cam01",
      "stream_path": "sess-B",
      "edge_start_ts": 1700000010000,
      "edge_end_ts": 1700000013000,
      "playlist_url": "http://localhost:8888/recordings/sess-B/index.m3u8",
      "start_pdt": "2025-09-29T12:00:10Z",
      "end_pdt": "2025-09-29T12:00:13Z",
      "thumb_url": "/thumbs/sess-B/thumb.jpg",
      "thumb_ts": "2025-09-29T12:00:11Z",
      "meta_url": "/meta/sess-B/annotations.json",
      "classes": ["persona"],
      "detections": [
        {"detection_id":"sess-B:1700000011000:persona","class":"persona","score":0.88,"attributes":{}}
      ]
    }

### Ejemplo de respuesta de `POST /query`

**Request**

    {
      "existen": ["sombrero:red"],
      "noExisten": ["mascota"]
    }

**Response**

    {
      "sessions": [
        {
          "session_id": "sess-A",
          "dev_id": "cam01",
          "playlist_url": "http://localhost:8888/recordings/sess-A/index.m3u8",
          "start_pdt": "2025-09-29T12:00:00Z",
          "end_pdt": "2025-09-29T12:00:05Z",
          "thumb_url": "/thumbs/sess-A/thumb.jpg",
          "meta_url": "/meta/sess-A/annotations.json",
          "classes": ["persona","sombrero"]
        }
      ]
    }

La sesión B no aparece porque no contiene detecciones de sombrero rojo.

## Checklist de verificación E2E

1.  **Configuración inicial**: levantar MediaMTX (`8888`), Session Store
    (`8080`), Object Storage (`8090`) y, opcionalmente,
    Attribute Enricher (`8081`). Configurar el Edge Agent para que
    publique flujos a MediaMTX y se comunique con el Session Store.
2.  **Primer flujo**: generar un evento relevante frente a la cámara.
    Verificar que el Edge Agent crea la carpeta `sess-...` en
    Object Storage, que MediaMTX genera la playlist HLS y que el
    Session Store registra una nueva entrada en `sessions`.
3.  **Inserción de detecciones y enriquecimiento**: comprobar en la base
    de datos que las tablas `detections` contienen las clases detectadas
    y que, tras ejecutar el Attribute Enricher, el campo `attributes` se
    actualiza (p. ej. `"color":"red"`).
4.  **Cierre de sesión**: al dejar de detectar objetos, comprobar que el
    Edge Agent cierra la sesión, se detiene el streaming y se actualizan
    `edge_end_ts`, `playlist_url`, `start_pdt` y `end_pdt` en el
    Session Store.
5.  **Consulta en la UI**: abrir la App UI, ingresar filtros en el
    formulario y verificar que las sesiones se listan correctamente.
    Comprobar que la miniatura se muestra y que el botón de reproducción
    funciona.
6.  **Reproducción y overlay**: reproducir la sesión con `hls.js`,
    activar la superposición de anotaciones y confirmar que las bounding
    boxes se sincronizan con el vídeo. La línea de tiempo debe mostrar
    marcas donde hay detecciones.
7.  **Limpieza**: simular la eliminación de sesiones por política de
    retención y verificar que el Session Store y la UI responden
    adecuadamente (sesiones desaparecen del listado y las rutas a
    archivos eliminados devuelven 404).
8.  **Pruebas de estrés**: generar múltiples sesiones simultáneas para
    evaluar la estabilidad del sistema bajo carga y garantizar que los
    tiempos de respuesta permanecen aceptables (\<200 ms para `/query`).

Cada paso debe documentarse con logs y capturas de pantalla para
confirmar el comportamiento. Solo cuando todas las verificaciones sean
satisfactorias, se considera que la integración end‑to‑end está
completa.
