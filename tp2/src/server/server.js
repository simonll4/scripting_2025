/**
 * ============================================================================
 * TCP SERVER - MAIN ENTRY POINT
 * ============================================================================
 * 
 * Flujo de procesamiento:
 * TCP Socket → ConnectionManager → MessagePipeline → Middlewares → Commands
 */

import { TCPServer } from "./core/server.js";

/**
 * Bootstrap del servidor
 */
async function main() {
  try {
    const server = new TCPServer();
    await server.start();

    // Graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\nShutting down server...");
      await server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nReceived SIGTERM, shutting down...");
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main().catch(console.error);
