import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import toml from "toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");

/**
 * Lee y parsea un archivo TOML
 * @param {string} filePath - Ruta al archivo TOML
 * @returns {object} Configuración parseada o objeto vacío si hay error
 */
function readTomlConfig(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return toml.parse(content);
  } catch (error) {
    throw new Error(`Error leyendo configuración TOML: ${error.message}`);
  }
}

/**
 * Valida que la configuración tenga los campos requeridos
 * @param {object} config - Configuración a validar
 * @throws {Error} Si falta algún campo requerido
 */
function validateConfig(config) {
  const required = {
    "agent.name": config?.agent?.name,
    "mqtt.url": config?.mqtt?.url,
  };

  for (const [field, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`Campo requerido faltante en configuración: ${field}`);
    }
  }
}

/**
 * Carga la configuración del agente desde el archivo TOML
 * @returns {object} Configuración completa del agente
 * @throws {Error} Si no se puede cargar o validar la configuración
 */
export function loadAgentConfig() {
  const configPath = path.join(ROOT, "agent.toml");

  // Verificar que el archivo existe
  if (!fs.existsSync(configPath)) {
    throw new Error(`Archivo de configuración no encontrado: ${configPath}`);
  }

  const tomlConfig = readTomlConfig(configPath);
  const agentName = tomlConfig.agent?.name || "mqttAgent";

  // Construir configuración con valores por defecto
  const config = {
    agent: {
      name: agentName,
      qos: tomlConfig.agent?.qos ?? 1,
      keepalive: tomlConfig.agent?.keepalive ?? 30,
      clean_start: tomlConfig.agent?.clean_start ?? true,
      root_dir: tomlConfig.agent?.root_dir || homedir(),
    },
    logging: {
      debug: tomlConfig.logging?.debug ?? false,
      level: tomlConfig.logging?.level || "info",
      output: tomlConfig.logging?.output || "both",
      file_path: tomlConfig.logging?.file_path || "../logs/agent.log",
    },
    mqtt: {
      url: tomlConfig.mqtt?.url || "mqtt://localhost:1883",
      username: tomlConfig.mqtt?.username || "",
      password: tomlConfig.mqtt?.password || "",
    },
    presence: {
      enabled: tomlConfig.presence?.enabled ?? true,
      topic_base: tomlConfig.presence?.topic_base || "presence/agents",
      heartbeat_seconds: tomlConfig.presence?.heartbeat_seconds ?? 30,
    },
    topics: {
      request_base: `${tomlConfig.topics?.request_base || "request/commands"}/${agentName}`,
      response_base: `${tomlConfig.topics?.response_base || "response/commands"}/${agentName}`,
    },
  };

  // Validar configuración
  validateConfig(config);

  return config;
}
