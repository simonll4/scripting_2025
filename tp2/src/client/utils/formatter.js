/**
 * ============================================================================
 * RESPONSE FORMATTER - CONSOLE OUTPUT
 * ============================================================================
 */

import { PROTOCOL } from "../../protocol/index.js";

// Símbolos simples para formato
const ICONS = {
  success: "[OK]",
  error: "[ERROR]",
  warning: "[WARN]",
  info: "[INFO]",
  time: "[TIME]",
  cpu: "[CPU]",
  memory: "[MEM]",
  process: "[PROC]",
  file: "[FILE]",
  user: "[USER]",
  command: "[CMD]",
  watch: "[WATCH]",
  network: "[NET]",
  server: "[SRV]",
  arrow: ">",
  bullet: "*",
  separator: "-",
};

// Colores ANSI
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
};

/**
 * Utilidades de formato
 */
function colorize(text, color = "reset") {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createHeader(title, icon = ICONS.info) {
  const line = "=".repeat(50);
  return `\n${colorize(line, "cyan")}\n${colorize(
    `${title.toUpperCase()}`,
    "bold"
  )}\n${colorize(line, "cyan")}`;
}

function createSubheader(title, icon = ICONS.arrow) {
  return `\n${colorize(`${title}:`, "brightCyan")}`;
}

function createSeparator() {
  return colorize("-".repeat(50), "gray");
}

/**
 * Formateadores específicos por comando
 */

function formatGetOsInfo(data) {
  const { samples } = data;

  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return `${ICONS.warning} No hay datos de sistema disponibles`;
  }

  const latest = samples[samples.length - 1];
  const oldest = samples[0];
  const avgCpu =
    samples.reduce((sum, s) => sum + (s.cpu || 0), 0) / samples.length;
  const avgMemPercent =
    samples.reduce((sum, s) => sum + (s.memUsedPercent || 0), 0) /
    samples.length;

  let output = createHeader("INFORMACIÓN DEL SISTEMA");

  // Resumen actual
  output += createSubheader("Estado Actual");
  output += `\n  CPU: ${colorize(
    `${(latest.cpu || 0).toFixed(1)}%`,
    latest.cpu > 80 ? "red" : latest.cpu > 50 ? "yellow" : "green"
  )}`;
  output += `\n  Memoria: ${colorize(
    formatBytes(latest.memUsed || 0),
    "cyan"
  )} (${colorize(
    `${(latest.memUsedPercent || 0).toFixed(1)}%`,
    latest.memUsedPercent > 80
      ? "red"
      : latest.memUsedPercent > 50
      ? "yellow"
      : "green"
  )})`;
  output += `\n  Timestamp: ${colorize(formatTimestamp(latest.time), "gray")}`;

  // Estadísticas del período
  output += createSubheader("Estadísticas del Período");
  output += `\n  * Muestras analizadas: ${colorize(
    samples.length.toString(),
    "brightBlue"
  )}`;
  output += `\n  * CPU promedio: ${colorize(
    `${avgCpu.toFixed(1)}%`,
    "brightGreen"
  )}`;
  output += `\n  * Memoria promedio: ${colorize(
    `${avgMemPercent.toFixed(1)}%`,
    "brightGreen"
  )}`;
  output += `\n  * Período: ${colorize(
    formatTimestamp(oldest.time),
    "gray"
  )} a ${colorize(formatTimestamp(latest.time), "gray")}`;

  return output;
}

function formatPs(data) {
  const { processes = [], meta = {} } = data;

  let output = createHeader("PROCESOS DEL SISTEMA");

  // Información de metadatos
  if (meta.summary) {
    output += createSubheader("Resumen del Sistema");
    output += `\n  * Total procesos: ${colorize(
      meta.summary.all?.toString() || "0",
      "brightBlue"
    )}`;
    output += `\n  * En ejecución: ${colorize(
      meta.summary.running?.toString() || "0",
      "brightGreen"
    )}`;
    output += `\n  * Durmiendo: ${colorize(
      meta.summary.sleeping?.toString() || "0",
      "brightYellow"
    )}`;
    output += `\n  * Bloqueados: ${colorize(
      meta.summary.blocked?.toString() || "0",
      "brightRed"
    )}`;
  }

  // Filtros aplicados
  const filters = [];
  if (meta.sortBy)
    filters.push(`orden: ${meta.sortBy} ${meta.order || "desc"}`);
  if (meta.limit) filters.push(`límite: ${meta.limit}`);

  if (filters.length > 0) {
    output += createSubheader("Filtros Aplicados");
    output += `\n  * ${filters.join(", ")}`;
  }

  if (meta.truncated) {
    output += `\n${colorize(
      "ADVERTENCIA: Respuesta truncada por límite de tamaño",
      "yellow"
    )}`;
  }

  if (processes.length === 0) {
    output += `\n\nNo se encontraron procesos con los filtros especificados`;
    return output;
  }

  // Lista de procesos
  output += createSubheader(
    `Procesos (${meta.returned || processes.length}/${meta.total || "?"})`
  );
  output += `\n${createSeparator()}`;

  // Encabezado de tabla
  output += `\n${colorize("PID".padEnd(8), "bold")}${colorize(
    "USER".padEnd(12),
    "bold"
  )}${colorize("CPU%".padEnd(8), "bold")}${colorize(
    "MEM".padEnd(10),
    "bold"
  )}${colorize("COMMAND".padEnd(30), "bold")}`;
  output += `\n${createSeparator()}`;

  // Procesos
  processes.forEach((proc) => {
    const pid = (proc.pid || "?").toString().padEnd(8);
    const user = (proc.user || "?").substring(0, 11).padEnd(12);
    const cpu = ((proc.cpuPercent || 0).toFixed(1) + "%").padEnd(8);
    const mem = formatBytes(proc.memRssBytes || 0).padEnd(10);
    const cmd = (proc.name || proc.cmd || "?").substring(0, 29).padEnd(30);

    const cpuColor =
      proc.cpuPercent > 50 ? "red" : proc.cpuPercent > 20 ? "yellow" : "green";

    output += `\n${colorize(pid, "brightBlue")}${colorize(
      user,
      "cyan"
    )}${colorize(cpu, cpuColor)}${colorize(mem, "magenta")}${colorize(
      cmd,
      "white"
    )}`;
  });

  return output;
}

function formatWatch(data) {
  if (data.error) {
    return `${colorize("Error iniciando monitoreo:", "red")} ${
      data.message || data.error
    }`;
  }

  const { token, path, duration } = data;

  let output = createHeader("MONITOREO INICIADO");
  output += `\n  Ruta: ${colorize(path || "N/A", "brightCyan")}`;
  output += `\n  Duración: ${colorize(
    formatDuration((duration || 60) * 1000),
    "brightGreen"
  )}`;
  output += `\n  Token: ${colorize(token || "N/A", "brightYellow")}`;
  output += `\n\nUse el siguiente comando para ver eventos:`;
  output += `\n${colorize(`getwatches ${token}`, "brightGreen")}`;

  return output;
}

function formatGetWatches(data) {
  if (data.error) {
    return `${colorize("Error obteniendo eventos:", "red")} ${
      data.message || data.error
    }`;
  }

  const { events = [], meta = {} } = data;

  let output = createHeader("EVENTOS DE MONITOREO");

  // Metadatos
  if (meta.window) {
    const { since, until } = meta.window;
    output += createSubheader("Ventana Temporal");
    if (since)
      output += `\n  * Desde: ${colorize(formatTimestamp(since), "gray")}`;
    if (until)
      output += `\n  * Hasta: ${colorize(formatTimestamp(until), "gray")}`;
  }

  output += createSubheader("Información de Página");
  output += `\n  * Eventos en esta página: ${colorize(
    meta.returned?.toString() || events.length.toString(),
    "brightBlue"
  )}`;
  output += `\n  * Hay más páginas: ${colorize(
    meta.hasMore ? "Sí" : "No",
    meta.hasMore ? "yellow" : "green"
  )}`;
  output += `\n  * Orden: ${colorize(meta.order || "asc", "cyan")}`;

  if (meta.truncated) {
    output += `\n${colorize(
      "ADVERTENCIA: " + (meta.warning || "Respuesta truncada"),
      "yellow"
    )}`;
  }

  if (meta.nextCursor) {
    output += `\n  Cursor siguiente: ${colorize(meta.nextCursor, "dim")}`;
  }

  if (events.length === 0) {
    output += `\n\nNo hay eventos en el rango especificado`;
    return output;
  }

  // Lista de eventos
  output += createSubheader(`Eventos (${events.length})`);
  output += `\n${createSeparator()}`;

  events.forEach((event, index) => {
    const eventColor =
      event.tipoEvento === "created"
        ? "green"
        : event.tipoEvento === "modified"
        ? "yellow"
        : event.tipoEvento === "deleted"
        ? "red"
        : "blue";

    output += `\n${colorize(`${index + 1}.`.padEnd(4), "dim")}${colorize(
      event.tipoEvento || "unknown",
      eventColor
    )} ${colorize(event.archivo || "N/A", "brightCyan")}`;
    output += `\n     ${colorize(formatTimestamp(event.tiempo), "gray")}`;
  });

  if (meta.hasMore && meta.nextCursor) {
    output += `\n\nPara ver más eventos:`;
    output += `\n${colorize(
      `getwatches <token> --cursor ${meta.nextCursor}`,
      "brightGreen"
    )}`;
  }

  return output;
}

function formatOsCmd(data) {
  if (data.error) {
    return `${colorize("Error ejecutando comando:", "red")} ${
      data.message || data.error
    }`;
  }

  const {
    ok,
    exitCode,
    stdout = "",
    stderr = "",
    timedOut,
    truncated,
    signal,
  } = data;

  let output = createHeader("EJECUCIÓN DE COMANDO");

  // Estado de ejecución
  const statusColor = ok ? "green" : "red";
  const statusText = ok ? "EXITOSO" : "FALLIDO";

  output += createSubheader("Estado de Ejecución");
  output += `\n  Estado: ${colorize(statusText, statusColor)}`;
  output += `\n  Código de salida: ${colorize(
    exitCode?.toString() || "N/A",
    exitCode === 0 ? "green" : "red"
  )}`;

  if (signal) {
    output += `\n  Señal: ${colorize(signal, "yellow")}`;
  }

  if (timedOut) {
    output += `\n  ${colorize(
      "El comando excedió el tiempo límite",
      "yellow"
    )}`;
  }

  if (truncated) {
    output += `\n  ${colorize(
      "Salida truncada por límite de tamaño",
      "yellow"
    )}`;
  }

  // Salida estándar
  if (stdout && stdout.trim()) {
    output += createSubheader("Salida Estándar (stdout)");
    output += `\n${colorize(createSeparator(), "green")}`;
    output += `\n${stdout.trim()}`;
    output += `\n${colorize(createSeparator(), "green")}`;
  }

  // Error estándar
  if (stderr && stderr.trim()) {
    output += createSubheader("Error Estándar (stderr)");
    output += `\n${colorize(createSeparator(), "red")}`;
    output += `\n${colorize(stderr.trim(), "red")}`;
    output += `\n${colorize(createSeparator(), "red")}`;
  }

  if (!stdout.trim() && !stderr.trim()) {
    output += `\n\nEl comando no produjo salida`;
  }

  return output;
}

function formatQuit(data) {
  return `${colorize("Desconexión exitosa del servidor", "green")}`;
}

function formatError(errorMsg) {
  const { code, msg, details, act } = errorMsg;

  // Formato especial para errores de autenticación
  if (act === "AUTH") {
    return formatAuthError(code, msg);
  }

  // Detectar errores de comandos no permitidos específicamente para OS_CMD
  const isCommandNotAllowed =
    act === "OS_CMD" &&
    code === "BAD_REQUEST" &&
    details &&
    Array.isArray(details) &&
    details.some(
      (detail) =>
        typeof detail === "string" &&
        detail.includes("must be equal to one of the allowed values")
    );

  if (isCommandNotAllowed) {
    let output = `\n${colorize("=".repeat(50), "red")}`;
    output += `\n${colorize("COMANDO NO PERMITIDO", "bold")}`;
    output += `\n${colorize("=".repeat(50), "red")}`;
    output += `\n\n${colorize(
      "El comando solicitado no está permitido por las políticas de seguridad del servidor",
      "brightRed"
    )}`;
    output += `\n\n${colorize(
      "Para más información sobre comandos disponibles:",
      "yellow"
    )}`;
    output += `\n  Contacte al administrador del sistema`;
    output += `\n${colorize("=".repeat(50), "red")}`;
    return output;
  }

  let output = `\n${colorize("=".repeat(50), "red")}`;
  output += `\n${colorize("ERROR DEL SERVIDOR", "bold")}`;
  output += `\n${colorize("=".repeat(50), "red")}`;

  if (act) {
    output += `\n  Comando: ${colorize(act, "brightRed")}`;
  }

  output += `\n  Código: ${colorize(code || "UNKNOWN", "red")}`;
  output += `\n  Mensaje: ${colorize(msg || "Error desconocido", "brightRed")}`;

  if (details && !isCommandNotAllowed) {
    output += `\n  Detalles: ${colorize(
      JSON.stringify(details, null, 2),
      "yellow"
    )}`;
  }

  // Sugerencias basadas en el código de error
  const suggestions = {
    BAD_REQUEST: "Verifique la sintaxis del comando y sus parámetros",
    UNAUTHORIZED: "Necesita autenticación válida",
    FORBIDDEN: "No tiene permisos suficientes para esta operación",
    UNKNOWN_ACTION: "El comando no existe o no está disponible",
    RATE_LIMITED: "Demasiadas solicitudes, espere un momento",
    CMD_NOT_ALLOWED:
      "El comando no está permitido por las políticas de seguridad",
    BIN_NOT_FOUND: "El ejecutable no fue encontrado en el sistema remoto",
    INVALID_REGEX: "La expresión regular proporcionada no es válida",
    CONNECTION: "Problema de conectividad con el servidor",
  };

  if (suggestions[code]) {
    output += `\n  Sugerencia: ${colorize(suggestions[code], "cyan")}`;
  }

  output += `\n${colorize("=".repeat(50), "red")}`;

  return output;
}

function formatAuthError(code, message) {
  let output = `\n${colorize("=".repeat(50), "red")}`;
  output += `\n${colorize("ERROR DE AUTENTICACIÓN", "bold")}`;
  output += `\n${colorize("=".repeat(50), "red")}`;

  // Mensajes específicos para errores de autenticación
  switch (code) {
    case "TOKEN_EXPIRED":
      output += `\n\n${colorize(
        "Su token de acceso ha expirado",
        "brightRed"
      )}`;
      output += `\n\n${colorize("Soluciones:", "cyan")}`;
      output += `\n  * Solicite un nuevo token al administrador`;
      output += `\n  * Verifique que está usando el token más reciente`;
      break;
    case "INVALID_TOKEN":
      output += `\n\n${colorize(
        "El token proporcionado no es válido",
        "brightRed"
      )}`;
      output += `\n\n${colorize("Soluciones:", "cyan")}`;
      output += `\n  * Verifique que copió el token completo`;
      output += `\n  * Asegúrese de no incluir espacios extra`;
      output += `\n  * Contacte al administrador para un nuevo token`;
      break;
    case "UNAUTHORIZED":
      output += `\n\n${colorize("Acceso no autorizado", "brightRed")}`;
      output += `\n\n${colorize("Soluciones:", "cyan")}`;
      output += `\n  * Verifique que tiene permisos para acceder`;
      output += `\n  * Contacte al administrador del sistema`;
      break;
    default:
      output += `\n\n${colorize(
        message || "Error de autenticación desconocido",
        "brightRed"
      )}`;
      output += `\n  ${colorize(`Código: ${code}`, "yellow")}`;
      break;
  }

  output += `\n\n${colorize(
    "El cliente se cerrará automáticamente...",
    "dim"
  )}`;
  output += `\n${colorize("=".repeat(50), "red")}`;

  return output;
}

/**
 * Función principal de formateo
 */
export function formatResponse(message) {
  const { act, data, ok } = message;

  if (ok === false) {
    return formatError(message);
  }

  if (!data) {
    return `${ICONS.info} ${colorize("Respuesta sin datos", "dim")}`;
  }

  // Formatear según el tipo de comando
  switch (act) {
    case "GET_OS_INFO":
      return formatGetOsInfo(data);
    case "PS":
      return formatPs(data);
    case "WATCH":
      return formatWatch(data);
    case "GET_WATCHES":
      return formatGetWatches(data);
    case "OS_CMD":
      return formatOsCmd(data);
    case "QUIT":
      return formatQuit(data);
    default:
      // Formato genérico para comandos no reconocidos
      let output = createHeader(
        `RESPUESTA: ${act || "DESCONOCIDO"}`,
        ICONS.info
      );
      output += `\n${colorize(JSON.stringify(data, null, 2), "white")}`;
      return output;
  }
}

/**
 * Formatear información de latencia de la respuesta
 */
export function formatLatencyInfo(message) {
  const { meta } = message;
  if (!meta || typeof meta.latencyMs !== "number") return "";

  const latency = meta.latencyMs;
  const latencyColor =
    latency < 100 ? "green" : latency < 500 ? "yellow" : "red";
  const serverTime = meta.serverTs ? formatTimestamp(meta.serverTs) : "N/A";

  return `\n${colorize(
    `Latencia: ${latency}ms | ${ICONS.time} Servidor: ${serverTime}`,
    latencyColor
  )}`;
}
