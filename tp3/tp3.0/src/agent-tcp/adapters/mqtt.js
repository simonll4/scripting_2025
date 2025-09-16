/**
 * ============================================================================
 * MQTT ADAPTER
 * ============================================================================
 * Adaptador para conexión y publicación MQTT
 */

import crypto from "crypto";
import mqtt from "mqtt";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("MQTT-ADAPTER");

/**
 * Clase para manejo de conexión MQTT
 */
export class MQTTAdapter {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Conecta al broker MQTT
   */
  async connect() {
    const mqttOptions = {
      clientId: `agent-tcp-${crypto.randomUUID()}`,
      clean: true,
      connectTimeout: 10000,
    };

    if (this.config.MQTT_USER) {
      mqttOptions.username = this.config.MQTT_USER;
      mqttOptions.password = this.config.MQTT_PASS;
    }

    logger.info(`Connecting to MQTT broker: ${this.config.MQTT_URL}`);

    return new Promise((resolve, reject) => {
      try {
        this.client = mqtt.connect(this.config.MQTT_URL, mqttOptions);

        this.client.on("connect", () => {
          this.isConnected = true;
          logger.info("Connected to MQTT broker");
          resolve();
        });

        this.client.on("error", (error) => {
          this.isConnected = false;
          logger.error("MQTT connection error:", error);
          if (!this.client.connected && !this.client.reconnecting) {
            reject(error);
          }
        });

        this.client.on("offline", () => {
          this.isConnected = false;
          logger.warn("MQTT client offline");
        });

        this.client.on("reconnect", () => {
          logger.info("MQTT reconnecting...");
        });

        // Timeout de conexión
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            this.client.end();
            reject(new Error("MQTT connection timeout"));
          }
        }, mqttOptions.connectTimeout);

        this.client.on("connect", () => clearTimeout(timeout));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Publica snapshot a MQTT
   */
  async publishSnapshot(topic, message) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.client.connected) {
        reject(new Error("MQTT client not connected"));
        return;
      }

      const payload = JSON.stringify(message);

      this.client.publish(
        topic,
        payload,
        { qos: 1, retain: false },
        (error) => {
          if (error) {
            logger.error("MQTT publish error:", error);
            reject(error);
          } else {
            logger.debug(
              `Published snapshot to ${topic}, size: ${payload.length} bytes`
            );
            resolve();
          }
        }
      );
    });
  }

  /**
   * Desconecta del broker MQTT
   */
  async disconnect() {
    if (this.client) {
      return new Promise((resolve) => {
        this.client.end(() => {
          this.isConnected = false;
          logger.info("Disconnected from MQTT broker");
          resolve();
        });
      });
    }
  }

  /**
   * Verifica si está conectado
   */
  get connected() {
    return this.client && this.client.connected;
  }
}
