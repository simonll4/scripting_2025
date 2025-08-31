import crypto from "crypto";
import argon2 from "argon2";

import { getTokenRowById } from "../../tp2/src/server/db/db.js";

export async function validateToken(db, tokenString) {
  // token = tokenId.secret
  const dot = tokenString.indexOf(".");
  if (dot <= 0) return null;
  const tokenId = tokenString.slice(0, dot);
  const secret = tokenString.slice(dot + 1);

  const row = await getTokenRowById(db, tokenId);
  if (!row) return null;
  if (row.revoked) return null;
  if (row.expires_at && Date.now() > row.expires_at) return null;

  const ok = await argon2.verify(row.secretHash, secret);
  if (!ok) return null;

  return { tokenId, scopes: JSON.parse(row.scopes) };
}

export function createSession(tokenData, socket, sessions) {
  const sessionId = crypto.randomBytes(8).toString("hex");
  const session = {
    id: sessionId,
    ...tokenData,
    socket,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  };
  sessions[sessionId] = session;
  return session;
}

export function hasScope(session, scope) {
  const scopes = session.scopes || [];
  return scopes.includes("*") || scopes.includes(scope);
}
