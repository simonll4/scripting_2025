import { loadAgentConfig } from "../config/index.js";
import { connectWithFallback } from "../adapters/mqtt.js";
import { logger } from "../utils/logger.js";
import { sendResponse } from "../messaging/reply.js";
import { parseIncoming } from "./parser.js";
import {
  validateBaseRequest,
  routeAndExecute,
} from "../features/commands/index.js";
import { setupPresence } from "../features/presence/index.js";

export async function start() {
  const cfg = loadAgentConfig();
  logger.configure(cfg.logging);

  const agentName = cfg.agent.name;
  const requestPattern = `${cfg.topics.request_base}/+`;

  // Setup presence management
  const { lwtConfig, createManager } = setupPresence(cfg, agentName);

  const { client, isV5 } = await connectWithFallback({
    url: cfg.mqtt.url,
    username: cfg.mqtt.username,
    password: cfg.mqtt.password,
    keepalive: cfg.agent.keepalive,
    clean: cfg.agent.clean_start,
    agentName,
    ...lwtConfig, // Include Last Will and Testament for offline detection
  });

  // Create presence manager with the connected client
  const presenceManager = createManager(client);

  // Start heartbeat immediately after connection
  presenceManager.startHeartbeat();

  client.on("connect", () => {
    logger.info("mqtt_connect", { agent: agentName });
    presenceManager.startHeartbeat();
  });
  client.on("reconnect", () => {
    logger.info("mqtt_reconnect", { agent: agentName });
    presenceManager.startHeartbeat();
  });
  client.on("offline", () => {
    logger.warn("mqtt_offline", { agent: agentName });
    presenceManager.stopHeartbeat();
  });
  client.on("close", () => {
    logger.info("mqtt_close", { agent: agentName });
    presenceManager.stopHeartbeat();
  });

  await new Promise((res, rej) =>
    client.subscribe(requestPattern, { qos: cfg.agent.qos }, (err) =>
      err ? rej(err) : res()
    )
  );
  logger.info("subscribed", { topic: requestPattern });

  client.on("message", async (topic, message, packet) => {
    const t0 = Date.now();
    try {
      const req = parseIncoming({ topic, message, packet, isV5 });
      if (!req.command) return;
      const reply = sendResponse({
        mqttClient: client,
        isV5,
        agentName,
        req,
        qos: cfg.agent.qos,
      });

      // Validación base (id/args/replyTo)
      if (req.id) {
        const { ok, errors } = validateBaseRequest({
          id: req.id,
          args: req.args,
          replyTo: req.replyTo,
        });
        if (!ok) {
          reply({
            code: "INVALID_REQUEST",
            message: "Bad request",
            errors,
            result: false,
          });
          logger.warn("invalid_request", {
            command: req.command,
            id: req.id,
            errors,
          });
          return;
        }
      }

      // Ruteo + ejecución
      const payload = await routeAndExecute(req.command, req.args);
      reply(payload);

      logger.info("request_processed", {
        agent: agentName,
        command: req.command,
        id: req.id,
        durationMs: Date.now() - t0,
      });
    } catch (e) {
      logger.error("message_handler_error", {
        topic,
        agent: agentName,
        error: e.message,
      });
    }
  });

  logger.info("agent_ready", {
    agent: agentName,
    mqttVersion: isV5 ? "5.0" : "3.1.1",
    presenceEnabled: cfg.presence.enabled,
    heartbeatSeconds: cfg.presence.heartbeat_seconds,
  });

  return {
    client,
    cleanup: () => {
      presenceManager.cleanup();
    },
  };
}

// /**
//  * MQTT Agent - Core Application
//  *
//  * This agent connects to an MQTT broker, announces its presence, and responds
//  * to commands sent by CLP clients. Supports both MQTT v5 and v3.1.1.
//  *
//  * Features:
//  * - Command execution (ls, help)
//  * - Presence management with heartbeat
//  * - Request validation and correlation
//  * - Path traversal protection
//  * - Graceful shutdown handling
//  */

// import mqtt from "mqtt";
// import Ajv from "ajv";
// import { loadAgentConfig } from "../config/index.js";
// import { connectWithFallback } from "../adapters/mqtt.js";
// import { logger } from "../utils/logger.js";
// import { helpCommand, lsCommand } from "../features/commands/index.js";
// import { sendResponse } from "../features/commands/reply.js";

// // Load configuration once and cache values for better performance
// const agentConfig = loadAgentConfig();
// const agentName = agentConfig.agent.name;

// // Topics ya construidos desde la configuración
// const PRESENCE_TOPIC = agentConfig.presence.topic;
// const REQUEST_TOPIC_PATTERN = `${agentConfig.topics.request_base}/+`;
// const RESPONSE_TOPIC_BASE = agentConfig.topics.response_base;

// // Constants for better maintainability
// const ERROR_CODES = {
//   UNKNOWN_COMMAND: "UNKNOWN_COMMAND",
//   INVALID_REQUEST: "INVALID_REQUEST",
//   PATH_NOT_FOUND: "ENOENT",
// };

// const RESPONSE_MESSAGES = {
//   OK: "OK",
//   PATH_NOT_FOUND: "Path not found",
//   UNKNOWN_COMMAND: "Unknown command",
//   BAD_REQUEST: "Bad request",
// };

// // Request validation schema
// const validator = new Ajv();
// const requestSchema = {
//   type: "object",
//   properties: {
//     id: { type: "string" },
//     args: { type: "object" },
//     replyTo: { type: ["string", "null"] },
//   },
//   required: ["id"],
//   additionalProperties: true,
// };
// const validateRequest = validator.compile(requestSchema);

// // Helper functions for better organization
// function createResponseEnvelope(command, id, payload) {
//   return {
//     date: new Date().toISOString(),
//     command,
//     name: agentName,
//     id,
//     payload,
//   };
// }

// function announcePresence(client) {
//   if (!agentConfig.presence.enabled) return;
//   const payload = JSON.stringify({
//     name: agentName,
//     state: "online",
//     ts: new Date().toISOString(),
//     heartbeat_seconds: agentConfig.presence.heartbeat_seconds,
//   });
//   client.publish(PRESENCE_TOPIC, payload, { qos: 1, retain: true });
// }

// // Heartbeat interval for presence
// let heartbeatInterval = null;

// function setupLWT() {
//   if (!agentConfig.presence.enabled) return undefined;
//   const payload = JSON.stringify({
//     name: agentName,
//     state: "offline",
//     ts: new Date().toISOString(),
//     heartbeat_seconds: agentConfig.presence.heartbeat_seconds,
//   });
//   return {
//     will: {
//       topic: PRESENCE_TOPIC,
//       payload,
//       qos: 1,
//       retain: true,
//     },
//   };
// }

// // Optimized message parsing function
// function parseIncoming(topic, message, packet, isV5) {
//   // Extract command from topic: request/commands/{agent}/{command}
//   const command = topic.split("/")[3] || "";

//   let args = {};
//   let replyTo = null;
//   let id = null;

//   // Handle two payload formats: simple string or structured JSON
//   const messageText = message.toString("utf8");
//   if (messageText.length > 0) {
//     const firstChar = messageText[0];
//     if (firstChar === "{") {
//       try {
//         const parsed = JSON.parse(messageText);
//         args = parsed.args || {};
//         replyTo = parsed.replyTo || null;
//         id = parsed.id || null;
//       } catch (error) {
//         logger.debug("json_parse_failed", { topic, error: error.message });
//       }
//     } else {
//       // Simple string format for backward compatibility (e.g., ls /some/path)
//       args = { path: messageText.trim() };
//     }
//   }

//   // Handle MQTT v5 properties more efficiently
//   const v5Props =
//     isV5 && packet?.properties
//       ? {
//           responseTopic: packet.properties.responseTopic,
//           correlationData: packet.properties.correlationData,
//         }
//       : null;

//   // Use correlation data as fallback ID
//   if (isV5 && !id && v5Props?.correlationData) {
//     id = v5Props.correlationData.toString("utf8");
//   }

//   return { command, args, replyTo, id, v5Props, qos: packet?.qos };
// }

// // Helper to validate request structure
// function isValidRequest(request) {
//   if (!request.command || !request.id) return false;

//   const requestObj = {
//     id: request.id,
//     args: request.args,
//     replyTo: request.replyTo,
//   };
//   return validateRequest(requestObj);
// }

// function createResponseSender(mqttClient, isV5, req) {
//   return sendResponse({
//     mqttClient,
//     isV5,
//     agentName,
//     req,
//     qos: agentConfig.agent.qos,
//   });
// }

// export async function start() {
//   try {
//     // Configure logger with settings from TOML config
//     logger.configure(agentConfig.logging);

//     // Connect to MQTT broker with optimized configuration
//     const { client, isV5 } = await connectWithFallback({
//       url: agentConfig.mqtt.url,
//       username: agentConfig.mqtt.username,
//       password: agentConfig.mqtt.password,
//       keepalive: agentConfig.agent.keepalive,
//       clean: agentConfig.agent.clean_start,
//       agentName: agentName, // Pass the agent name from configuration
//       ...setupLWT(),
//     });

//     // Connection event listeners for robust presence management
//     client.on("connect", () => {
//       logger.info("mqtt_connect", { agent: agentName });
//       announcePresence(client);
//     });

//     client.on("reconnect", () => {
//       logger.info("mqtt_reconnect", { agent: agentName });
//       announcePresence(client);
//     });

//     client.on("offline", () => {
//       logger.warn("mqtt_offline", { agent: agentName });
//     });

//     client.on("close", () => {
//       logger.info("mqtt_close", { agent: agentName });
//     });

//     // Announce presence (retained message)
//     announcePresence(client);

//     // Setup heartbeat if configured
//     if (
//       agentConfig.presence.enabled &&
//       agentConfig.presence.heartbeat_seconds > 0
//     ) {
//       heartbeatInterval = setInterval(() => {
//         announcePresence(client);
//       }, agentConfig.presence.heartbeat_seconds * 1000);
//     }

//     // Subscribe to agent requests
//     client.subscribe(
//       REQUEST_TOPIC_PATTERN,
//       { qos: agentConfig.agent.qos },
//       (err) => {
//         if (err) {
//           logger.error("subscribe_error", {
//             topic: REQUEST_TOPIC_PATTERN,
//             message: err?.message,
//           });
//           process.exit(1);
//         }
//         logger.info("subscribed", { topic: REQUEST_TOPIC_PATTERN });
//       }
//     );

//     // Optimized message handler for better performance
//     client.on("message", async (topic, message, packet) => {
//       const startTime = Date.now();

//       try {
//         const request = parseIncoming(topic, message, packet, isV5);

//         // Early validation - skip processing if no command
//         if (!request.command) {
//           logger.warn("empty_command", { topic, agent: agentName });
//           return;
//         }

//         // Create response sender
//         const sendResponse = createResponseSender(client, isV5, request);

//         // Validate request structure if has ID
//         if (request.id && !isValidRequest(request)) {
//           sendResponse({
//             code: ERROR_CODES.INVALID_REQUEST,
//             message: RESPONSE_MESSAGES.BAD_REQUEST,
//             result: false,
//           });
//           logger.warn("invalid_request", {
//             agent: agentName,
//             command: request.command,
//             id: request.id,
//             errors: validateRequest.errors,
//           });
//           return;
//         }

//         // Execute command using optimized switch
//         let result;
//         switch (request.command) {
//           case "help": {
//             result = helpCommand(agentName);
//             break;
//           }
//           case "ls": {
//             result = await lsCommand(request.args?.path);
//             break;
//           }
//           default: {
//             result = {
//               code: ERROR_CODES.UNKNOWN_COMMAND,
//               message: RESPONSE_MESSAGES.UNKNOWN_COMMAND,
//               result: false,
//             };
//             break;
//           }
//         }

//         // Send response
//         sendResponse(result);

//         // Log performance metrics
//         const duration = Date.now() - startTime;
//         logger.info("request_processed", {
//           agent: agentName,
//           command: request.command,
//           id: request.id,
//           durationMs: duration,
//         });
//       } catch (error) {
//         logger.error("message_handler_error", {
//           topic,
//           agent: agentName,
//           error: error.message,
//         });
//       }
//     });

//     logger.info("agent_ready", {
//       agent: agentName,
//       mqttVersion: isV5 ? "5.0" : "3.1.1",
//       presenceEnabled: agentConfig.presence.enabled,
//     });

//     // Return cleanup functions for graceful shutdown
//     return {
//       client,
//       cleanup: () => {
//         if (heartbeatInterval) {
//           clearInterval(heartbeatInterval);
//           heartbeatInterval = null;
//         }
//       },
//     };
//   } catch (error) {
//     logger.error("startup_failed", {
//       agent: agentName,
//       error: error.message,
//       stack: error.stack,
//     });
//     throw error; // Let index.js handle the exit
//   }
// }
