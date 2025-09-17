import { logger } from "../../utils/logger.js";

// Topic builder functions using direct topic construction
export function buildInboxTopic(agent, clientId, responseBase) {
  return `${responseBase}/+/${clientId}`;
}

// For MQTT v5, we use a simpler inbox topic pattern
export function buildV5InboxTopic(agent, clientId, responseBase) {
  return `${responseBase}/${agent}/${clientId}`;
}

export function buildReplyTo(agent, command, clientId, responseBase) {
  return `${responseBase}/${command}/${clientId}`;
}

// For MQTT v5, we can use a simpler response topic since correlation is done via correlationData
export function buildV5ResponseTopic(agent, clientId, responseBase) {
  return `${responseBase}/${agent}/${clientId}`;
}

export function buildRequestTopic(agent, command, requestBase) {
  return `${requestBase}/${command}`;
}

// Helper to generate more efficient request IDs
function generateRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Optimized request sender with better error handling and cleanup
export function sendRequest({
  client,
  isV5,
  qos,
  agent,
  clientId,
  command,
  args,
  timeoutMs,
  requestBase,
  responseBase,
}) {
  return new Promise((resolve, reject) => {
    const id = generateRequestId();
    const requestTopic = buildRequestTopic(agent, command, requestBase);

    // Debug log for request initiation
    logger.debug("request_initiated", {
      id,
      command,
      agent,
      args_count: args ? args.length : 0,
      timeout_ms: timeoutMs,
    });

    let timeoutHandle = null;
    let isResolved = false;

    // Cleanup function to prevent memory leaks
    function cleanup() {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (client && client.removeListener) {
        client.removeListener("message", handleMessage);
      }
    }

    // Timeout handler
    function handleTimeout() {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      reject(
        new Error(
          `Request timeout after ${timeoutMs}ms (command: ${command}, id: ${id})`
        )
      );
    }

    // Message correlation handler
    function handleMessage(topic, message, packet) {
      if (isResolved) return;

      try {
        // MQTT v5: Use correlation-data for precise matching
        if (isV5) {
          const correlationData = packet?.properties?.correlationData;
          if (correlationData && correlationData.toString("utf8") === id) {
            const responseObj = JSON.parse(message.toString("utf8"));
            logger.debug("response_received", {
              id,
              command,
              correlation_method: "v5_correlation_data",
              topic,
              response: JSON.stringify(responseObj),
            });
            isResolved = true;
            cleanup();
            resolve(responseObj);
            return;
          }
        }

        // MQTT v3.1.1: Use topic pattern and message ID for correlation
        const topicParts = topic.split("/");
        if (topicParts[3] === command) {
          const responseObj = JSON.parse(message.toString("utf8"));
          if (responseObj?.id === id) {
            logger.debug("response_received", {
              id,
              command,
              correlation_method: "v3_topic_and_id",
              topic,
              response: JSON.stringify(responseObj),
            });
            isResolved = true;
            cleanup();
            resolve(responseObj);
          }
        }
      } catch (error) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Response parsing failed: ${error.message}`));
        }
      }
    }

    // Setup timeout
    timeoutHandle = setTimeout(handleTimeout, timeoutMs);

    // Setup message listener - validate client is available
    if (!client) {
      reject(new Error("MQTT client is not available"));
      return;
    }

    client.on("message", handleMessage);

    // Send request with optimized payload
    const payload = { id, args };

    if (isV5) {
      const responseTopic = buildV5ResponseTopic(
        agent,
        clientId,
        responseBase
      );
      client.publish(requestTopic, JSON.stringify(payload), {
        qos,
        properties: {
          responseTopic,
          correlationData: Buffer.from(id, "utf8"),
        },
      });

      logger.info("request_sent", {
        command,
        id,
        agent,
        method: "v5_responseTopic",
        topic: requestTopic,
        response_topic: responseTopic,
        payload: JSON.stringify(payload),
      });
    } else {
      const replyTo = buildReplyTo(agent, command, clientId, responseBase);
      const requestBody = { ...payload, replyTo };
      client.publish(requestTopic, JSON.stringify(requestBody), { qos });

      logger.info("request_sent", {
        command,
        id,
        agent,
        method: "baseline_replyTo",
        topic: requestTopic,
        reply_to: replyTo,
        payload: JSON.stringify(requestBody),
      });
    }
  });
}
