/**
 * CLP (Command Line Protocol) Client - Core Application
 *
 * Interactive command line interface that connects to MQTT agents and allows
 * users to execute remote commands. Supports both MQTT v5 and v3.1.1.
 *
 * Features:
 * - Interactive command prompt
 * - Request correlation to prevent cross-talk
 * - Command line parameter override
 * - Graceful connection handling
 * - Timeout management
 */

import readline from "node:readline";
import { loadClpConfig } from "../config/index.js";
import { connectWithFallback } from "../adapters/mqtt.js";
import { buildInboxTopic, buildV5InboxTopic, sendRequest } from "../features/requests/index.js";
import { logger } from "../utils/logger.js";
import {
  success,
  error,
  warning,
  info,
  header,
  highlight,
  formatFileItem,
  formatCommand,
  formatAgentInfo,
  formatPrompt,
} from "../utils/colors.js";

// Helper function to execute commands with consistent error handling
async function executeCommand(command, args, requestConfig) {
  try {
    return await sendRequest({ ...requestConfig, command, args });
  } catch (error) {
    throw new Error(`Command '${command}' failed: ${error.message}`);
  }
}

// Function to check if agent is online via presence system
async function checkAgentPresence(client, agentName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const presenceTopic = `presence/agents/${agentName}`;
    let isResolved = false;

    // Set timeout for presence check
    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        client.unsubscribe(presenceTopic, () => {});
        resolve({ online: false, reason: "timeout" });
      }
    }, timeoutMs);

    // Message handler for presence topic
    const presenceHandler = (topic, message) => {
      if (topic === presenceTopic && !isResolved) {
        isResolved = true;
        clearTimeout(timeout);

        try {
          const presence = JSON.parse(message.toString());
          const now = new Date();
          const lastSeen = new Date(presence.ts);
          const ageMs = now - lastSeen;

          // Calculate dynamic maxAge based on agent's heartbeat configuration
          // Use 3x heartbeat_seconds as threshold, with fallback to 90s
          const heartbeatSeconds = presence.heartbeat_seconds || 30;
          const maxAgeMs = heartbeatSeconds * 3 * 1000; // 3x heartbeat in milliseconds

          // Check if presence is recent enough and state is online
          const isRecent = ageMs <= maxAgeMs;
          const isOnline = presence.state === "online" && isRecent;

          let reason;
          if (presence.state !== "online") {
            reason = "agent_offline";
          } else if (!isRecent) {
            reason = "heartbeat_expired";
          } else {
            reason = "online";
          }

          client.unsubscribe(presenceTopic, () => {});
          resolve({
            online: isOnline,
            presence,
            reason,
            ageMs,
            maxAgeMs,
          });
        } catch (parseError) {
          client.unsubscribe(presenceTopic, () => {});
          resolve({ online: false, reason: "invalid_presence_data" });
        }
      }
    };

    // Subscribe to presence topic and set message handler
    client.subscribe(presenceTopic, { qos: 1 }, (err) => {
      if (err) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          reject(
            new Error(`Failed to subscribe to presence topic: ${err.message}`)
          );
        }
        return;
      }

      // Set temporary message handler for presence check
      client.on("message", presenceHandler);
    });
  });
}

// Command handlers for better organization
const COMMAND_HANDLERS = {
  help: async (_, requestConfig) => {
    const response = await executeCommand("help", {}, requestConfig);
    const commands = response?.payload?.result || [];

    console.log(header("\nComandos disponibles:"));
    commands.forEach((cmd) =>
      console.log(formatCommand(cmd.command, cmd.description))
    );
    console.log(formatCommand("quit", "salir del cliente"));
    console.log(); // Empty line for better spacing
  },

  ls: async (path, requestConfig) => {
    const response = await executeCommand("ls", { path }, requestConfig);
    const payload = response?.payload;

    if (payload?.result === false) {
      console.log(error(payload?.message || "Error al listar directorio"));
    } else if (Array.isArray(payload?.result)) {
      if (payload.result.length === 0) {
        console.log(warning("El directorio está vacío"));
      } else {
        console.log(header(`\nContenido de: ${highlight(path || "./")}`));
        payload.result.forEach((item) => {
          console.log(formatFileItem(item));
        });
        console.log(); // Empty line for better spacing
      }
    } else {
      console.log(error("Respuesta inesperada"));
    }
  },
};

export async function start() {
  const argv = process.argv.slice(2);
  const clpConfig = loadClpConfig(argv);
  const agentName = clpConfig.clp.agent;

  // Configure logger with settings from TOML config
  logger.configure(clpConfig.logging);

  // Connect to MQTT broker with optimized configuration
  const { client, isV5 } = await connectWithFallback({
    url: clpConfig.mqtt.url,
    username: clpConfig.mqtt.username,
    password: clpConfig.mqtt.password,
    keepalive: clpConfig.clp.keepalive,
    clean: clpConfig.clp.clean_start,
  });

  const clientId = client.options.clientId;
  
  // Configure logger with client-specific file path
  logger.setClientId(clientId);
  
  // Use appropriate inbox topic based on MQTT version
  const inboxTopic = isV5 
    ? buildV5InboxTopic(agentName, clientId, clpConfig.topics.response_base)
    : buildInboxTopic(agentName, clientId, clpConfig.topics.response_base);

  // Display connection info with enhanced formatting
  console.log(formatAgentInfo(agentName, isV5 ? 5 : "3.1.1", clientId));

  // Check if target agent is online before proceeding
  console.log(info(`Verificando si el agente "${agentName}" está online...`));

  try {
    const presenceResult = await checkAgentPresence(
      client,
      agentName,
      clpConfig.clp.timeout_ms
    );

    if (!presenceResult.online) {
      console.log(error(`El agente "${agentName}" no está disponible.`));

      // Provide detailed reason for unavailability
      switch (presenceResult.reason) {
        case "timeout":
          console.log(
            warning(
              `   Razón: No se recibió respuesta de presence en ${clpConfig.clp.timeout_ms}ms`
            )
          );
          break;
        case "agent_offline":
          console.log(warning(`   Razón: El agente reporta estado "offline"`));
          break;
        case "heartbeat_expired":
          const ageSeconds = Math.round(presenceResult.ageMs / 1000);
          const maxAgeSeconds = Math.round(presenceResult.maxAgeMs / 1000);
          console.log(
            warning(
              `   Razón: Heartbeat expirado (${ageSeconds}s > ${maxAgeSeconds}s)`
            )
          );
          if (presenceResult.presence?.ts) {
            console.log(
              info(
                `   Último heartbeat: ${new Date(
                  presenceResult.presence.ts
                ).toLocaleString()}`
              )
            );
          }
          break;
        case "invalid_presence_data":
          console.log(warning(`   Razón: Datos de presence inválidos`));
          break;
        default:
          console.log(warning(`   Razón: ${presenceResult.reason}`));
      }

      console.log(
        info(
          `   Asegúrate de que el agente esté ejecutándose y configurado correctamente.`
        )
      );

      client.end(true, () => {
        logger.error("agent_not_available", {
          agent: agentName,
          reason: presenceResult.reason,
          ageMs: presenceResult.ageMs,
          maxAgeMs: presenceResult.maxAgeMs,
        });
        process.exit(1);
      });
      return;
    }

    console.log(success(`Agente "${agentName}" está online`));
    if (presenceResult.presence?.ts) {
      const ageSeconds = Math.round(presenceResult.ageMs / 1000);
      const heartbeatSeconds = presenceResult.presence.heartbeat_seconds || 30;
      console.log(
        info(
          `   Último heartbeat: ${new Date(
            presenceResult.presence.ts
          ).toLocaleString()} (hace ${ageSeconds}s)`
        )
      );
      console.log(
        info(
          `   Intervalo de heartbeat: ${heartbeatSeconds}s (expira en ${Math.round(
            presenceResult.maxAgeMs / 1000
          )}s)`
        )
      );
    }
  } catch (presenceError) {
    console.log(
      error(`Error verificando presence del agente: ${presenceError.message}`)
    );
    client.end(true, () => {
      logger.error("presence_check_failed", {
        agent: agentName,
        error: presenceError.message,
      });
      process.exit(1);
    });
    return;
  }

  // Subscribe to inbox topic after confirming agent is online
  client.subscribe(inboxTopic, { qos: clpConfig.clp.qos }, (err) => {
    if (err) {
      logger.error("subscribe_error", {
        topic: inboxTopic,
        message: err?.message,
      });
      process.exit(1);
    }
    logger.info("subscribed", { topic: inboxTopic });
  });

  // Pre-configure request parameters for better performance
  const requestConfig = {
    client,
    isV5,
    qos: clpConfig.clp.qos,
    agent: agentName,
    clientId,
    timeoutMs: clpConfig.clp.timeout_ms,
    requestBase: clpConfig.topics.request_base,
    responseBase: clpConfig.topics.response_base,
  };

  client.on("message", () => {}); // Message listener is set by individual requests

  // Get available commands on startup with enhanced formatting
  try {
    await COMMAND_HANDLERS.help("", requestConfig);
  } catch (error) {
    console.log(error(`No se pudo obtener help: ${error.message}`));
  }

  // Interactive prompt setup with custom prompt format
  const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: formatPrompt(agentName),
  });
  readlineInterface.prompt();

  // Optimized command line handler
  readlineInterface.on("line", async (line) => {
    const input = line.trim();
    if (!input) return readlineInterface.prompt();

    if (input === "quit" || input === "exit") {
      readlineInterface.close();
      return;
    }

    const [command, ...args] = input.split(/\s+/);
    const argument = args.join(" ");

    try {
      const handler = COMMAND_HANDLERS[command];
      if (handler) {
        await handler(argument, requestConfig);
      } else {
        console.log(warning(`Comando no reconocido: "${command}"`));
        console.log(info('Usa "help" para ver comandos disponibles'));
      }
    } catch (err) {
      console.log(error(`Error: ${err.message}`));
    }

    readlineInterface.prompt();
  });

  // Clean shutdown handler with enhanced formatting
  readlineInterface.on("close", () => {
    console.log(success("\n¡Hasta luego!"));
    client.end(true, () => {
      logger.info("clp_shutdown", { agent: agentName });
    });
  });

  // Return client and cleanup functions for graceful shutdown
  return {
    client,
    agentName,
    cleanup: () => {
      if (readlineInterface) {
        readlineInterface.close();
      }
    },
  };
}
