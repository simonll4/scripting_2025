#!/usr/bin/env node
/**
 * ============================================================================
 * ADMIN SCRIPT - Token Management for TP3.0
 * ============================================================================
 * Gestiona tokens de autenticación para clientes TCP del AgentTCP.
 * Similar al admin.js del tp2 pero adaptado para tp3.0.
 */

import crypto from "crypto";
import argon2 from "argon2";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config as AGENT_CONFIG } from "../agent-tcp/src/config.js";
import { SCOPES } from "../agent-tcp/src/security/index.js";
import fs from "fs";

const ROLES = {
  scheduler: [SCOPES.SNAPSHOT_CREATE], // Puede crear snapshots
};

// Helpers de salida y formato
const ok = (msg = "") => console.log(`✅ ${msg}`);
const err = (msg = "") => console.error(`❌ ${msg}`);
const info = (msg = "") => console.log(msg);
const formatDate = (ts) => (ts ? new Date(ts).toISOString().slice(0, 19) : "Never");

/**
 * Conecta a la DB existente (debe haber sido creada por el servidor)
 */
async function connectDB() {
  const dbPath = AGENT_CONFIG.DB_PATH;
  
  // Verificar que la DB existe
  if (!fs.existsSync(dbPath)) {
    err(`Base de datos no encontrada: ${dbPath}`);
    info(`\nLa base de datos debe ser creada por el servidor AgentTCP.`);
    info(`Ejecuta primero: node src/agent-tcp/index.js\n`);
    process.exit(1);
  }
  
  return open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
}

function usage() {
  info([
    "TP3.0 ADMIN - Token Manager",
    "--------------------------------",
    "",
    "Usage: node admin.js <command> [args]",
    "",
    "Commands:",
    "  create <role> [expiresSeconds]  - Crear token",
    "  revoke <tokenId>                 - Revocar token",
    "  list                            - Listar tokens",
    "  help                            - Mostrar ayuda",
    "",
    "Roles disponibles:",
    "  scheduler  - Puede crear snapshots (scope: snapshot:create)",
    "",
    "Ejemplos:",
    "  node admin.js create scheduler        # Token sin expiración",
    "  node admin.js create scheduler 3600   # Token expira en 1 hora",
    "  node admin.js revoke abc123",
    "  node admin.js list",
    "",
    "",
  ].join("\n"));
}

async function createToken(role, expiresSeconds = null) {
  if (!ROLES[role]) {
    err(`Rol inválido: ${role}`);
    info(`Roles disponibles: ${Object.keys(ROLES).join(", ")}`);
    process.exit(1);
  }

  // Validar expiresSeconds si viene
  let expires = null;
  if (expiresSeconds != null) {
    const n = Number(expiresSeconds);
    if (!Number.isFinite(n) || n < 0) {
      err("expiresSeconds debe ser un número >= 0 (segundos)");
      process.exit(1);
    }
    expires = n;
  }

  const db = await connectDB();
  
  try {
    const tokenId = crypto.randomBytes(16).toString("hex");
    const secret = crypto.randomBytes(32).toString("base64url");
    const secretHash = await argon2.hash(secret, { type: argon2.argon2id });
    const scopes = ROLES[role];
    
    const now = Date.now();
    const expiresAt = expires != null ? now + expires * 1000 : null;
    
    await db.run(
      `INSERT INTO tokens (tokenId, secretHash, scopes, created_at, expires_at, revoked)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [tokenId, secretHash, JSON.stringify(scopes), now, expiresAt]
    );
    
    ok("Token creado exitosamente");
    info("");
    info(`Token: ${tokenId}.${secret}`);
    info(`Rol: ${role}`);
    info(`Scopes: ${scopes.join(", ")}`);
    info(`Expira: ${expiresAt ? new Date(expiresAt).toISOString() : "Nunca"}`);
    info("");
    info("Guarda este token de forma segura. No se puede recuperar.");
    
  } catch (error) {
    err(`Error creando token: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

async function revokeToken(tokenId) {
  const db = await connectDB();
  
  try {
    const result = await db.run(
      `UPDATE tokens SET revoked = 1 WHERE tokenId = ? AND revoked = 0`,
      [tokenId]
    );
    
    if (result.changes > 0) {
      ok(`Token ${tokenId} revocado`);
    } else {
      err(`Token ${tokenId} no encontrado o ya revocado`);
      process.exitCode = 1;
    }
  } catch (error) {
    err(`Error revocando token: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

async function listTokens() {
  const db = await connectDB();
  
  try {
    const tokens = await db.all(
      `SELECT tokenId, scopes, created_at, expires_at, revoked 
       FROM tokens 
       ORDER BY created_at DESC`
    );
    
    if (tokens.length === 0) {
      info("No hay tokens registrados");
      return;
    }

    info("Tokens registrados:\n");
    const header = ["ID", "Scopes", "Estado", "Creado", "Expira"];
    const rows = tokens.map((t) => {
      const scopes = safeParseJSON(t.scopes).join(",");
      const status = t.revoked
        ? "REVOKED"
        : t.expires_at && Date.now() > t.expires_at
        ? "EXPIRED"
        : "ACTIVE";
      return [
        t.tokenId.slice(0, 8),
        scopes,
        status,
        formatDate(t.created_at),
        formatDate(t.expires_at),
      ];
    });
    printTable([header, ...rows]);
  } catch (error) {
    err(`Error listando tokens: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

// Utilidades de salida de tablas y parseo seguro
function safeParseJSON(v) {
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function printTable(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i] ?? "").length)));
  const line = (r) => r.map((c, i) => String(c ?? "").padEnd(widths[i])).join(" | ");
  info(line(rows[0]));
  info(widths.map((w) => "-".repeat(w)).join("-+-"));
  rows.slice(1).forEach((r) => info(line(r)));
}

async function showStats() {
  const db = await connectDB();
  
  try {
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(success) as successful,
        COUNT(*) - SUM(success) as failed
      FROM capture_logs
    `);
    
    const recentStats = await db.get(`
      SELECT 
        COUNT(*) as recent_total,
        SUM(success) as recent_successful
      FROM capture_logs
      WHERE timestamp > ?
    `, [Date.now() - (24 * 60 * 60 * 1000)]); // Últimas 24 horas
    
    info("Estadísticas de capturas:\n");
    info(`Total capturas: ${stats?.total || 0}`);
    info(`Exitosas: ${stats?.successful || 0}`);
    info(`Fallidas: ${stats?.failed || 0}`);
    info("");
    info("Últimas 24 horas:");
    info(`Capturas: ${recentStats?.recent_total || 0}`);
    info(`Exitosas: ${recentStats?.recent_successful || 0}`);
    
  } catch (error) {
    err(`Error obteniendo estadísticas: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

// Main
const [,, command, ...args] = process.argv;

switch ((command || "help").toLowerCase()) {
  case "create":
    if (!args[0]) {
      usage();
      process.exit(1);
    }
    await createToken(args[0], args[1] ? parseInt(args[1]) : null);
    break;
    
  case "revoke":
    if (!args[0]) {
      usage();
      process.exit(1);
    }
    await revokeToken(args[0]);
    break;
    
  case "list":
    await listTokens();
    break;
    
  case "stats":
    await showStats();
    break;
  case "help":
    usage();
    break;
  default:
    usage();
    process.exit(1);
}
