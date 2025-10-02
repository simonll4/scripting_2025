# 04 -- Attribute Enricher

## Resumen ejecutivo

El **Attribute Enricher** es un módulo auxiliar que toma las detecciones
generadas por el Edge Agent y les asigna atributos adicionales, como el
color dominante de un objeto. Su principal objetivo
es enriquecer la información disponible en el **Session Store** para que
la App UI pueda realizar búsquedas más específicas mediante el campo
`attributes`. Aunque este componente puede integrarse dentro del
Edge Agent, se define de forma separada para permitir despliegues
asíncronos y escalables.

## Responsabilidades y límites

### Qué hace

-   Consume detecciones que aún no tienen atributos calculados.
-   Obtiene el frame correspondiente de `frame_url` (guardado en el
    Object Storage), recorta la región indicada por `bbox` y aplica
    algoritmos de análisis sencillo (p. ej. histograma de color
    dominante) para derivar atributos.
-   Actualiza el campo `attributes` de la detección en el Session Store
    mediante una llamada PATCH idempotente.
-   Registra la fecha y hora de la última actualización de atributos.

### Qué no hace

-   No altera los campos `class`, `score`, `bbox` ni las marcas de
    tiempo de la detección.
-   No realiza inferencia pesada; si se requiere un modelo más complejo
    (p. ej. clasificación de prendas), se podría introducir como un
    atributo adicional, pero no es parte de esta especificación básica.
-   No guarda los frames; simplemente lee de Object Storage y no
    persiste copias adicionales.

## Algoritmo base

Para un primer prototipo se propone una heurística simple para calcular
el **color dominante** del objeto detectado. El algoritmo sigue estos
pasos:

1.  Descargar el JPEG desde `frame_url` a memoria.
2.  Recortar la región indicada por `bbox` (coordenadas normalizadas).
    El recorte se realiza multiplicando los valores `x0,y0,x1,y1` por el
    ancho y alto de la imagen original.
3.  Reducir el recorte a un tamaño pequeño (p. ej. 32×32 px) y
    convertirlo a espacio de color HSV.
4.  Calcular el histograma de la componente H (tono) y seleccionar el
    bin de mayor frecuencia.
5.  Mapear ese bin a un color semántico (p. ej. rojo, verde, azul,
    amarillo) mediante rangos predefinidos.

Pseudocódigo:

    from PIL import Image

    COLOR_BINS = {
        'red':   [(0,15),(345,360)],
        'orange':[(16,45)],
        'yellow':[(46,75)],
        'green': [(76,150)],
        'cyan':  [(151,195)],
        'blue':  [(196,255)],
        'purple':[(256,315)],
        'pink': [(316,344)],
    }

    def dominant_color(hsv_crop) -> str:
        h_values = [p[0] for row in hsv_crop for p in row]
        # Convertir H a grados en [0,360)
        degs = [h*360 for h in h_values]
        # Histograma simple en bins de 10 grados
        hist = {k:0 for k in COLOR_BINS}
        for deg in degs:
            for color, ranges in COLOR_BINS.items():
                for r0, r1 in ranges:
                    if r0 <= deg < r1:
                        hist[color] += 1
                        break
        return max(hist, key=hist.get)

    def enrich_detection(d: dict, frame_path: str) -> dict:
        img = Image.open(frame_path).convert('RGB')
        W, H = img.size
        x0, y0, x1, y1 = d['bbox']
        crop = img.crop((x0*W, y0*H, x1*W, y1*H)).resize((32,32))
        hsv = crop.convert('HSV')
        color = dominant_color(list(hsv.getdata()))
        d['attributes']['color'] = color
        return d

El algoritmo es intencionalmente simple para minimizar el consumo
computacional. Se puede extender para otros atributos (p. ej. tamaño
relativo, presencia de gafas) añadiendo más heurísticas.

## Interface del servicio

El Attribute Enricher expone un único endpoint HTTP para procesar
detecciones. Alternativamente, el enriquecimiento puede ejecutarse como
un consumidor de cola que lea las filas de la base de datos. En esta
especificación se opta por una API explícita para facilitar el testeo.

### POST `/enrich`

Recibe una lista de `detection_id` y procesa cada una, actualizando sus
atributos en el Session Store.

**Request**

    {
      "detections": [
        {
          "detection_id": "sess-20250929T120101Z:1700000000123:persona",
          "frame_url": "/frames/sess-20250929T120101Z/frame_1700000000123.jpg",
          "bbox": [0.1,0.2,0.3,0.5]
        },
        {
          "detection_id": "sess-20250929T120101Z:1700000000456:sombrero",
          "frame_url": "/frames/sess-20250929T120101Z/frame_1700000000456.jpg",
          "bbox": [0.12,0.15,0.28,0.40]
        }
      ]
    }

**Response (200 OK)**

    {
      "processed": 2,
      "updated": [
        {
          "detection_id": "sess-20250929T120101Z:1700000000123:persona",
          "attributes": {"color": "blue"}
        },
        {
          "detection_id": "sess-20250929T120101Z:1700000000456:sombrero",
          "attributes": {"color": "red"}
        }
      ]
    }

Si una detección no existe o ya ha sido enriquecida, se ignora y se
registra un aviso. Para cada detección se llama a
`PATCH /detections/{detection_id}/attributes` en el Session Store con el
nuevo atributo. La operación debe ser idempotente: volver a enviar el
mismo color no debe crear duplicados.

### Integración asíncrona

Para una arquitectura más robusta, el Attribute Enricher puede
suscribirse a una cola (MQTT) donde el
Session Store publique nuevas detecciones sin atributos. El enricher las
consume, calcula los atributos y actualiza la base de datos. Este
enfoque reduce la latencia del Edge Agent y del Session Store,
permitiendo paralelizar el enriquecimiento.

## Configuración

  -------------------------------------------------------------------------
  Variable                Descripción             Valor por defecto
  ----------------------- ----------------------- -------------------------
  `SESSION_STORE_URL`     URL base del            `http://localhost:8080`
                          Session Store           

  `OBJECT_STORAGE_BASE`   Directorio raíz del     `/var/lib/recordings`
                          Object Storage local    

  `WORKERS`               Número de               `2`
                          hilos/procesos para     
                          paralelizar el          
                          enriquecimiento         

  `COLOR_BINS`            Definición de rangos de ver pseudocódigo
                          color para el algoritmo 
                          de color dominante      
  -------------------------------------------------------------------------

## Rendimiento y observabilidad

-   **Latencia**: el procesamiento de un recorte 32×32 es muy rápido
    (\<1 ms). Incluso en CPU se pueden procesar cientos de detecciones
    por segundo. Se recomienda ajustar `WORKERS` según el número de
    Edge Agents.
-   **Logs**: registrar cada detección procesada con campos
    `detection_id`, `attributes` y la duración del procesamiento. En
    caso de error al leer una imagen o actualizar el Session Store,
    registrar el fallo y continuar con las siguientes detecciones.
-   **Métricas**: exponer contadores como `detections_enriched_total`,
    `enrich_errors_total`, `processing_time_seconds` (histograma).

## Seguridad mínima local

El Attribute Enricher se ejecuta en la misma red local, sin TLS ni
autenticación. Aunque consume rutas del Object Storage y Session Store,
se asume que la infraestructura está aislada. Se recomienda ejecutar el
enricher con permisos mínimos de lectura en el directorio de frames y
únicamente acceso de escritura vía API al Session Store.

## Pruebas y criterios de aceptación

1.  **Pruebas unitarias del algoritmo de color**: generar imágenes
    sintéticas de colores primarios y verificar que `dominant_color`
    devuelve el color correcto.
2.  **Pruebas de API**: enviar un lote de detecciones al endpoint
    `/enrich` y comprobar que el Session Store actualiza el campo
    `attributes` de cada detección.
3.  **Pruebas de idempotencia**: llamar múltiples veces a `/enrich` con
    la misma detección y comprobar que el atributo no se duplica en la
    base de datos.
4.  **Pruebas de fallo de red**: simular indisponibilidad temporal del
    Session Store; el enricher debe reintentar o registrar el error sin
    bloquear el procesamiento de otras detecciones.

## Definition of Done del Attribute Enricher

-   \[ \] Se implementa un endpoint `/enrich` que acepta detecciones y
    actualiza sus atributos en el Session Store.
-   \[ \] Se calcula correctamente el color dominante u otros atributos
    sencillos con baja latencia.
-   \[ \] Las actualizaciones son idempotentes y se registra el momento
    de enriquecimiento.
-   \[ \] Se generan logs y métricas de procesamiento y errores.
-   \[ \] Las pruebas de algoritmo, API, idempotencia y fallos de red
    han sido completadas con éxito.
