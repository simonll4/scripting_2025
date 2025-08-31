import sqlite3 from "sqlite3";
import { open } from "sqlite";
import crypto from "crypto";
import argon2 from "argon2";

const roleScopes = {
  user: ["getosinfo", "watch", "getwatches"],
  admin: ["*"],
};

async function initDB() {
  const db = await open({
    filename: "../../db/db.sqlite",
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

async function createToken(role, expiresSec) {
  const scopes = roleScopes[role];
  if (!scopes) throw new Error(`Unknown role: ${role}`);
  const db = await initDB();

  const tokenId = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretHash = await argon2.hash(secret, { type: argon2.argon2id });

  const now = Date.now();
  const expires_at = expiresSec ? now + expiresSec * 1000 : null;

  await db.run(
    "INSERT INTO tokens (tokenId, secretHash, scopes, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, 0)",
    [tokenId, secretHash, JSON.stringify(scopes), now, expires_at]
  );

  console.log("✅ Token (guárdalo ahora):");
  console.log(`${tokenId}.${secret}`);
  console.log(
    "Scopes:",
    scopes,
    "Expira:",
    expires_at ? new Date(expires_at).toISOString() : "never"
  );
}

async function revokeToken(tokenId) {
  const db = await initDB();
  const res = await db.run("UPDATE tokens SET revoked=1 WHERE tokenId=?", [
    tokenId,
  ]);
  if (res.changes === 0) console.log("⚠️ tokenId no encontrado");
  else console.log("⛔ Token revocado:", tokenId);
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  try {
    if (cmd === "create") {
      const role = args[0];
      const expires = args[1] ? parseInt(args[1]) : null;
      await createToken(role, expires);
    } else if (cmd === "revoke") {
      const tokenId = args[0];
      await revokeToken(tokenId);
    } else {
      console.log(
        "Usage:\n  node admin.js create <role> [expiresSeconds]\n  node admin.js revoke <tokenId>"
      );
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}
main();

// TODO: Legacy admin code - Old implementation - Not used anymore
// This was the previous version before the current refactored code above
// Could be removed entirely

// import sqlite3 from "sqlite3";
// import { open } from "sqlite";
// import crypto from "crypto";

// // roles -> scopes predefinidos
// const roleScopes = {
//   user: ["getosinfo", "watch", "getwatches"],
//   admin: ["*"],
// };

// async function initDB() {
//   return open({
//     filename: "../db/db.sqlite",
//     driver: sqlite3.Database,
//   });
// }

// async function createToken(role, expires) {
//   const db = await initDB();
//   const token = crypto.randomBytes(16).toString("hex");
//   const scopes = roleScopes[role];
//   if (!scopes) {
//     console.error("Unknown role:", role);
//     process.exit(1);
//   }
//   const expiresAt = expires
//     ? new Date(Date.now() + expires * 1000).toISOString()
//     : null;

//   await db.run(
//     "INSERT INTO tokens (token, scopes, expires_at) VALUES (?, ?, ?)",
//     [token, JSON.stringify(scopes), expiresAt]
//   );
//   console.log("Token created:", token);
//   console.log(
//     "   Role:",
//     role,
//     "Scopes:",
//     scopes,
//     "Expires:",
//     expiresAt || "never"
//   );
// }

// async function revokeToken(token) {
//   const db = await initDB();
//   await db.run("UPDATE tokens SET revoked=1 WHERE token=?", [token]);
//   console.log("Token revoked:", token);
// }

// async function main() {
//   const [, , cmd, ...args] = process.argv;
//   if (cmd === "create") {
//     const role = args[0];
//     const expires = args[1] ? parseInt(args[1]) : null; // segundos
//     await createToken(role, expires);
//   } else if (cmd === "revoke") {
//     const token = args[0];
//     await revokeToken(token);
//   } else {
//     console.log("Usage:");
//     console.log("  node admin.js create <role> [expiresSeconds]");
//     console.log("  node admin.js revoke <token>");
//   }
// }

// main();
