import { logger } from "../utils/logger.js";

export function sendResponse({ mqttClient, isV5, agentName, req, qos }) {
  const { command, id, replyTo, v5Props } = req;

  // Pre-build envelope for better performance
  const createEnvelope = (payload) => ({
    date: new Date().toISOString(),
    command,
    name: agentName,
    id,
    payload,
  });

  return async (payload) => {
    try {
      const envelope = createEnvelope(payload);
      const envelopeString = JSON.stringify(envelope);

      // MQTT v5: Use Response-Topic with Correlation-Data
      if (isV5 && v5Props?.responseTopic) {
        mqttClient.publish(v5Props.responseTopic, envelopeString, {
          qos,
          properties: {
            correlationData: v5Props?.correlationData,
          },
        });

        logger.info("response_sent", {
          command,
          method: "v5_responseTopic",
          id,
          agent: agentName,
        });
        return;
      }

      // MQTT v3.1.1: Use replyTo from payload
      if (replyTo) {
        mqttClient.publish(replyTo, envelopeString, { qos });

        logger.info("response_sent", {
          command,
          method: "baseline_replyTo",
          id,
          agent: agentName,
        });
        return;
      }

      // No destination available - log error
      logger.error("response_no_destination", {
        command,
        id,
        agent: agentName,
        message: "No response destination available",
      });
    } catch (error) {
      logger.error("response_error", {
        command,
        id,
        agent: agentName,
        error: error.message,
      });
    }
  };
}
