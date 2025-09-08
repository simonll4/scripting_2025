import { PROTOCOL } from "../protocol/index.js";

export const CONFIG = {
  host: process.env.AGENT_HOST || "127.0.0.1",
  port: Number(process.env.AGENT_PORT || 4000),
  token: process.env.AGENT_TOKEN || process.argv[2] || "",

  // timeouts (use protocol constants as defaults)
  connectTimeoutMs: Number(
    process.env.AGENT_CONNECT_TIMEOUT || PROTOCOL.LIMITS.CONNECT_TIMEOUT_MS
  ),
  requestTimeoutMs: Number(
    process.env.AGENT_REQUEST_TIMEOUT || PROTOCOL.LIMITS.REQUEST_TIMEOUT_MS
  ),
  keepAliveMs: Number(
    process.env.AGENT_KEEPALIVE || PROTOCOL.LIMITS.HEARTBEAT_MS
  ),
};
