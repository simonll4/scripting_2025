# 03 -- Session Store

## Resumen ejecutivo

El **Session Store** es el corazón del plano de control. Persiste todas
las **sesiones** y **detecciones** generadas por el Edge Agent,
proporciona un mecanismo eficiente de consulta basado en tokens
(`existen`, `noExisten`) y sirve como punto de integración con el
**Attribute Enricher**. Expuesto a través de una API HTTP local, este
servicio permite a la App UI listar sesiones filtrando por clases y
atributos, obteniendo las URLs necesarias para reproducir los vídeos y
las miniaturas.

## Responsabilidades y límites

### Qué hace

-   Almacena registros de sesiones con sus metadatos (inicio y fin en
    tiempo del edge y del plano de medios, `playlist_url`, `thumb_url`,
    etc.).
-   Almacena todas las detecciones asociadas a una sesión, incluidas
    clases, puntuaciones, bounding boxes, atributos enriquecidos y URL
    de los frames.
-   Expone operaciones para abrir (`/sessions/open`) y cerrar
    (`/sessions/close`) sesiones; para registrar detecciones en lote
    (`/detections/batch`); y para consultar sesiones usando filtros
    (`/query`).
-   Genera índices sobre campos consultados frecuentemente para acelerar
    las búsquedas (p. ej. clase, atributos).
-   Integra con el **Attribute Enricher** para actualizar el campo
    `attributes` de las detecciones.

### Qué no hace

-   No almacena flujos de vídeo ni miniaturas (solo las rutas); eso se
    realiza en MediaMTX y en el Object Storage.
-   No realiza inferencia ni cálculo de atributos; delega esa
    responsabilidad al Edge Agent y al Attribute Enricher.
-   No gestiona autenticación ni autorización en este entorno local.

## Modelo de datos

Se sugiere implementar el Session Store sobre una base de datos
relacional ligera como **PostgreSQL**. A continuación se
define el esquema basado en el diagrama del archivo `drawio.xml`:

### Tabla `sessions`

    CREATE TABLE sessions (
      session_id    TEXT PRIMARY KEY,
      dev_id        TEXT NOT NULL,
      stream_path   TEXT NOT NULL,        -- ruta de ingestión hacia MediaMTX
      edge_start_ts BIGINT NOT NULL,      -- epoch ms proporcionado por el Edge Agent
      edge_end_ts   BIGINT,               -- epoch ms; NULL hasta que la sesión se cierra
      playlist_url  TEXT,                 -- URL de reproducción HLS
      start_pdt     TIMESTAMP,            -- inicio reproducible (PROGRAM-DATE-TIME)
      end_pdt       TIMESTAMP,            -- fin reproducible
      meta_url      TEXT,                 -- ruta al JSON de anotaciones
      thumb_url     TEXT,                 -- ruta a la miniatura
      thumb_ts      TIMESTAMP,            -- timestamp del frame de la miniatura
      classes       TEXT[] DEFAULT '{}',  -- array de clases detectadas en la sesión
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Índices recomendados
    CREATE INDEX IF NOT EXISTS idx_sessions_classes ON sessions USING GIN (classes);
    CREATE INDEX IF NOT EXISTS idx_sessions_start_pdt ON sessions (start_pdt);

### Tabla `detections`

    CREATE TABLE detections (
      detection_id TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
      first_ts     BIGINT NOT NULL,
      last_ts      BIGINT NOT NULL,
      class        TEXT NOT NULL,
      score        REAL NOT NULL,
      frame_url    TEXT NOT NULL,
      attributes   JSONB DEFAULT '{}'::jsonb
    );

    -- Índices recomendados
    CREATE INDEX IF NOT EXISTS idx_detections_class ON detections (class);
    CREATE INDEX IF NOT EXISTS idx_detections_attributes ON detections USING GIN (attributes);

#### Notas de los campos

-   `session_id`: identificador único de la sesión (p. ej.
    `sess-20250929T120101Z`).
-   `dev_id`: identificador de la cámara (o dispositivo) que generó la
    sesión.
-   `stream_path`: ruta interna a MediaMTX usada por el Edge Agent
    (`sess-sessionId`).
-   `edge_start_ts` / `edge_end_ts`: timestamps en milisegundos
    proporcionados por el Edge Agent al abrir/cerrar la sesión.
-   `playlist_url`: ruta HTTP para reproducir la grabación de la sesión.
-   `start_pdt` / `end_pdt`: derivados de las etiquetas
    `PROGRAM-DATE-TIME` en la playlist HLS.
-   `classes`: array de clases detectadas en toda la sesión; se
    actualiza dinámicamente.
-   `detection_id`: se puede construir como
    `<session_id>:<first_ts>:<class>` o usar un UUID.
-   `attributes`: objeto JSON con pares `atributo`: `valor`, p. ej.
    `{ "color": "red" }`. Este campo se actualiza por el
    Attribute Enricher.

## API REST/HTTP

Todas las rutas se exponen bajo `http://localhost:8080` y
aceptan/retornan JSON. En caso de error se devuelve un objeto con
`error` y un código HTTP apropiado.

### POST `/sessions/open`

Abre una sesión de relevancia. Debe llamarse antes de enviar detecciones
y al inicio del streaming.

**Request**

    {
      "session_id": "sess-20250929T120101Z",
      "dev_id": "cam01",
      "stream_path": "sess-20250929T120101Z",
      "edge_start_ts": 1700000000123,
      "thumb_url": null,
      "thumb_ts": null,
      "classes": []
    }

**Response (201 Created)**

    {
      "message": "session opened",
      "playlist_url": null
    }

Si la sesión ya existe se devuelve `409 Conflict`.

### POST `/sessions/close`

Cierra una sesión. El Session Store actualiza `edge_end_ts` y, si se
dispone de `playlist_url`, `start_pdt` y `end_pdt`, los almacena.

**Request**

    {
      "session_id": "sess-20250929T120101Z",
      "edge_end_ts": 1700000006789,
      "playlist_url": "http://localhost:8888/recordings/sess-20250929T120101Z/index.m3u8",
      "start_pdt": "2025-09-29T12:01:01Z",
      "end_pdt": "2025-09-29T12:01:06Z"
    }

**Response (200 OK)**

    {
      "message": "session closed"
    }

Si la sesión no existe se devuelve `404 Not Found`.

### POST `/detections/batch`

Registra detecciones en lote. Cada elemento del array se asocia a una
sesión. Se recomienda llamar frecuentemente (p. ej. cada segundo) para
reducir la sobrecarga.

**Request**

    {
      "session_id": "sess-20250929T120101Z",
      "batch": [
        {
          "first_ts": 1700000000123,
          "last_ts": 1700000000123,
          "class": "persona",
          "score": 0.82,
          "frame_url": "/frames/sess-20250929T120101Z/frame_1700000000123.jpg",
          "attributes": {}
        },
        {
          "first_ts": 1700000000456,
          "last_ts": 1700000000456,
          "class": "sombrero",
          "score": 0.76,
          "frame_url": "/frames/sess-20250929T120101Z/frame_1700000000456.jpg",
          "attributes": {"color": "red"}
        }
      ]
    }

**Response (202 Accepted)**

    {
      "inserted": 2,
      "session_id": "sess-20250929T120101Z"
    }

En caso de que el `session_id` no exista se devuelve `400 Bad Request`.

### POST `/query`

Permite obtener las sesiones que cumplen los predicados establecidos en
`existen` y `noExisten`. Los tokens de búsqueda pueden ser solo una
clase (`"persona"`) o una combinación `clase:atributoValor`
(`"sombrero:red"`).

**Semántica de los predicados**

-   `existen` es una **lista OR interna**: una sesión cumple si para
    cada token en `existen` existe **al menos una** detección que
    satisfaga el token. Es decir, para `["persona", "sombrero:red"]` se
    requieren ambas condiciones, pero si `existen` contiene varias
    combinaciones de atributo para la misma clase, la sesión se acepta
    si cumple alguna de ellas.
-   `noExisten` es un **filtro de exclusión**: una sesión queda
    descartada si existe una detección que satisfaga cualquiera de los
    tokens de `noExisten`.

**Request**

    {
      "existen": ["persona", "sombrero:red"],
      "noExisten": ["mascota"]
    }

**Response (200 OK)**

    {
      "sessions": [
        {
          "session_id": "sess-20250929T120101Z",
          "dev_id": "cam01",
          "playlist_url": "http://localhost:8888/recordings/sess-20250929T120101Z/index.m3u8",
          "start_pdt": "2025-09-29T12:01:01Z",
          "end_pdt": "2025-09-29T12:01:06Z",
          "thumb_url": "/thumbs/sess-20250929T120101Z/thumb.jpg",
          "meta_url": "/meta/sess-20250929T120101Z/annotations.json",
          "classes": ["persona","sombrero"]
        }
      ]
    }

Si no se pasan filtros, el servicio devuelve todas las sesiones; si no
existen resultados se devuelve un array vacío.

#### Pseudocódigo de procesamiento de query

    def parse_token(token: str) -> tuple[str, Optional[tuple[str, str]]]:
        """
        Descompone un token 'clase' o 'clase:atributoValor' en (class, (atributo, valor)).
        Devuelve (class, None) si no hay atributo.
        """
        if ':' in token:
            cl, attr = token.split(':', 1)
            return cl, tuple(attr.split('=')) if '=' in attr else (attr, None)
        return token, None

    def match_session(session_id: str, existen: list[str], no_existen: list[str]) -> bool:
        """
        Verifica si una sesión satisface los predicados existen/noExisten.
        """
        # Para cada token de no_existen, comprobar que NO hay detecciones que lo satisfagan
        for token in no_existen:
            cls, attr = parse_token(token)
            if exists_detection(session_id, cls, attr):
                return False  # descartada

        # Para cada token de existen, comprobar que SÍ hay detecciones que lo satisfagan
        for token in existen:
            cls, attr = parse_token(token)
            if not exists_detection(session_id, cls, attr):
                return False
        return True

    def exists_detection(session_id: str, cls: str, attr: Optional[tuple[str,str]]) -> bool:
        """
        Realiza una consulta eficiente a la tabla detections.  Si attr es None,
        busca detecciones con la clase.  Si attr=(k,v), busca detecciones con
        class=cls y attributes->>k = v.
        """
        if attr is None:
            return db.query("SELECT 1 FROM detections WHERE session_id=? AND class=? LIMIT 1", (session_id, cls))
        k, v = attr
        return db.query("SELECT 1 FROM detections WHERE session_id=? AND class=? AND attributes->>? = ? LIMIT 1", (session_id, cls, k, v))

La implementación real debería aprovechar índices para evitar recorrer
todas las detecciones.

## Integración con el Attribute Enricher

El Session Store expone un método opcional
`PATCH /detections/{detection_id}/attributes` (no obligatorio en esta
especificación) que permite al Attribute Enricher actualizar el campo
`attributes`. La actualización debe ser idempotente y registrar la fecha
de modificación. Ejemplo:

    PATCH /detections/sess-20250929T120101Z:1700000000123:persona/attributes
    Content-Type: application/json

    {
      "attributes": {"color": "red"}
    }

La respuesta será `200 OK` con la detección actualizada. Si la detección
no existe se devuelve `404 Not Found`.

## Errores y casos límite

-   **Sesión inexistente**: llamar a `/sessions/close` o
    `/detections/batch` con un `session_id` no registrado devuelve `404`
    o `400` según corresponda.
-   **Datos incompletos**: omitir campos obligatorios (`session_id`,
    `dev_id`, `edge_start_ts`) en `/sessions/open` produce
    `400 Bad Request`.
-   **Consistencia de timestamps**: si `edge_end_ts` es menor que
    `edge_start_ts` se rechaza la solicitud.
-   **Conflictos de ID**: intentar abrir dos sesiones con el mismo
    `session_id` produce `409 Conflict`.

## Performance y escalabilidad

-   Aunque el entorno es local, se recomienda emplear una base de datos
    con **índices GIN** para las columnas `classes` y `attributes` a fin
    de acelerar las consultas JSON.
-   Las operaciones de inserción (`/detections/batch`) deben aceptar
    lotes de hasta 1000 detecciones para minimizar las transacciones. Es
    importante utilizar transacciones y prepared statements.
-   La respuesta de `/query` debe paginarse cuando el número de sesiones
    crezca. En un laboratorio con pocos dispositivos, devolver todas las
    coincidencias suele ser suficiente; sin embargo, se puede añadir
    parámetros `limit` y `offset` opcionales.

## Observabilidad

-   **Logs**: cada petición HTTP debe registrarse con un identificador
    único, método, URL, código de estado, duración y payload resumido.
    Los eventos de inserción masiva deben incluir el número de
    detecciones insertadas.
-   **Métricas**: exponer un endpoint `/metrics` con contadores como
    `sessions_total`, `detections_total`, `query_requests_total` y
    medidas de latencia para `/query`.

## Seguridad mínima local

El servicio no implementa TLS ni autenticación. Las solicitudes se
aceptan desde la misma red local. Para evitar escritura maliciosa en la
base de datos, se recomienda ejecutar el proceso como usuario no
privilegiado y aplicar un firewall que restrinja el puerto `8080` a la
máquina local.

## Pruebas y criterios de aceptación

1.  **Pruebas unitarias del modelo de datos**: crear y eliminar sesiones
    y detecciones, verificando integridad referencial y restricciones
    (`edge_end_ts` ≥ `edge_start_ts`).
2.  **Pruebas de API**: utilizar herramientas como `curl` o `Postman`
    para abrir una sesión, enviar detecciones, cerrarla y ejecutar
    queries con distintos filtros. Verificar que las respuestas y
    códigos de estado se ajustan a la especificación.
3.  **Pruebas de rendimiento**: insertar \>10 000 detecciones y ejecutar
    consultas con filtros complejos (`existen` y `noExisten`) midiendo
    el tiempo de respuesta. Ajustar índices si la latencia supera
    100 ms.
4.  **Pruebas de concurrencia**: simular múltiples Edge Agents
    escribiendo en paralelo y ejecutar queries concurrentes para
    detectar condiciones de carrera.

## Definition of Done del Session Store

-   \[ \] La base de datos almacena sesiones y detecciones según el
    esquema definido.
-   \[ \] Se implementan los endpoints `/sessions/open`,
    `/sessions/close`, `/detections/batch` y `/query` con las respuestas
    y códigos de error especificados.
-   \[ \] El campo `classes` de una sesión se actualiza al insertar
    nuevas detecciones.
-   \[ \] La función de consulta acepta tokens `clase` y
    `clase:atributoValor` y aplica correctamente la lógica OR/AND para
    `existen` y de exclusión para `noExisten`.
-   \[ \] Se registran logs estructurados y se exponen métricas básicas.
-   \[ \] Se han definido pruebas unitarias y de integración que cubren
    los casos normales y de error.
