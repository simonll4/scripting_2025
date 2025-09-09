import { execFile } from "child_process";
import { access, realpath } from "fs/promises";
import { constants as FS } from "fs";
import path from "node:path";

import { OS_CMD_POLICY } from "./config.js";
import { SCOPES } from "../../../security/index.js";
import { PROTOCOL } from "../../../../protocol/index.js";

// ========================= Helpers de errores y resultados ===================

/** Crea un error con código de protocolo consistente */
function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Normaliza el resultado de execFile al contrato de salida */
function formatResult({
  ok,
  stdout = "",
  stderr = "",
  exitCode = 0,
  signal = null,
  timedOut = false,
  truncated = false,
}) {
  return {
    ok,
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    signal: signal ?? null,
    timedOut: !!timedOut,
    truncated: !!truncated,
    stdout: String(stdout ?? ""),
    stderr: String(stderr ?? ""),
  };
}

/** Trunca stdout/stderr proporcionalmente si la respuesta supera el límite del protocolo */
function truncateResultIfNeeded(result, maxBytes) {
  const size = (obj) => Buffer.byteLength(JSON.stringify(obj), "utf8");
  if (size(result) <= maxBytes) return result;

  const reserve = Math.floor(maxBytes * 0.9); // margen para llaves/metadata
  const suffix = "\n... [OUTPUT TRUNCATED]";
  let { stdout, stderr } = result;
  let cutOut = stdout.length;
  let cutErr = stderr.length;

  // Recorte proporcional hasta caber
  /* eslint-disable no-constant-condition */
  while (true) {
    const candidate = formatResult({
      ...result,
      stdout: stdout.slice(0, cutOut) + suffix,
      stderr: stderr.slice(0, cutErr) + suffix,
      truncated: true,
    });
    if (size(candidate) <= reserve || (cutOut <= 16 && cutErr <= 16)) {
      return candidate;
    }
    cutOut = Math.max(16, Math.floor(cutOut * 0.7));
    cutErr = Math.max(16, Math.floor(cutErr * 0.7));
  }
  /* eslint-enable no-constant-condition */
}

// ========================= Validaciones de entrada ===========================

/** Valida cmd/timeout básicos */
function validateBaseInput(cmd, timeoutMs) {
  if (!cmd || typeof cmd !== "string") {
    throw fail(PROTOCOL.ERROR_CODES.BAD_REQUEST, "Falta 'cmd' o no es string");
  }
  const { timeoutMsMax } = OS_CMD_POLICY;
  if (
    typeof timeoutMs !== "number" ||
    timeoutMs < 1000 ||
    timeoutMs > timeoutMsMax
  ) {
    throw fail(
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      `timeoutMs inválido (1000..${timeoutMsMax})`
    );
  }
}

/** Valida forma/cotas/caracteres de args usando política global/per-command */
function validateArgsShape(cmdKey, args) {
  const { argRegex, maxArgLen, maxArgs, perCommand } = OS_CMD_POLICY;

  if (!Array.isArray(args)) {
    throw fail(PROTOCOL.ERROR_CODES.BAD_REQUEST, "'args' debe ser un array");
  }
  if (args.length > maxArgs) {
    throw fail(
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      `Demasiados argumentos: ${args.length} > ${maxArgs}`
    );
  }

  const perCmd = perCommand?.[cmdKey];
  const effectiveRegex =
    (perCmd?.argRegex && new RegExp(perCmd.argRegex)) || new RegExp(argRegex);

  for (const a of args) {
    if (typeof a !== "string") {
      throw fail(
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        "Cada argumento debe ser string"
      );
    }
    if (a.length > maxArgLen) {
      throw fail(
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        `Argumento demasiado largo (> ${maxArgLen})`
      );
    }
    if (!effectiveRegex.test(a)) {
      throw fail(
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        "Argumento contiene caracteres no permitidos por la política"
      );
    }
  }
}

// ========================= Flags y saneamiento de paths ======================

const SEP = path.sep;
const withSep = (p) => (p.endsWith(SEP) ? p : p + SEP);
const isFlag = (arg) => arg === "--" || arg.startsWith("-");

function assertPolicyBaseDir() {
  const { baseDir, allowedRoots } = OS_CMD_POLICY;
  if (!baseDir || !Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    throw fail(
      PROTOCOL.ERROR_CODES.SERVER_ERROR,
      "Política inválida: faltan baseDir/allowedRoots"
    );
  }
}

/** Comprueba si un absoluto cae dentro de alguna raíz permitida */
function isInsideAllowedRoots(absPath) {
  const abs = path.normalize(absPath);
  return OS_CMD_POLICY.allowedRoots.some((root) =>
    withSep(abs).startsWith(withSep(path.normalize(root)))
  );
}

/**
 * Resuelve ruta (relativa o absoluta) de forma segura:
 * - Relativas: se resuelven vs baseDir y se normalizan.
 * - Absolutas: se normalizan y deben caer dentro de allowedRoots.
 * - Se intenta realpath() para resolver symlinks si existe; si no, se evalúa el path normalizado.
 * Devuelve SIEMPRE un camino absoluto que el binario recibirá.
 */
async function resolveSafePath(rawPath) {
  const base = OS_CMD_POLICY.baseDir;

  const absCandidate = path.isAbsolute(rawPath)
    ? path.normalize(rawPath)
    : path.resolve(base, rawPath); // colapsa '..' y fija base

  let toCheck = absCandidate;
  try {
    toCheck = await realpath(absCandidate); // resuelve symlinks si existe
  } catch {
    // si no existe, validamos con el normalizado (para comandos que aceptan inexistentes)
  }

  if (!isInsideAllowedRoots(toCheck)) {
    throw fail(
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      "Ruta fuera de la base permitida"
    );
  }
  return absCandidate;
}

/**
 * Construye los argumentos finales para el binario:
 * - Permite sólo flags en allowFlags; rechaza flags no permitidas.
 * - Flags en flagsWithValue consumen el siguiente argumento como valor (no ruta).
 * - No flags (o post '--'): argumento tratado como ruta y pasado por resolveSafePath().
 */
async function buildFinalArgs(cmdKey, args) {
  const per = OS_CMD_POLICY.perCommand?.[cmdKey] || {};
  const allowFlags = new Set(per.allowFlags || []);
  const flagsWithValue = new Set(per.flagsWithValue || []);

  const out = [];
  let endOfFlags = false;
  let pendingValueFor = null;

  for (const arg of args) {
    if (pendingValueFor) {
      out.push(arg); // valor consumido por la flag previa
      pendingValueFor = null;
      continue;
    }

    if (!endOfFlags && arg === "--") {
      out.push(arg);
      endOfFlags = true;
      continue;
    }

    if (!endOfFlags && isFlag(arg)) {
      if (!allowFlags.has(arg)) {
        throw fail(
          PROTOCOL.ERROR_CODES.BAD_REQUEST,
          `Flag no permitida: ${arg}`
        );
      }
      out.push(arg);
      if (flagsWithValue.has(arg)) {
        pendingValueFor = arg; // la próxima posición es valor literal (no path)
      }
      continue;
    }

    // Ruta (o argumentos post '--'): deben quedar dentro de allowedRoots
    const safeAbs = await resolveSafePath(arg);
    out.push(safeAbs);
  }

  return out;
}

// ========================= Ejecución del comando =============================

async function ensureExecutable(bin) {
  try {
    await access(bin, FS.X_OK);
  } catch {
    throw fail(
      PROTOCOL.ERROR_CODES.BIN_NOT_FOUND,
      `Binario no ejecutable: ${bin}`
    );
  }
}

async function runExecFile(bin, args, timeoutMs) {
  const maxBuffer = 1024 * 1024; // 1 MiB por canal
  return await new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        cwd: OS_CMD_POLICY.baseDir, // ls sin args lista baseDir; rutas relativas parten de aquí
        shell: false,
        timeout: timeoutMs,
        maxBuffer,
      },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut = error.killed === true && error.signal === "SIGTERM";
          const exitCode = typeof error.code === "number" ? error.code : null;
          const signal = error.signal ?? null;

          return resolve(
            formatResult({
              ok: false,
              exitCode,
              signal,
              timedOut,
              stdout,
              stderr: stderr || error.message || "",
            })
          );
        }
        return resolve(
          formatResult({
            ok: true,
            exitCode: 0,
            timedOut: false,
            stdout,
            stderr,
          })
        );
      }
    );
  });
}

// ========================= Handler público ===================================

export default {
  scope: SCOPES.OS_CMD,
  closeAfter: false,

  async handler({ data }) {
    // 0) Extraer parámetros con defaults
    const {
      cmd,
      args = [],
      timeoutMs = OS_CMD_POLICY.timeoutMsDefault,
    } = data ?? {};

    // 1) Validaciones de entrada y política
    validateBaseInput(cmd, timeoutMs);
    assertPolicyBaseDir();

    // 2) Whitelist de binarios
    const bin = OS_CMD_POLICY.binaries[cmd];
    if (!bin) {
      throw fail(
        PROTOCOL.ERROR_CODES.CMD_NOT_ALLOWED,
        `Comando no permitido: '${cmd}'`
      );
    }

    // 3) Validación de shape/caracteres de args (rápida y global)
    validateArgsShape(cmd, args);

    // 4) Verificar que el binario exista y sea ejecutable
    await ensureExecutable(bin);

    // 5) Construir args finales (flags permitidas + rutas saneadas)
    const finalArgs = await buildFinalArgs(cmd, args);

    // 6) Ejecutar de forma segura (sin shell) con límites y cwd fijo
    const result = await runExecFile(bin, finalArgs, timeoutMs);

    // 7) Aplicar límite de payload del protocolo (truncado si hace falta)
    return truncateResultIfNeeded(result, PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES);
  },
};
