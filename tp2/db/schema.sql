PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS tokens (
  tokenId     TEXT PRIMARY KEY,      -- uuid/hex
  secretHash  TEXT NOT NULL,         -- Argon2id
  scopes      TEXT NOT NULL,         -- JSON array
  created_at  INTEGER NOT NULL,      -- epoch ms
  expires_at  INTEGER,               -- epoch ms (NULL = no expira)
  revoked     INTEGER NOT NULL DEFAULT 0
);


-- CREATE TABLE IF NOT EXISTS tokens (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     token TEXT UNIQUE NOT NULL,
--     scopes TEXT NOT NULL,         -- JSON array
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     expires_at TIMESTAMP,         -- NULL = no expiration
--     revoked INTEGER DEFAULT 0
-- );
