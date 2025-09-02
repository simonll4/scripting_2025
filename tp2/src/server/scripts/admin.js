import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import crypto from "crypto";
import argon2 from "argon2";
import { ROLE_SCOPES } from "../utils/auth/scopes.js";

const DB_PATH = "../../../db/db.sqlite";

async function openDBIfExists() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      "La base de datos no existe. Debe ser creada por el servidor."
    );
  }
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
}

async function createToken(role, expiresSec) {
  const scopes = ROLE_SCOPES[role];
  if (!scopes) throw new Error(`Unknown role: ${role}`);
  const db = await openDBIfExists();

  const tokenId = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("base64url");
  const secretHash = await argon2.hash(secret, { type: argon2.argon2id });

  const now = Date.now();
  const expires_at = expiresSec ? now + expiresSec * 1000 : null;

  await db.run(
    "INSERT INTO tokens (tokenId, secretHash, scopes, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, 0)",
    [tokenId, secretHash, JSON.stringify(scopes), now, expires_at]
  );

  console.log("Token:");
  console.log(`${tokenId}.${secret}`);
  console.log(
    "Scopes:",
    scopes,
    "Expira:",
    expires_at ? new Date(expires_at).toISOString() : "never"
  );
}

async function revokeToken(tokenId) {
  const db = await openDBIfExists();
  const res = await db.run("UPDATE tokens SET revoked=1 WHERE tokenId=?", [
    tokenId,
  ]);
  if (res.changes === 0) console.log("tokenId no encontrado");
  else console.log("Token revocado:", tokenId);
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
