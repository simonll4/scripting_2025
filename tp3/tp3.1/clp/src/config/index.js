import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import toml from "toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");

/**
 * Reads and parses a TOML configuration file
 * @param {string} filePath - Path to the TOML file
 * @returns {object} Parsed configuration object
 */
function readTomlConfig(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return toml.parse(content);
  } catch (error) {
    throw new Error(`Error reading TOML configuration: ${error.message}`);
  }
}

/**
 * Parses command line arguments into a structured object
 * @param {string[]} argv - Command line arguments
 * @returns {object} Parsed arguments
 */
function parseCommandLineArgs(argv) {
  // Show help if requested
  if (argv.includes("--help")) {
    console.log("Uso: node clp/src/index.js [opciones]");
    console.log("Opciones:");
    console.log("  -h <host>     Host MQTT (default: desde TOML)");
    console.log("  -p <port>     Puerto MQTT (default: 1883)");
    console.log("  -u <user>     Usuario MQTT (default: desde TOML)");
    console.log("  -P <pass>     Password MQTT (default: desde TOML)");
    console.log("  -a <agent>    Nombre del agente (default: desde TOML)");
    console.log("  --help        Mostrar esta ayuda");
    process.exit(0);
  }

  const parsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];

    switch (flag) {
      case "-h":
        parsedArgs.host = value;
        i++; // Skip the value in next iteration
        break;
      case "-p":
        parsedArgs.port = parseInt(value, 10) || 1883;
        i++;
        break;
      case "-u":
        parsedArgs.user = value;
        i++;
        break;
      case "-P":
        parsedArgs.pass = value;
        i++;
        break;
      case "-a":
        parsedArgs.agent = value;
        i++;
        break;
    }
  }

  return parsedArgs;
}

/**
 * Builds MQTT URL based on parameters and TOML configuration
 * @param {object} args - Command line arguments
 * @param {object} tomlConfig - TOML configuration
 * @returns {string} Complete MQTT URL
 */
function buildMqttUrl(args, tomlConfig) {
  // Priority: command line parameters > TOML > default
  if (args.host) {
    const port = args.port || 1883;
    return `mqtt://${args.host}:${port}`;
  }

  return tomlConfig.mqtt?.url || "mqtt://localhost:1883";
}

/**
 * Validates that the configuration has required fields
 * @param {object} config - Configuration to validate
 * @throws {Error} If any required field is missing
 */
function validateConfig(config) {
  const required = {
    "clp.agent": config?.clp?.agent,
    "mqtt.url": config?.mqtt?.url,
  };

  for (const [field, value] of Object.entries(required)) {
    if (!value) {
      throw new Error(`Required configuration field missing: ${field}`);
    }
  }
}

/**
 * Loads CLP configuration prioritizing command line parameters over TOML
 * @param {string[]} argv - Command line arguments
 * @returns {object} Complete CLP configuration
 * @throws {Error} If configuration cannot be loaded or validated
 */
export function loadClpConfig(argv) {
  const configPath = path.join(ROOT, "clp.toml");

  // Check if TOML file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const tomlConfig = readTomlConfig(configPath);
  const args = parseCommandLineArgs(argv);

  // Build configuration with priority: parameters > TOML > defaults
  const agentTarget = args.agent || tomlConfig.clp?.agent_target || "mqttAgent";
  const config = {
    clp: {
      agent: agentTarget,
      qos: tomlConfig.clp?.qos ?? 1,
      keepalive: tomlConfig.clp?.keepalive ?? 30,
      clean_start: tomlConfig.clp?.clean_start ?? true,
      timeout_ms: tomlConfig.clp?.timeout_ms ?? 5000,
    },
    logging: {
      debug: tomlConfig.logging?.debug ?? false,
      level: tomlConfig.logging?.level || "info",
      output: tomlConfig.logging?.output || "file",
      file_path: tomlConfig.logging?.file_path || "./logs/clp.log",
    },
    mqtt: {
      url: buildMqttUrl(args, tomlConfig),
      username: args.user || tomlConfig.mqtt?.username || "",
      password: args.pass || tomlConfig.mqtt?.password || "",
    },
    topics: {
      request_base: `${
        tomlConfig.topics?.request_base || "request/commands"
      }/${agentTarget}`,
      response_base: `${
        tomlConfig.topics?.response_base || "response/commands"
      }/${agentTarget}`,
    },
  };

  // Validate configuration
  validateConfig(config);

  return config;
}
