/**
 * ============================================================================
 * SERVER COMMANDS DEFINITIONS
 * ============================================================================
 *
 * Definiciones de los comandos específicos que soporta el servidor.
 * Estos comandos son implementaciones del business logic del servidor,
 */

export const SERVER_COMMANDS = Object.freeze({
  // Información del sistema operativo
  GET_OS_INFO: "GET_OS_INFO",

  // Monitoreo de archivos/directorios
  WATCH: "WATCH",
  GET_WATCHES: "GET_WATCHES",

  // Información de procesos
  PS: "PS",

  // Ejecución de comandos del sistema operativo
  OS_CMD: "OS_CMD",

  // Desconexión del agente
  QUIT: "QUIT",
});

/**
 * Descripción de cada comando:
 *
 * GET_OS_INFO: Obtiene información del sistema (CPU, memoria) de un período específico
 *   - Parámetros: time (segundos anteriores al momento actual)
 *   - Respuesta: arreglo [{cpu: data, mem: free, time: timestamp}]
 *
 * WATCH: Inicia monitoreo de un directorio/archivo
 *   - Parámetros: path, time (opcional, default 60s, máximo 3600s)
 *   - Respuesta: token_de_seguimiento
 *
 * GET_WATCHES: Obtiene eventos del monitoreo
 *   - Parámetros: token_de_seguimiento
 *   - Respuesta: arreglo [{tipoEvento, archivo, tiempo}]
 *
 * PS: Lista procesos del sistema
 *   - Parámetros: ninguno
 *   - Respuesta: lista de procesos remotos
 *
 * OS_CMD: Ejecuta comando del sistema operativo
 *   - Parámetros: comando y argumentos
 *   - Respuesta: salida del comando
 *   - Nota: Requiere mecanismos de seguridad (whitelist, IP whitelist, etc.)
 *
 * QUIT: Termina la conexión con el agente
 *   - Parámetros: ninguno
 *   - Respuesta: confirmación de desconexión
 */
