/**
 * ============================================================================
 * DATABASE INITIALIZATION - Camera System TP3.0
 * ============================================================================
 * Inicialización y configuración de la base de datos, extraído desde db.js
 */

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("DB");

/**
 * Inicializa la base de datos
 */
export async function initDB(dbPath) {
  logger.info(`Initializing database: ${dbPath}`);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Crear tablas si no existen
  await createTables(db);
  
  logger.info("Database initialized successfully");
  return db;
}

/**
 * Crea las tablas necesarias
 */
async function createTables(db) {
  // Tabla de tokens de autenticación (similar a tp2)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      tokenId TEXT PRIMARY KEY,
      secretHash TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Tabla de logs de capturas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS capture_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      camera_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      success INTEGER NOT NULL,
      error_msg TEXT,
      image_size INTEGER,
      client_ip TEXT
    )
  `);

  // Índices para mejor performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tokens_revoked ON tokens(revoked);
    CREATE INDEX IF NOT EXISTS idx_capture_logs_timestamp ON capture_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_capture_logs_camera ON capture_logs(camera_id);
  `);
}

/**
 * Cierra la conexión a la base de datos
 */
export async function closeDB(db) {
  if (db) {
    await db.close();
    logger.info("Database connection closed");
  }
}
