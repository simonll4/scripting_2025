import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../../db/db.sqlite");

export async function initDB() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
  await db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS tokens (
      tokenId TEXT PRIMARY KEY,
      secretHash TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

export async function getTokenRowById(db, tokenId) {
  return db.get(
    "SELECT tokenId, secretHash, scopes, expires_at, revoked FROM tokens WHERE tokenId=?",
    [tokenId]
  );
}
