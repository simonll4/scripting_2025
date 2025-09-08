/**
 * ============================================================================
 * TCP SERVER - MAIN ENTRY POINT
 * ============================================================================
 */

import { TCPServer } from "./core/server.js";
import { logger } from "./utils/logger.js";

async function main() {
  try {
    const server = new TCPServer();
    await server.start();

    // Graceful shutdown
    process.on("SIGINT", async () => {
      logger.info("Shutting down server...");
      await server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down...");
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start server", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Unhandled error in main", {
    error: error.message,
    stack: error.stack,
  });
});
