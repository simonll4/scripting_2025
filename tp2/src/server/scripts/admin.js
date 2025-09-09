import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import argon2 from "argon2";
import { ROLE_SCOPES } from "../security/scopes.js";

/**
 * Resolución de rutas robusta (independiente del cwd al ejecutar)
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// La DB la crea el servidor; este script solo la usa si ya existe
const DB_PATH = path.resolve(__dirname, "../../../db/db.sqlite");

/**
 * Helpers de salida
 */
function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function info(...args) {
  console.log(...args);
}

/**
 * Abre la DB si existe (no crea ni migra)
 */
async function openDBIfExists() {
  if (!fs.existsSync(DB_PATH)) {
    die(
      `La base de datos no existe en: ${DB_PATH}\n` +
        `Debe ser creada previamente por el servidor.`
    );
  }
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
}

/**
 * Crea un token con scopes derivados del rol. Opcionalmente, con expiración en segundos.
 * Imprime el token en formato <tokenId>.<secret>
 */
async function createToken(role, expiresSec) {
  const scopes = ROLE_SCOPES?.[role];
  if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
    die(
      `Rol inválido o sin scopes: "${role}". ` +
        `Roles disponibles: ${Object.keys(ROLE_SCOPES).join(", ")}`
    );
  }

  let expiresAt = null;
  if (expiresSec !== undefined && expiresSec !== null) {
    const n = Number(expiresSec);
    if (!Number.isFinite(n) || n <= 0) {
      die("expiresSeconds debe ser un número positivo (en segundos).");
    }
    expiresAt = Date.now() + n * 1000;
  }

  const db = await openDBIfExists();
  try {
    const tokenId = crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(32).toString("base64url");
    const secretHash = await argon2.hash(secret, { type: argon2.argon2id });

    const now = Date.now();
    await db.run(
      `INSERT INTO tokens (tokenId, secretHash, scopes, created_at, expires_at, revoked)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [tokenId, secretHash, JSON.stringify(scopes), now, expiresAt]
    );

    info("Token generado:");
    info(`${tokenId}.${secret}`);
    info(
      "Rol:",
      role,
      "| Scopes:",
      scopes.join(", "),
      "| Expira:",
      expiresAt ? new Date(expiresAt).toISOString() : "never"
    );
  } finally {
    await db.close();
  }
}

/**
 * Revoca un token por tokenId (no necesita el secret).
 */
async function revokeToken(tokenId) {
  if (!tokenId || typeof tokenId !== "string" || tokenId.length < 8) {
    die("Debes proveer un tokenId válido a revocar.");
  }

  const db = await openDBIfExists();
  try {
    const res = await db.run(`UPDATE tokens SET revoked=1 WHERE tokenId=?`, [
      tokenId,
    ]);
    if (!res || res.changes === 0) {
      info("tokenId no encontrado:", tokenId);
    } else {
      info("Token revocado:", tokenId);
    }
  } finally {
    await db.close();
  }
}

/**
 * Lista tokens existentes (ayuda operativa). No imprime secretos.
 */
async function listTokens() {
  const db = await openDBIfExists();
  try {
    const rows = await db.all(
      `SELECT tokenId, created_at, expires_at, revoked, scopes
       FROM tokens
       ORDER BY created_at DESC
       LIMIT 200`
    );
    if (!rows || rows.length === 0) {
      info("No hay tokens.");
      return;
    }
    for (const r of rows) {
      const createdISO = r.created_at
        ? new Date(r.created_at).toISOString()
        : "-";
      const expiresISO = r.expires_at
        ? new Date(r.expires_at).toISOString()
        : "never";
      const scopes = safeParseJSON(r.scopes, []);
      info(
        [
          `tokenId=${r.tokenId}`,
          `revoked=${!!r.revoked}`,
          `created=${createdISO}`,
          `expires=${expiresISO}`,
          `scopes=${scopes.join(",")}`,
        ].join(" | ")
      );
    }
  } finally {
    await db.close();
  }
}

function safeParseJSON(s, fallback) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * CLI
 */
function printUsage() {
  info(
    [
      "Uso:",
      "  node admin.js create <role> [expiresSeconds]",
      "  node admin.js revoke <tokenId>",
      "  node admin.js list",
      "",
      "Ejemplos:",
      "  node admin.js create admin/user 86400     # expira en 24h",
      "  node admin.js revoke 7f1c...a91b",
      "  node admin.js list",
    ].join("\n")
  );
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  try {
    switch (cmd) {
      case "create": {
        const [role, expiresStr] = args;
        if (!role) {
          printUsage();
          die("Falta <role> para crear el token.");
        }
        await createToken(role, expiresStr ?? null);
        break;
      }
      case "revoke": {
        const [tokenId] = args;
        if (!tokenId) {
          printUsage();
          die("Falta <tokenId> para revocar.");
        }
        await revokeToken(tokenId);
        break;
      }
      case "list": {
        await listTokens();
        break;
      }
      default:
        printUsage();
        die("Comando inválido. Usa create | revoke | list.");
    }
  } catch (e) {
    die(`Error: ${e?.message ?? e}`, 1);
  }
}

main();
