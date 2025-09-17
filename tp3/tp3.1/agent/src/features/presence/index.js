/**
 * Presence Management Module
 * 
 * Handles agent presence announcements and heartbeat management.
 * Provides automatic heartbeat functionality and graceful shutdown.
 */

import { logger } from "../../utils/logger.js";

/**
 * Presence Manager class
 */
class PresenceManager {
  constructor(mqttClient, config, agentName) {
    this.client = mqttClient;
    this.config = config;
    this.agentName = agentName;
    this.heartbeatInterval = null;
    this.isEnabled = config.presence.enabled;
    this.heartbeatSeconds = config.presence.heartbeat_seconds;
    this.presenceTopic = `${config.presence.topic_base}/${agentName}`;
    
    logger.debug("presence_manager_created", {
      agent: agentName,
      enabled: this.isEnabled,
      heartbeatSeconds: this.heartbeatSeconds,
      topic: this.presenceTopic
    });
  }

  /**
   * Creates presence payload
   */
  createPresencePayload(state = "online") {
    return JSON.stringify({
      name: this.agentName,
      state,
      ts: new Date().toISOString(),
      heartbeat_seconds: this.heartbeatSeconds,
    });
  }

  /**
   * Announces agent presence
   */
  announcePresence(state = "online") {
    if (!this.isEnabled) {
      logger.debug("presence_disabled", { agent: this.agentName });
      return;
    }

    const payload = this.createPresencePayload(state);
    
    this.client.publish(this.presenceTopic, payload, { 
      qos: 1, 
      retain: true 
    }, (err) => {
      if (err) {
        logger.error("presence_publish_failed", {
          agent: this.agentName,
          topic: this.presenceTopic,
          error: err.message
        });
      } else {
        logger.debug("presence_announced", {
          agent: this.agentName,
          state,
          topic: this.presenceTopic
        });
      }
    });
  }

  /**
   * Sets up Last Will and Testament (LWT) for offline detection
   */
  getLWTConfig() {
    if (!this.isEnabled) return {};

    const payload = this.createPresencePayload("offline");
    
    return {
      will: {
        topic: this.presenceTopic,
        payload,
        qos: 1,
        retain: true,
      },
    };
  }

  /**
   * Starts the heartbeat interval
   */
  startHeartbeat() {
    if (!this.isEnabled || this.heartbeatSeconds <= 0) {
      logger.debug("heartbeat_not_started", {
        agent: this.agentName,
        enabled: this.isEnabled,
        heartbeatSeconds: this.heartbeatSeconds
      });
      return;
    }

    // Clear any existing interval
    this.stopHeartbeat();

    // Announce initial presence
    this.announcePresence("online");

    // Set up recurring heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.announcePresence("online");
    }, this.heartbeatSeconds * 1000);

    logger.info("heartbeat_started", {
      agent: this.agentName,
      intervalSeconds: this.heartbeatSeconds,
      topic: this.presenceTopic
    });
  }

  /**
   * Stops the heartbeat interval
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.debug("heartbeat_stopped", { agent: this.agentName });
    }
  }

  /**
   * Announces agent going offline and stops heartbeat
   */
  announceOffline() {
    this.stopHeartbeat();
    this.announcePresence("offline");
    logger.info("presence_offline_announced", { agent: this.agentName });
  }

  /**
   * Cleanup function for graceful shutdown
   */
  cleanup() {
    logger.debug("presence_cleanup_started", { agent: this.agentName });
    this.announceOffline();
  }
}

/**
 * Factory function to create and configure presence manager
 */
export function createPresenceManager(mqttClient, config, agentName) {
  return new PresenceManager(mqttClient, config, agentName);
}

/**
 * Setup presence management for an MQTT client
 * Returns LWT configuration and presence manager instance
 */
export function setupPresence(config, agentName) {
  const presenceManager = new PresenceManager(null, config, agentName);
  return {
    lwtConfig: presenceManager.getLWTConfig(),
    createManager: (mqttClient) => {
      presenceManager.client = mqttClient;
      return presenceManager;
    }
  };
}