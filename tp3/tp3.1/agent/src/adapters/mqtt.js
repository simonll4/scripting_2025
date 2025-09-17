import mqtt from "mqtt";
import { logger } from "../utils/logger.js";

export async function connectWithFallback({
  url,
  username,
  password,
  keepalive,
  clean,
  will,
  agentName, // Add agentName parameter with default
}) {
  // Intento MQTT v5 primero
  const tryConnect = (protocolVersion) =>
    new Promise((resolve, reject) => {
      const clientId = `agent-${agentName}-${Math.random()
        .toString(16)
        .slice(2)}`;

      const c = mqtt.connect(url, {
        protocolVersion,
        clean,
        keepalive,
        clientId,
        username,
        password,
        properties:
          protocolVersion === 5
            ? {
                sessionExpiryInterval: 0,
              }
            : undefined,
        ...will,
      });
      c.once("connect", (pkt) => {
        logger.info("connected", {
          mqtt_version: protocolVersion === 5 ? "5" : "3.1.1",
          clientId,
          sessionPresent: pkt?.sessionPresent,
        });
        resolve({ client: c, isV5: protocolVersion === 5, connack: pkt });
      });
      c.once("error", (err) => {
        c.end(true, () => reject(err));
      });
    });

  try {
    const v5 = await tryConnect(5);
    return v5;
  } catch (e) {
    logger.warn("connect_v5_failed", { message: e?.message });
  }

  // Fallback a MQTT 3.1.1 (protocolLevel 4)
  try {
    const v4 = await tryConnect(4);
    return v4;
  } catch (e) {
    // Error definitivo de conexión
    logger.error("connect_failed", {
      url,
      username,
      message: e?.message,
    });
    throw e;
  }
}
