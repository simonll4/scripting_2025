export const CONFIG = {
  host: process.env.AGENT_HOST || "127.0.0.1",
  port: Number(process.env.AGENT_PORT || 4000),
  token: process.env.AGENT_TOKEN || process.argv[2] || "",

  // timeouts
  connectTimeoutMs: Number(process.env.AGENT_CONNECT_TIMEOUT || 10000),
  requestTimeoutMs: Number(process.env.AGENT_REQUEST_TIMEOUT || 30000),
  keepAliveMs: Number(process.env.AGENT_KEEPALIVE || 15000),
};
