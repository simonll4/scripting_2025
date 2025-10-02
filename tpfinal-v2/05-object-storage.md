# 05 -- Object Storage

## Resumen ejecutivo

El **Object Storage** proporciona un almacenamiento simple basado en el
sistema de ficheros para guardar los recursos generados por el
Edge Agent: marcos (`frames`) capturados de las sesiones, miniaturas
(`thumbs`) y ficheros de anotaciones (`meta`). Al no utilizar soluciones
como S3 o MinIO, este módulo se limita a exponer directorios locales a
través de un servidor HTTP o mediante la propia App UI. La finalidad es
que otros componentes puedan acceder a los archivos mediante rutas
deterministas sin necesidad de credenciales ni cifrado.

## Responsabilidades y límites

### Qué hace

-   Organiza los archivos en una jerarquía por `session_id` para
    facilitar su localización.
-   Almacena las miniaturas y los metadatos (`meta.json`) generados
    durante cada sesión.
-   Proporciona rutas HTTP o file:// para que la App UI muestre
    miniaturas y superponga anotaciones.
-   Implementa una política simple de retención basada en tamaño o días.

### Qué no hace

-   No replica ni sincroniza los archivos con servicios externos.
-   No verifica integridad de los archivos (sin checksums); los errores
    de lectura se detectan en tiempo de consumo.
-   No expone autenticación ni autorización; asume que el acceso es
    interno al laboratorio.

## Estructura de directorios

Se define un directorio raíz configurado mediante `OBJECT_STORAGE_BASE`
(p. ej. `/var/lib/recordings`). Dentro de este, se crean subdirectorios
por cada sesión. La estructura recomendada es:

    <OBJECT_STORAGE_BASE>/
      └── sess-<session_id>/
          ├── frames/
          │    ├── frame_<ts1>.jpg
          │    ├── frame_<ts2>.jpg
          │    └── ...
          ├── thumb.jpg
          ├── meta.json
          └── meta.ts  (opcional; timestamp de última actualización del meta)

-   `frames/frame_<ts>.jpg`: imagen JPEG capturada por el Edge Agent,
    donde `<ts>` corresponde al timestamp del frame en milisegundos. El
    nombre exacto se deriva de `first_ts` al serializar detecciones.
-   `thumb.jpg`: miniatura seleccionada para la sesión. Se guarda al
    cerrar la sesión junto con `thumb_ts`.
-   `meta.json`: archivo JSON con las anotaciones (detecciones y tracks)
    de la sesión. Generado por el Edge Agent y almacenado al finalizar
    la sesión. Su ruta se registra en `meta_url` del Session Store.
-   `meta.ts`: archivo opcional que contiene la última hora de
    actualización de `meta.json` para facilitar la comprobación de
    caducidad.

Para exponer estos archivos al navegador, se recomienda un servidor HTTP
sencillo que sirva la raíz del `OBJECT_STORAGE_BASE` en un puerto
(p. ej. 8090/tcp). De este modo, una URL de miniatura sería:

    http://localhost:8090/sess-<session_id>/thumb.jpg

El Session Store almacenará `thumb_url` y `meta_url` basándose en esta
convención.

## Política de retención

En un entorno de laboratorio se suelen acumular muchos archivos. Se
propone una política configurable de retención:

-   **Por capacidad**: definir `MAX_STORAGE_GB` (p. ej. 10 GB). Cuando
    el directorio ocupe más espacio, se eliminan sesiones antiguas
    completas (directorios enteros) según `created_at` almacenado en el
    Session Store.
-   **Por tiempo**: definir `MAX_DAYS` (p. ej. 7 días). Pasado ese
    tiempo desde `edge_end_ts`, se eliminan los directorios de la sesión
    y se purgan las entradas de la base de datos mediante un job
    programado.

La elección de política depende de la capacidad de disco y del propósito
del laboratorio. La eliminación debe coordinarse con el Session Store
para evitar referencias a `thumb_url` o `meta_url` inexistentes.

## Rutas públicas y seguridad

Como la solución no utiliza TLS ni autenticación, cualquier usuario que
conozca las rutas podría descargar los archivos. En un entorno de
laboratorio esto se considera aceptable. No obstante, se sugieren las
siguientes prácticas:

-   Ejecutar el servidor de archivos sólo en la interfaz `localhost` o
    en una red privada.
-   Establecer permisos restrictivos en el sistema de ficheros (p. ej.
    755 para directorios y 644 para archivos) y ejecutar el servidor con
    un usuario no privilegiado.
-   No exponer los archivos al exterior mediante redirecciones o proxies
    públicos.

## Errores y casos límite

-   **Archivo faltante**: si `thumb_url` o `meta_url` apuntan a un
    archivo no existente (por limpieza o error de escritura), la App UI
    debe mostrar un placeholder y el Session Store debería marcar la
    sesión como `incompleta`.
-   **Nombre de archivo inválido**: se debe validar que `session_id` y
    `ts` no contienen caracteres fuera de `[a-zA-Z0-9_-]` para evitar
    inyección de rutas.
-   **Concurrencia**: mientras el Edge Agent escribe frames en
    `frames/`, el servidor de archivos podría leer el mismo archivo; se
    requiere flush al cerrar el archivo y es aconsejable escribir en un
    archivo temporal y renombrar tras finalizar.

## Configuración

  -----------------------------------------------------------------------
  Variable                Descripción             Valor por defecto
  ----------------------- ----------------------- -----------------------
  `OBJECT_STORAGE_BASE`   Directorio raíz donde   `/var/lib/recordings`
                          se guardan sesiones,    
                          miniaturas y metadatos  

  `HTTP_STATIC_PORT`      Puerto en el que el     `8090`
                          servidor de archivos    
                          sirve los contenidos    

  `MAX_STORAGE_GB`        Tamaño máximo (en GB)   `10`
                          antes de eliminar       
                          sesiones antiguas       

  `MAX_DAYS`              Número de días que se   `7`
                          conservan los archivos  
  -----------------------------------------------------------------------

## Observabilidad

-   **Logs**: el servidor de archivos debe registrar cada acceso (ruta,
    método, código de estado, tamaño de la respuesta). Los procesos de
    limpieza deben registrar qué sesiones se han eliminado.
-   **Métricas**: medir el espacio usado (`storage_used_bytes`), número
    de sesiones almacenadas y archivos servidos por segundo.

## Pruebas y criterios de aceptación

1.  **Pruebas de lectura**: tras cerrar una sesión, verificar que
    `thumb_url` y `meta_url` son accesibles y contienen los datos
    correctos. Abrir varias imágenes y archivos meta para asegurar que
    no están corruptos.
2.  **Pruebas de limpieza**: configurar un entorno con `MAX_STORAGE_GB`
    pequeño, generar múltiples sesiones y comprobar que las más antiguas
    se eliminan cuando se supera el límite. Verificar que el
    Session Store elimina las referencias correspondientes.
3.  **Pruebas de concurrencia**: escribir frames en una sesión mientras
    se sirven peticiones GET simultáneas; asegurarse de que no hay
    archivos incompletos ni corrupción.

## Definition of Done del Object Storage

-   \[ \] Se crea una estructura de directorios por `session_id` con
    subdirectorios `frames/`, `thumb.jpg` y `meta.json`.
-   \[ \] Se expone un servidor HTTP simple en el puerto configurado y
    se pueden descargar los archivos mediante las rutas derivadas de
    `OBJECT_STORAGE_BASE`.
-   \[ \] Se implementa una política de retención por capacidad y/o por
    tiempo y se coordina con el Session Store para limpiar referencias.
-   \[ \] Se manejan errores de archivos ausentes o permisos y se
    registran adecuadamente.
-   \[ \] Se valida que las rutas no permiten inyección y que los
    archivos se escriben de forma atómica.
