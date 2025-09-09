import { CONFIG } from "./config.js";
import { logger } from "./utils/logger.js";
import { Client } from "./core/client.js";
import { Prompt } from "./cli/prompt.js";

if (!CONFIG.token) {
  console.log(`\x1b[31m${"=".repeat(60)}\x1b[0m`);
  console.log(`\x1b[1mERROR DE CONFIGURACIÓN\x1b[0m`);
  console.log(`\x1b[31m${"=".repeat(60)}\x1b[0m`);
  console.log(`\nToken de autenticación requerido`);
  console.log(`\nFormas de proporcionar el token:`);
  console.log(`   1. Como argumento: \x1b[32mnode client/index.js <token>\x1b[0m`);
  console.log(`   2. Variable de entorno: \x1b[32mexport AGENT_TOKEN=<token>\x1b[0m`);
  console.log(`\nEjemplo:`);
  console.log(`   \x1b[32mnode client/index.js mi_token_secreto\x1b[0m`);
  console.log(`\x1b[31m${"=".repeat(60)}\x1b[0m\n`);
  process.exit(1);
}

// Mostrar información de inicio limpia
console.log(`\x1b[36m${"=".repeat(50)}\x1b[0m`);
console.log(`\x1b[1mCLIENTE AGENTE\x1b[0m`);
console.log(`\x1b[36m${"=".repeat(50)}\x1b[0m`);
console.log(`\nConectando a: \x1b[33m${CONFIG.host}:${CONFIG.port}\x1b[0m`);
console.log(`\x1b[36m${"=".repeat(50)}\x1b[0m\n`);

const client = new Client(CONFIG);
client.connect();

const prompt = new Prompt(client);
prompt.start();

// Manejo elegante de señales del sistema
process.on("SIGINT", () => {
  logger.warn("Señal SIGINT recibida. Cerrando de forma segura...");
  prompt.shutdown();
});

process.on("SIGTERM", () => {
  logger.warn("Señal SIGTERM recibida. Cerrando de forma segura...");
  prompt.shutdown();
});

// Manejo de errores no capturados
process.on("uncaughtException", (error) => {
  logger.error("Error no capturado", { error: error.message, stack: error.stack });
  console.log(`\n\x1b[31m${"=".repeat(60)}\x1b[0m`);
  console.log(`\x1b[1mERROR CRÍTICO\x1b[0m`);
  console.log(`\x1b[31m${"=".repeat(60)}\x1b[0m`);
  console.log(`\n${error.message}`);
  console.log(`\nPor favor reporte este error al desarrollador`);
  console.log(`\x1b[31m${"=".repeat(60)}\x1b[0m\n`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Promesa rechazada no manejada", { reason, promise });
  console.log(`\n\x1b[33mAdvertencia: Promesa rechazada no manejada\x1b[0m`);
  console.log(`   ${reason}\n`);
});
