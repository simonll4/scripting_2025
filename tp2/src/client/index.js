import { CONFIG } from "./config.js";
import { logger } from "./utils/logger.js";
import { Client } from "./core/client.js";
import { Prompt } from "./cli/prompt.js";

if (!CONFIG.token) {
  console.error(
    "Uso: node client/index.js <token>  (o export AGENT_TOKEN=...)"
  );
  process.exit(1);
}

const client = new Client(CONFIG);
client.connect();

const prompt = new Prompt(client);
prompt.start();

process.on("SIGINT", () => {
  logger.warn("SIGINT recibido. Saliendo...");
  prompt.shutdown();
});
