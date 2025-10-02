# 06 -- App UI (Vue.js)

## Resumen ejecutivo

La **App UI** es la interfaz de usuario que permite navegar por el
catálogo de grabaciones relevantes. Construida con **Vue.js**, consume
la API del **Session Store** para listar sesiones, filtrar por clases y
atributos, reproducir grabaciones HLS servidas por **MediaMTX** y
mostrar miniaturas y anotaciones. Esta UI es ligera y se ejecuta
localmente en el puerto `3000` (modo desarrollo) o se despliega como
archivos estáticos en un servidor HTTP local.

## Responsabilidades y límites

### Qué hace

-   Permite al usuario introducir filtros (`existen`, `noExisten`) y
    enviar consultas al Session Store (`POST /query`).
-   Muestra una lista de sesiones con información resumida: hora de
    inicio/fin (`start_pdt`/`end_pdt`), miniatura (`thumb_url`), lista
    de clases detectadas y botón de reproducción.
-   Reproduce la grabación HLS de una sesión en un reproductor HTML5
    (p. ej. utilizando **hls.js**), consumiendo `playlist_url` de
    MediaMTX.
-   Ofrece la opción de superponer las anotaciones (bounding boxes)
    sobre el vídeo, leyendo `meta_url` y sincronizando los frames con la
    reproducción.
-   Gestiona estados vacíos, errores de carga y muestra
    retroalimentación al usuario.

### Qué no hace

-   No permite descargar ni editar grabaciones; es una aplicación de
    solo lectura.
-   No expone configuraciones internas ni métricas de los servicios.
-   No implementa autenticación en este entorno local.

## Vistas principales

### 1. Pantalla de búsqueda/listado

-   **Formulario de filtros**:
-   Campo de texto para `existen` (permite escribir tokens separados por
    comas, e.g. `persona,sombrero:red`).
-   Campo de texto para `noExisten` (tokens separados por comas).
-   Botón **Buscar** que envía la consulta al Session Store vía
    `POST /query`.
-   **Lista de sesiones**: cada elemento de la lista muestra:
-   Miniatura (`thumb_url`) o un icono placeholder si falta.
-   Fechas formateadas de inicio y fin (`start_pdt` -- `end_pdt`).
-   Etiquetas con las clases detectadas.
-   Icono o botón para abrir la pantalla de reproducción.
-   Mensaje "sin miniatura" cuando `thumb_url` es `null` o inaccesible.
-   **Paginación** (opcional): si `/query` retorna muchas sesiones, se
    pueden dividir en páginas.
-   **Estado vacío**: mensaje "No hay sesiones que coincidan con los
    filtros" si la lista está vacía.

### 2. Pantalla de reproducción/detalle

-   **Reproductor HLS**: instancia de `hls.js` enlazada a
    `playlist_url`. Debe manejar eventos de error (`onError`) y mostrar
    un mensaje si el vídeo no está disponible.
-   **Cronología**: debajo del vídeo se puede mostrar una línea de
    tiempo con marcas de eventos (detecciones), utilizando los
    timestamps de `meta_url`. Las marcas se colocan en proporción a la
    duración total.
-   **Overlay opcional**: al activar un toggle "Mostrar anotaciones", la
    aplicación carga `meta_url` (archivo JSON) y dibuja rectángulos
    (`bbox`) sobre el vídeo en sincronía con el tiempo de reproducción.
    Este overlay puede implementarse con un `<canvas>` superpuesto al
    vídeo.
-   **Información adicional**: se muestran los atributos enriquecidos
    (p. ej. `color=red`) de las detecciones actuales o el resumen de
    atributos de la sesión.
-   **Navegación**: botón "Volver al listado" para regresar a la vista
    anterior conservando los filtros.

## API consumida

La App UI interactúa exclusivamente con el Session Store y MediaMTX. Las
rutas relevantes son:

-   `POST /query` -- para obtener la lista de sesiones. La app envía el
    cuerpo JSON con `existen` y `noExisten`.
-   `playlist_url` -- propiedad de cada sesión que apunta a MediaMTX
    (p. ej. `http://localhost:8888/recordings/sess-.../index.m3u8`).
    Consumido por `hls.js`.
-   `thumb_url` y `meta_url` -- consumidos directamente mediante
    peticiones HTTP al Object Storage.
-   `GET /detections/{detection_id}` (opcional) -- si la UI necesita
    detalles de una detección específica.

No se requieren cabeceras de autenticación ni tokens en este entorno
local.

## Estados vacíos y errores

-   **Sesiones no encontradas**: mostrar un mensaje amigable y sugerir
    al usuario ampliar los filtros o comprobar la ortografía de los
    tokens.
-   **Playlist inaccesible** (`404` o `500` desde MediaMTX): mostrar
    "Grabación no disponible" y un botón para reintentar. También
    registrar el incidente en los logs de la UI.
-   **Fallo de red**: mostrar un banner de error y reintentar
    automáticamente tras un breve periodo.
-   **Miniatura faltante**: usar una imagen placeholder genérica y
    marcar la sesión como incompleta.
-   **JSON de anotaciones corrupto**: desactivar el overlay y mostrar un
    mensaje "No se pueden cargar las anotaciones".

## Criterios de aceptación UX

-   **Tiempo de carga**: las consultas a `/query` deben completarse en
    \<200 ms para que la lista se actualice rápidamente.
-   **Reproducción fluida**: la carga del HLS debe comenzar en \<2 s y
    el reproductor no debe quedar en blanco más de 1 s durante el cambio
    de segmentos.
-   **Feedback inmediato**: al aplicar filtros, la UI muestra un loader
    mientras se procesan los resultados y deshabilita el botón de
    búsqueda para evitar envíos duplicados.
-   **Compatibilidad**: la UI debe funcionar en los principales
    navegadores modernos (Chrome, Firefox, Edge) sin plugins
    adicionales.
-   **Accesibilidad**: se deben incluir atributos `alt` para las
    imágenes, contrastes de color adecuados y un diseño responsive.

## Seguridad mínima local

Dado que la UI opera en la misma red y no implementa autenticación, se
asume que los usuarios tienen acceso legítimo. No obstante, se deben
evitar vulnerabilidades de inyección:

-   Sanitizar los valores de `existen` y `noExisten` antes de enviarlos
    al servidor.
-   Evitar interpolar `playlist_url` directamente en el DOM sin
    escapado.
-   Restringir el origen de las peticiones (`baseURL`) a `localhost`
    para prevenir llamadas arbitrarias.

## Pruebas y criterios de aceptación

1.  **Pruebas unitarias de componentes**: los componentes Vue (lista,
    filtros, reproductor) se prueban con datos simulados para validar
    que renderizan correctamente y reaccionan a eventos.
2.  **Pruebas de integración**: levantar el Session Store y MediaMTX en
    modo de test, crear varias sesiones con distintos atributos y
    verificar que la UI las filtra y reproduce correctamente.
3.  **Pruebas de usuario**: realizar sesiones en un dispositivo y pedir
    a usuarios que busquen objetos concretos (p. ej. "sombrero rojo"),
    asegurando que la lista se actualiza y que el overlay se sincroniza
    con el vídeo.
4.  **Pruebas de error**: desconectar MediaMTX o eliminar archivos para
    comprobar que la UI gestiona los fallos sin bloquearse.

## Definition of Done de la App UI

-   \[ \] La interfaz permite introducir filtros `existen` y `noExisten`
    y envía correctamente las consultas al Session Store.
-   \[ \] La lista de sesiones muestra miniaturas, duración y clases
    detectadas, con estados vacíos y mensajes de error adecuados.
-   \[ \] El reproductor HLS reproduce las grabaciones en streaming
    desde MediaMTX con un overlay opcional de anotaciones sincronizadas.
-   \[ \] La UI utiliza rutas `thumb_url` y `meta_url` del
    Object Storage y gestiona la indisponibilidad de archivos.
-   \[ \] La aplicación responde de forma fluida (\<200 ms para
    consultas) y es accesible en navegadores modernos.
-   \[ \] Se han ejecutado las pruebas unitarias, de integración y
    manuales descritas.
