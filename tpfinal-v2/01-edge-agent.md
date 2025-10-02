# 01 -- Edge Agent

## Resumen ejecut4.  **Gestión del streaming**: arranca/detiene pipelines GStreamer hacia
    MediaMTX para cada sesión activa.
5.  **Almacenami### 4. Almacenamiento de frames

    def saveFrameToStorage(session_id: str, frame: b    for frame in camera_stream():
        ts = now_ms()
        detections = run(frame, CLASSES_OF_INTEREST)
        relevant = [d for d in detections if d.score >= CONFIDENCE_THRESHOLD]
        if relevant:
            last_detection_ts = ts
            if current_session is None:
                # Abrir nueva sesión
                session_id = f"sess-{iso_timestamp(ts)}"
                current_session = session_id
                startSessionStream(session_id, device="/dev/video0", gst_args=default_gst())
                sendOpenEvent(session_id, {"dev_id": "cam01", "edge_start_ts": ts})
            
            # Guardar frame en Object Storage y asignar frame_url a las detecciones
            frame_url = saveFrameToStorage(current_session, frame, ts)
            for detection in relevant:
                detection.frame_url = frame_url
            
            # Enviar detecciones al Session Store
            sendDetectionsBatch(current_session, serialize_detections(ts, relevant))p: int) -> str:
        """
        Guarda un frame con detecciones en Object Storage y devuelve la URL completa.
        El frame se almacena como JPEG en la ruta:
        `/object_storage/{session_id}/frames/frame_{timestamp}.jpg`
        
        - session_id: identificador de la sesión activa
        - frame: buffer de bytes del frame en formato JPEG
        - timestamp: timestamp en milisegundos para naming único
        
        Retorna: la ruta completa del frame guardado (frame_url)
        """

### 5. Publicación al Session Store

    def sendOpenEvent(session_id: str, payload: dict) -> None:o de frames**: guarda cada frame con detecciones en
    Object Storage y asigna la ruta correspondiente a `frame_url` en cada detección.
6.  **Selección de miniatura**: elige un frame representativo de la
    sesión (basado en la detección de mayor puntuación) y lo almacena en
    Object Storage.
7.  **Publicación de metadatos** al Session Store: eventos de
    apertura/cierre, detecciones por frame y tracking (anotaciones) en
    forma de JSON.**Edge Agent** es el componente encargado de analizar en tiempo real
el flujo de vídeo de una cámara, detectar eventos relevantes, generar
sesiones de grabación y publicar tanto los datos de vídeo como los
metadatos asociados. Coordina dos submódulos internos:

-   **Inference Engine (Módulo 1)** -- ejecuta un modelo ONNX ligero
    (p. ej. YOLOv5‑small, YOLO‑Nano o MobileNet SSD) sobre frames
    individuales o lotes para obtener detecciones (`class`, `score`,
    `bbox`). La prioridad es baja latencia y bajo consumo de memoria,
    sacrificando precisión si es necesario.
-   **Stream Processor (Módulo 3)** -- gestiona pipelines de GStreamer
    para codificar y publicar el flujo cuando una sesión está activa.
    Por defecto envía H.264 o H.265 encapsulado como HLS/fMP4 hacia
    **MediaMTX**.

Cuando el Edge Agent observa una detección con **puntuación superior al
umbral** y la clase pertenece al conjunto de interés, abre una nueva
**sesión de relevancia**, inicia el pipeline de streaming y comienza a
enviar detecciones y datos de tracking al **Session Store**. Al terminar
el periodo de post‑roll (sin nuevas detecciones durante un tiempo
configurable), la sesión se cierra, se detiene el streaming y se
finaliza el envío de metadatos.

## Responsabilidades y límites

### Qué hace

1.  **Captura de vídeo** desde la cámara local (vía `/dev/video0`, RTSP,
    etc.).
2.  **Ejecución del modelo ONNX** en cada frame o cada `n` frames para
    detectar objetos de interés.
3.  **Heurística de relevancia**: decide cuándo abrir y cerrar sesiones
    en función de umbrales de puntuación y clases de interés.
4.  **Gestión del streaming**: arranca/detiene pipelines GStreamer hacia
    MediaMTX para cada sesión activa.
5.  **Selección de miniatura**: elige un frame representativo de la
    sesión (basado en la detección de mayor puntuación) y lo almacena en
    Object Storage.
6.  **Publicación de metadatos** al Session Store: eventos de
    apertura/cierre, detecciones por frame y tracking (anotaciones) en
    forma de JSON.
7.  **Sincronización de timestamps**: ajusta los `ts` de los frames con
    la hora del sistema para coincidir con las etiquetas
    `PROGRAM‑DATE‑TIME` de MediaMTX.

### Qué no hace

-   No almacena grabaciones ni thumbnails de forma persistente (lo
    delega a MediaMTX y Object Storage).
-   No decide políticas de retención ni filtrado de sesiones (se
    gestionan en Session Store y Object Storage).
-   No encripta ni transmite los datos mediante TLS; utiliza HTTP/RTSP
    en un entorno seguro de laboratorio.
-   No ejecuta modelos pesados ni realiza enriquecimiento de atributos
    (lo hace el Attribute Enricher).

## Modelos de datos internos

### Detección (`Detection`)

    interface Detection {
      class: string;       // nombre de la clase detectada (p. ej. "persona", "sombrero")
      score: number;       // confianza [0,1]
      bbox: [number, number, number, number]; // coordenadas normalizadas [x0, y0, x1, y1]
      ts: number;          // timestamp en milisegundos desde epoch (ms)
      frame_url: string;   // path completo al frame guardado en Object Storage
      track_id?: string;   // identificador del objeto seguido por el tracker (opcional)
    }

### Evento de detección para el Session Store

El Edge Agent agrupa las detecciones por frame y las envía al
Session Store en lotes. Cada lote incluye el `session_id`, el timestamp
del frame y un array de detecciones. Ejemplo:

    {
      "session_id": "sess-20250929T120101Z",
      "frame_ts": 1700000000123,
      "detections": [
        { "class": "persona", "score": 0.82, "bbox": [0.1,0.2,0.3,0.5], "frame_url": "/object_storage/sess-20250929T120101Z/frames/frame_1700000000123.jpg", "track_id": "t1" },
        { "class": "sombrero", "score": 0.76, "bbox": [0.12,0.15,0.28,0.40], "frame_url": "/object_storage/sess-20250929T120101Z/frames/frame_1700000000123.jpg", "track_id": "t1" }
      ]
    }

### Anotaciones (meta JSON)

Además de las detecciones, se genera un fichero JSON por sesión
(`meta_url`) con todas las detecciones y tracking. La estructura es una
lista de entradas por frame:

    {
      "session_id": "sess-20250929T120101Z",
      "frames": [
        {
          "ts": 1700000000123,
          "detections": [ { ... } ],
          "tracks": [
            { "track_id": "t1", "bbox": [0.1,0.2,0.3,0.5] },
            { ... }
          ]
        },
        ...
      ]
    }

El campo `tracks` permite dibujar *bounding boxes* en la interfaz de
reproducción. El metadato se guarda en el Object Storage y el
Session Store persiste la ruta en `meta_url`.

## Interfaces internas

El Edge Agent ofrece un conjunto de funciones que encapsulan la
interacción con sus submódulos. No todas se exponen vía HTTP; se invocan
dentro del proceso.

### 1. Cargar modelo ONNX

    def setOnnxModel(model_name: str, confidence_threshold: float, input_height: int,
                     input_width: int, class_names: list[str]) -> None:
        """
        Carga un modelo ONNX ligero en memoria.  Ajusta el umbral mínimo de confianza
        utilizado por la heurística de relevancia y define las clases de interés.
        - model_name: ruta o alias del modelo (p. ej. "yolov5s.onnx").
        - confidence_threshold: detecciones con score < threshold se descartan.
        - input_height/width: dimensiones a las que se redimensionan los frames.
        - class_names: lista ordenada de clases que el modelo puede predecir.
        """

### 2. Inferencia sobre un frame

    def run(image: bytes, classes_of_interest: set[str]) -> list[Detection]:
        """
        Ejecuta el modelo sobre la imagen dada y devuelve solo las detecciones
        cuya clase pertenezca a `classes_of_interest` y cuyo `score` supere
        `confidence_threshold`.  El parámetro `image` puede ser un buffer
        de bytes JPEG o un objeto NumPy según la implementación.
        """

### 3. Control del streaming

    def startSessionStream(session_id: str, device: str, gst_args: list[str]) -> str:
        """
        Crea y lanza un pipeline GStreamer para capturar el vídeo de `device` y
        publicarlo a MediaMTX para la sesión indicada.  Devuelve la URL de ingest
        utilizada (p. ej. "rtsp://localhost:8554/sess-..." o "rtmp://...").
        """

    def stopSessionStream(session_id: str) -> None:
        """
        Detiene y limpia el pipeline GStreamer asociado a la sesión.  Tras su
        invocación, MediaMTX cerrará la playlist y dejará de recibir segmentos.
        """

### 4. Publicación al Session Store

    def sendOpenEvent(session_id: str, payload: dict) -> None:
        """
        Envía un POST a `Session Store /sessions/open` con los campos
        `session_id`, `dev_id`, `stream_path`, `edge_start_ts`, `thumb_url` provisional
        y `classes[]` detectadas hasta el momento.
        """

    def sendCloseEvent(session_id: str, payload: dict) -> None:
        """
        Envía un POST a `/sessions/close` para marcar el fin de la sesión.
        El payload contiene `edge_end_ts` y, opcionalmente, datos como
        `start_pdt`/`end_pdt` si ya se conocen.
        """

    def sendDetectionsBatch(session_id: str, batch: list[dict]) -> None:
        """
        Envía un POST a `/detections/batch` con un listado de detecciones agrupadas
        por frame.  Cada elemento incluye `class`, `score`, `bbox`, `frame_url`, `first_ts`,
        `last_ts` y (tras enriquecimiento) `attributes`. El campo `frame_url` contiene
        la ruta completa al frame guardado en Object Storage.
        """

## Flujos y secuencias

### Apertura, mantenimiento y cierre de sesión

El comportamiento se puede modelar como una máquina de estados finitos
(FSM) con cinco estados: `IDLE`, `OPEN`, `ACTIVE`, `CLOSING`, `CLOSED`.
La siguiente figura describe el flujo:

    stateDiagram-v2
      [*] --> IDLE
      IDLE --> OPEN: primera detección relevante
      OPEN --> ACTIVE: detección(es) subsiguientes
      ACTIVE --> CLOSING: timeout sin nuevas detecciones
      CLOSING --> CLOSED: post-roll vencido
      CLOSED --> [*]

      state OPEN {
        note right of OPEN
          - Generar session_id
          - Llamar a startSessionStream()
          - Enviar sendOpenEvent()
        end note
      }
      state CLOSING {
        note right of CLOSING
          - Continuar enviando stream hasta post-roll (p. ej. 5 s)
          - Recopilar detecciones finales
          - Seleccionar thumbnail
          - Guardar meta.json
          - Llamar a sendCloseEvent()
          - Llamar a stopSessionStream()
        end note
      }

### Heurística de relevancia (pseudocódigo)

    # Parámetros configurables
    CONFIDENCE_THRESHOLD = 0.5
    CLASSES_OF_INTEREST = {"persona", "sombrero"}
    POST_ROLL_MS = 5000  # tiempo en milisegundos tras la última detección

    current_session = None
    last_detection_ts = None

    for frame in camera_stream():
        ts = now_ms()
        detections = run(frame, CLASSES_OF_INTEREST)
        relevant = [d for d in detections if d.score >= CONFIDENCE_THRESHOLD]
        if relevant:
            last_detection_ts = ts
            if current_session is None:
                # Abrir nueva sesión
                session_id = f"sess-{iso_timestamp(ts)}"
                current_session = session_id
                startSessionStream(session_id, device="/dev/video0", gst_args=default_gst())
                sendOpenEvent(session_id, {"dev_id": "cam01", "edge_start_ts": ts})
            # Enviar detecciones al Session Store
            sendDetectionsBatch(current_session, serialize_detections(ts, relevant))
        else:
            # no detecciones en este frame
            if current_session and (ts - last_detection_ts) > POST_ROLL_MS:
                # Cerrar sesión
                sendCloseEvent(current_session, {"edge_end_ts": ts})
                stopSessionStream(current_session)
                current_session = None

### Selección de miniatura

Durante la sesión se almacena el frame de mayor relevancia como
miniatura. Un algoritmo simple consiste en elegir la detección con la
puntuación más alta y guardar el frame correspondiente. Pseudocódigo:

    best_score = 0.0
    best_frame = None
    best_ts = None
    for frame in session_frames:
        for d in frame.detections:
            if d.score > best_score:
                best_score = d.score
                best_frame = frame.image
                best_ts = frame.ts

    if best_frame:
        thumb_path = f"/object_storage/{session_id}/thumb.jpg"
        save_jpeg(best_frame, thumb_path)
        sendThumbUpdate(session_id, {"thumb_url": thumb_path, "thumb_ts": best_ts})

## Configuración

El Edge Agent se configura mediante variables de entorno o un archivo
`config.yaml`. Valores recomendados:

  -------------------------------------------------------------------------------------------------------------
  Parámetro                 Descripción                                              Valor por defecto
  ------------------------- -------------------------------------------------------- --------------------------
  `DEVICE_PATH`             Ruta de la cámara o stream de origen (`/dev/video0`,     `/dev/video0`
                            `rtsp://...`)                                            

  `FRAME_RATE`              FPS de captura para inferencia y streaming               `15`

  `VIDEO_SIZE`              Resolución de salida `WIDTHxHEIGHT`                      `640x360`

  `CONFIDENCE_THRESHOLD`    Umbral mínimo de score para considerar una detección     `0.5`
                            relevante                                                

  `CLASSES_OF_INTEREST`     Lista separada por comas de clases a monitorizar         `persona,sombrero`

  `POST_ROLL_MS`            Duración (ms) del periodo de cierre sin detecciones      `5000`

  `GST_PIPELINE_TEMPLATE`   Plantilla para GStreamer, e.g.,                          ver ejemplo
                            `v4l2src device={DEVICE} ! videoconvert ! x264enc ...`   

  `MEDIAMTX_URL`            URL de ingestión para MediaMTX (sin TLS)                 `rtsp://localhost:8554/`

  `SESSION_STORE_URL`       Base URL para el Session Store                           `http://localhost:8080`

  `OBJECT_STORAGE_PATH`     Directorio en disco para guardar frames individuales,    `/var/lib/recordings`
                            thumbnails y metadatos. Los frames se organizan en       
                            subdirectorios por sesión: `{session_id}/frames/`
  -------------------------------------------------------------------------------------------------------------

## Errores y casos límite

-   **Pérdida de conexión con la cámara**: se reintenta abrir
    `DEVICE_PATH` de forma exponencial. Mientras tanto no se generan
    sesiones.
-   **Latencia de modelo**: si el modelo tarda más de `1/FRAME_RATE`
    segundos, se descartan frames para mantener la fluidez; se loguean
    avisos.
-   **Frames sin detecciones pero en sesión**: se envían igualmente al
    pipeline GStreamer hasta que venza `POST_ROLL_MS`.
-   **Fallo al publicar a MediaMTX**: en caso de error en
    `startSessionStream` se aborta la sesión y se registra un error; no
    se envían metadatos.
-   **Fallo de red al enviar metadatos**: se implementa un buffer local
    con reintentos. Si el Session Store no está disponible, se reintenta
    cada segundo hasta alcanzar un máximo de reintentos configurable.

## Consideraciones de rendimiento y observabilidad

-   **Latencia objetivo**: el tiempo entre la detección y el envío al
    Session Store debe ser \<100 ms para mantener la correlación con las
    grabaciones. Se recomienda ajustar `FRAME_RATE` y seleccionar
    modelos ONNX de \<10 MB con inferencia \<25 ms en CPU o GPU.
-   **Buffering HLS**: la duración de los segmentos en MediaMTX (p. ej.,
    2 s) debe alinearse con la granularidad de detección. Un post‑roll
    demasiado largo aumenta el número de segmentos y el tamaño de la
    sesión.
-   **Logs estructurados**: el Edge Agent debe generar logs JSON con
    campos `level`, `ts`, `session_id`, `event` (`open`, `close`,
    `detection`), `count` (número de detecciones), etc. Esto facilita la
    observabilidad y depuración.
-   **Métricas**: exponer métricas Prometheus en `/metrics` (opcional)
    con indicadores como `sessions_opened_total`,
    `detections_processed_total`, `stream_errors_total`,
    `current_session_state`.

## Seguridad mínima local

El Edge Agent opera en un entorno confiable y no implementa cifrado ni
autenticación. Las comunicaciones con MediaMTX y Session Store se
realizan vía HTTP/RTSP en la misma red local. Los riesgos asumidos son:

-   **Intercepción de tráfico**: cualquier usuario en la red local
    podría capturar el vídeo o los metadatos. Se considera aceptable en
    laboratorio.
-   **Manipulación de parámetros**: no hay validación externa; se
    recomienda ejecutar los servicios en modo usuario no privilegiado y
    restringir el acceso a los puertos mediante firewall.

## Pruebas y criterios de aceptación

1.  **Pruebas unitarias**: funciones de inferencia y heurística se
    prueban con frames sintéticos para comprobar que el Edge Agent abre
    y cierra sesiones correctamente según distintos
    `CONFIDENCE_THRESHOLD` y `POST_ROLL_MS`.
2.  **Pruebas de integración**: se conecta el Edge Agent a un
    Session Store de prueba y a MediaMTX. Se comprueba que:
3.  Al detectar una clase de interés se ejecutan `startSessionStream` y
    `sendOpenEvent`.
4.  Se envían lotes de detecciones a `/detections/batch`.
5.  Se genera `thumb_url` y se actualiza con un evento.
6.  Tras el post‑roll, se ejecutan `sendCloseEvent` y
    `stopSessionStream`.
7.  **Pruebas manuales**: reproducir el flujo en la App UI. La grabación
    HLS debe mostrar solo el intervalo relevante; la miniatura debe
    corresponder al objeto de mayor score.

## Definition of Done (DoD) del Edge Agent

-   \[ \] El agente carga un modelo ONNX ligero y ejecuta inferencias a
    la tasa configurada.
-   \[ \] Se abren sesiones únicamente cuando hay detecciones con score
    ≥ umbral y clase en `CLASSES_OF_INTEREST`.
-   \[ \] Los pipelines GStreamer se inician y detienen correctamente;
    MediaMTX registra la sesión y genera `playlist_url`.
-   \[ \] Los eventos `open` y `close` se envían al Session Store con
    `edge_start_ts` y `edge_end_ts` válidos.
-   \[ \] Se guarda cada frame con detecciones en Object Storage y se
    asigna correctamente `frame_url` a todas las detecciones del frame.
-   \[ \] Se envían detecciones y tracking en lotes; el JSON de
    anotaciones se almacena en `meta_url`.
-   \[ \] Se selecciona y almacena un thumbnail representativo
    (`thumb_url`, `thumb_ts`).
-   \[ \] Se generan logs estructurados y, opcionalmente, métricas.
-   \[ \] Se han validado los casos de error (pérdida de cámara, caída
    del Session Store, etc.) y el agente se recupera sin intervención
    manual.
