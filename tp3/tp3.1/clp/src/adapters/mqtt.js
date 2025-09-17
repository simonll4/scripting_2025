import mqtt from "mqtt";
import { logger } from "../utils/logger.js";

export async function connectWithFallback({
  url,
  username,
  password,
  keepalive,
  clean,
}) {
  const tryConnect = (protocolVersion) =>
    new Promise((resolve, reject) => {
      const clientId = `clp-${Math.random().toString(16).slice(2)}`;
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
      });
      c.once("connect", (pkt) => {
        logger.info("connected", {
          mqtt_version: protocolVersion === 5 ? "5" : "3.1.1",
          clientId,
          sessionPresent: pkt?.sessionPresent,
        });
        logger.debug("connection_details", {
          clientId,
          protocol_version: protocolVersion,
          url,
          username,
          keepalive,
          clean,
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

  const v4 = await tryConnect(4);
  return v4;
}
