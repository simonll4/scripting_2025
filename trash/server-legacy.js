import net from "net";

import { CONFIG } from "../tp2/src/config.js";
import { initDB } from "../tp2/src/db/db.js";
import { validateToken, createSession, hasScope } from "../tp2/src/security/auth.js";
import { Deframer } from "../tp2/src/transport/codec.js";
import { send } from "../tp2/src/transport/msg.js";
import { commands } from "../tp2/src/commands/index.js";
import {
  validators,
  validateAuth,
  formatAjvErrors,
} from "../tp2/src/security/validation.js";

import { PROTOCOL } from "../tp2/src/protocol/standard.js";
import {
  makeHello,
  makeRes,
  makeErr,
  assertEnvelope,
} from "../tp2/src/protocol/messages.js";

const sessions = {};

// Error code para rate limit (fallback si tu enum no lo tiene)
const RL_ERR =
  PROTOCOL.ERROR_CODES?.RATE_LIMITED ??
  PROTOCOL.ERROR_CODES?.TOO_MANY_REQUESTS ??
  PROTOCOL.ERROR_CODES?.FORBIDDEN ??
  PROTOCOL.ERROR_CODES?.BAD_REQUEST;

/** ---------------------
 *  Token Bucket
 *  --------------------- */
function makeTokenBucket({ capacity, refillPerSec }) {
  const cap = Math.max(1, capacity | 0);
  const rate = Math.max(0, refillPerSec);
  let tokens = cap;
  let last = Date.now();

  const take = (n = 1) => {
    const now = Date.now();
    const elapsedSec = (now - last) / 1000;
    if (elapsedSec > 0) {
      tokens = Math.min(cap, tokens + elapsedSec * rate);
      last = now;
    }
    if (tokens >= n) {
      tokens -= n;
      return true;
    }
    return false;
  };

  const snapshot = () => ({ tokens, capacity: cap });
  return { take, snapshot };
}

function makePerActLimiter() {
  // Map act -> token bucket
  const buckets = new Map();
  return {
    take(act) {
      const cfg = CONFIG.RL_ACT[act] || CONFIG.RL_ACT_DEFAULT;
      let b = buckets.get(act);
      if (!b) {
        b = makeTokenBucket(cfg);
        buckets.set(act, b);
      }
      return b.take(1);
    },
  };
}

/** ---------------------
 *  Contexto por socket
 *  --------------------- */
function makeCtx({ db, socket, deframer }) {
  let session = null;

  // buckets por socket y por act
  const socketBucket = makeTokenBucket(CONFIG.RL_SOCKET);
  const actLimiter = makePerActLimiter();

  const safeSend = (obj) => {
    send(socket, obj);
    if (socket.writableNeedDrain) {
      try {
        deframer.pause();
      } catch {}
      socket.once("drain", () => {
        try {
          deframer.resume();
        } catch {}
      });
    }
  };

  const replyErr = (id, act, code, message, details) => {
    safeSend(makeErr(id, act, code, message, details));
  };

  const replyOk = (id, act, data = {}) => {
    safeSend(makeRes(id, act, data));
  };

  const closeWith = (code, message) => {
    try {
      replyErr("0", "CONNECTION", code, message);
    } finally {
      socket.end();
    }
  };

  return {
    db,
    socket,
    deframer,
    get session() {
      return session;
    },
    set session(v) {
      session = v;
    },
    replyErr,
    replyOk,
    closeWith,
    safeSend,
    socketBucket,
    actLimiter,
  };
}

/** ---------------------
 *  Pasos del pipeline
 *  --------------------- */
function parseJSONOrErr(ctx, payload) {
  try {
    return JSON.parse(payload.toString("utf8"));
  } catch {
    ctx.replyErr(
      "0",
      "PARSE",
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      "invalid json"
    );
    return null;
  }
}

function ensureEnvelopeOrErr(ctx, msg) {
  try {
    assertEnvelope(msg);
    return true;
  } catch (e) {
    ctx.replyErr(
      msg?.id || "0",
      msg?.act || "UNKNOWN",
      e.code || PROTOCOL.ERROR_CODES.BAD_REQUEST,
      e.message
    );
    return false;
  }
}

async function handleAuthIfNeeded(ctx, msg) {
  if (ctx.session) return false; // ya autenticado
  if (msg.act !== PROTOCOL.CORE_ACTS.AUTH) {
    ctx.replyErr(
      msg.id,
      msg.act,
      PROTOCOL.ERROR_CODES.AUTH_REQUIRED,
      "authenticate first"
    );
    return true; // ya respondí
  }

  // validar payload AUTH
  const data = msg.data ?? {};
  if (!validateAuth(data)) {
    ctx.replyErr(
      msg.id,
      PROTOCOL.CORE_ACTS.AUTH,
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      "invalid auth payload",
      formatAjvErrors(validateAuth.errors)
    );
    return true;
  }

  const tokenData = await validateToken(ctx.db, data.token);
  if (!tokenData) {
    ctx.closeWith(
      PROTOCOL.ERROR_CODES.INVALID_TOKEN,
      "revoked/expired/invalid"
    );
    return true;
  }

  ctx.session = createSession(tokenData, ctx.socket, sessions);
  ctx.replyOk(msg.id, PROTOCOL.CORE_ACTS.AUTH, {
    sessionId: ctx.session.id,
    scopes: ctx.session.scopes,
  });
  return true; // AUTH consume el mensaje
}

function resolveCommandOrErr(ctx, msg) {
  const def = commands.get(msg.act);
  if (!def) {
    ctx.replyErr(
      msg.id,
      msg.act,
      PROTOCOL.ERROR_CODES.UNKNOWN_ACTION,
      "not implemented"
    );
    return null;
  }
  return def;
}

function validatePayloadOrErr(ctx, msg, validate) {
  const data = msg.data ?? {};
  if (validate && !validate(data)) {
    ctx.replyErr(
      msg.id,
      msg.act,
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      "invalid payload",
      formatAjvErrors(validate.errors)
    );
    return null;
  }
  return data;
}

function checkScopeOrErr(ctx, msg, def) {
  if (def.scope && !hasScope(ctx.session, def.scope)) {
    ctx.replyErr(
      msg.id,
      msg.act,
      PROTOCOL.ERROR_CODES.FORBIDDEN,
      `scope ${def.scope} required`
    );
    return false;
  }
  return true;
}

/** ---------------------
 *  Rate limiting hook
 *  --------------------- */
function checkRateLimitOrErr(ctx, msg) {
  // 1) límite por socket (global)
  if (!ctx.socketBucket.take(1)) {
    ctx.replyErr(msg.id, msg.act, RL_ERR, "rate limit (socket) exceeded");
    return false;
  }
  // 2) límite por acción
  if (!ctx.actLimiter.take(msg.act)) {
    ctx.replyErr(msg.id, msg.act, RL_ERR, "rate limit (action) exceeded");
    return false;
  }
  return true;
}

/** ---------------------
 *  Servidor
 *  --------------------- */
async function startServer() {
  const db = await initDB();

  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

    const deframer = new Deframer(CONFIG.MAX_FRAME);
    socket.pipe(deframer);

    const ctx = makeCtx({ db, socket, deframer });

    ctx.safeSend(
      makeHello({ maxFrame: CONFIG.MAX_FRAME, heartbeat: CONFIG.HEARTBEAT_MS })
    );

    deframer.on("data", async (payload) => {
      // 0) parse
      const msg = parseJSONOrErr(ctx, payload);
      if (!msg) return;

      // 1) envelope
      if (!ensureEnvelopeOrErr(ctx, msg)) return;

      // 2) rate limit temprano (antes de AUTH/route), pero dejando pasar AUTH
      //    Para no bloquear la autenticación inicial por bursts, permitimos 1 token gratis si act=AUTH.
      if (msg.act !== PROTOCOL.CORE_ACTS.AUTH) {
        if (!checkRateLimitOrErr(ctx, msg)) return;
      }

      // 3) AUTH gate
      const consumed = await handleAuthIfNeeded(ctx, msg);
      if (consumed) return;

      // 4) route
      const def = resolveCommandOrErr(ctx, msg);
      if (!def) return;

      // 5) validate payload
      const validate = validators.get(msg.act);
      const data = validatePayloadOrErr(ctx, msg, validate);
      if (!data && validate) return;

      // 6) scope
      if (!checkScopeOrErr(ctx, msg, def)) return;

      // 7) handler
      try {
        const result = await def.handler({
          session: ctx.session,
          data,
          db: ctx.db,
          socket: ctx.socket,
        });
        ctx.replyOk(msg.id, msg.act, result ?? {});
        if (def.closeAfter) ctx.socket.end();
      } catch (e) {
        ctx.replyErr(
          msg.id,
          msg.act,
          PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
          e?.message || "error"
        );
      }
    });

    socket.on("close", () => {
      if (ctx.session) delete sessions[ctx.session.id];
    });

    socket.on("error", () => {
      // swallow; 'close' limpiará la sesión
    });
  });

  server.listen(CONFIG.PORT, () => {
    console.log(`Server listening on port ${CONFIG.PORT}`);
  });
}

startServer();

// import net from "net";

// import { CONFIG } from "./config.js";
// import { initDB } from "./db/db.js";
// import { validateToken, createSession, hasScope } from "./security/auth.js";
// import { Deframer } from "./transport/codec.js";
// import { send } from "./transport/msg.js";
// import { commands } from "./commands/index.js";
// import {
//   validators,
//   validateAuth,
//   formatAjvErrors,
// } from "./security/validation.js";

// import { PROTOCOL } from "./protocol/standard.js";
// import {
//   makeHello,
//   makeRes,
//   makeErr,
//   assertEnvelope,
// } from "./protocol/messages.js";

// const sessions = {};

// /** ---------------------
//  *  Utilidades por socket
//  *  --------------------- */
// function makeCtx({ db, socket, deframer }) {
//   let session = null;

//   const safeSend = (obj) => {
//     // usa tu send() actual (frame + write)
//     send(socket, obj);
//     // backpressure básico: si el kernel está lleno, pausamos el intake
//     if (socket.writableNeedDrain) {
//       try {
//         deframer.pause();
//       } catch {}
//       socket.once("drain", () => {
//         try {
//           deframer.resume();
//         } catch {}
//       });
//     }
//   };

//   const replyErr = (id, act, code, message, details) => {
//     safeSend(makeErr(id, act, code, message, details));
//   };

//   const replyOk = (id, act, data = {}) => {
//     safeSend(makeRes(id, act, data));
//   };

//   const closeWith = (code, message) => {
//     try {
//       replyErr("0", "CONNECTION", code, message);
//     } finally {
//       socket.end();
//     }
//   };

//   return {
//     db,
//     socket,
//     deframer,
//     get session() {
//       return session;
//     },
//     set session(v) {
//       session = v;
//     },
//     replyErr,
//     replyOk,
//     closeWith,
//     safeSend,
//   };
// }

// /** ---------------------
//  *  Pasos del pipeline
//  *  --------------------- */
// function parseJSONOrErr(ctx, payload) {
//   try {
//     return JSON.parse(payload.toString("utf8"));
//   } catch {
//     ctx.replyErr(
//       "0",
//       "PARSE",
//       PROTOCOL.ERROR_CODES.BAD_REQUEST,
//       "invalid json"
//     );
//     return null;
//   }
// }

// function ensureEnvelopeOrErr(ctx, msg) {
//   try {
//     assertEnvelope(msg);
//     return true;
//   } catch (e) {
//     ctx.replyErr(
//       msg?.id || "0",
//       msg?.act || "UNKNOWN",
//       e.code || PROTOCOL.ERROR_CODES.BAD_REQUEST,
//       e.message
//     );
//     return false;
//   }
// }

// async function handleAuthIfNeeded(ctx, msg) {
//   if (ctx.session) return false; // ya autenticado
//   if (msg.act !== PROTOCOL.CORE_ACTS.AUTH) {
//     ctx.replyErr(
//       msg.id,
//       msg.act,
//       PROTOCOL.ERROR_CODES.AUTH_REQUIRED,
//       "authenticate first"
//     );
//     return true; // ya respondí
//   }

//   // validar payload AUTH
//   const data = msg.data ?? {};
//   if (!validateAuth(data)) {
//     ctx.replyErr(
//       msg.id,
//       PROTOCOL.CORE_ACTS.AUTH,
//       PROTOCOL.ERROR_CODES.BAD_REQUEST,
//       "invalid auth payload",
//       formatAjvErrors(validateAuth.errors)
//     );
//     return true; // corté acá
//   }

//   const tokenData = await validateToken(ctx.db, data.token);
//   if (!tokenData) {
//     ctx.closeWith(
//       PROTOCOL.ERROR_CODES.INVALID_TOKEN,
//       "revoked/expired/invalid"
//     );
//     return true;
//   }

//   // crear sesión de este socket
//   ctx.session = createSession(tokenData, ctx.socket, sessions);
//   ctx.replyOk(msg.id, PROTOCOL.CORE_ACTS.AUTH, {
//     sessionId: ctx.session.id,
//     scopes: ctx.session.scopes,
//   });
//   return true; // AUTH siempre consume el mensaje
// }

// function resolveCommandOrErr(ctx, msg) {
//   const def = commands.get(msg.act);
//   if (!def) {
//     ctx.replyErr(
//       msg.id,
//       msg.act,
//       PROTOCOL.ERROR_CODES.UNKNOWN_ACTION,
//       "not implemented"
//     );
//     return null;
//   }
//   return def;
// }

// function validatePayloadOrErr(ctx, msg, validate) {
//   const data = msg.data ?? {};
//   if (validate && !validate(data)) {
//     ctx.replyErr(
//       msg.id,
//       msg.act,
//       PROTOCOL.ERROR_CODES.BAD_REQUEST,
//       "invalid payload",
//       formatAjvErrors(validate.errors)
//     );
//     return null;
//   }
//   return data;
// }

// function checkScopeOrErr(ctx, msg, def) {
//   if (def.scope && !hasScope(ctx.session, def.scope)) {
//     ctx.replyErr(
//       msg.id,
//       msg.act,
//       PROTOCOL.ERROR_CODES.FORBIDDEN,
//       `scope ${def.scope} required`
//     );
//     return false;
//   }
//   return true;
// }

// /** ---------------------
//  *  Servidor
//  *  --------------------- */
// async function startServer() {
//   const db = await initDB();

//   const server = net.createServer((socket) => {
//     // Transporte
//     socket.setNoDelay(true);
//     socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

//     // Framing
//     const deframer = new Deframer(CONFIG.MAX_FRAME);
//     socket.pipe(deframer);

//     // Contexto por conexión
//     const ctx = makeCtx({ db, socket, deframer });

//     // HELLO inicial (anuncio de parámetros de transporte)
//     ctx.safeSend(
//       makeHello({ maxFrame: CONFIG.MAX_FRAME, heartbeat: CONFIG.HEARTBEAT_MS })
//     );

//     deframer.on("data", async (payload) => {
//       // 1) parse
//       const msg = parseJSONOrErr(ctx, payload);
//       if (!msg) return;

//       // 2) envelope (contrato mínimo del protocolo)
//       if (!ensureEnvelopeOrErr(ctx, msg)) return;

//       // 3) AUTH gate (único permitido sin sesión)
//       const consumed = await handleAuthIfNeeded(ctx, msg);
//       if (consumed) return;

//       // 4) comando
//       const def = resolveCommandOrErr(ctx, msg);
//       if (!def) return;

//       // 5) validar data
//       const validate = validators.get(msg.act);
//       const data = validatePayloadOrErr(ctx, msg, validate);
//       if (!data && validate) return; // si había validador y falló, ya respondí

//       // 6) scope
//       if (!checkScopeOrErr(ctx, msg, def)) return;

//       // 7) ejecutar handler
//       try {
//         const result = await def.handler({
//           session: ctx.session,
//           data,
//           db: ctx.db,
//           socket: ctx.socket,
//         });
//         ctx.replyOk(msg.id, msg.act, result ?? {});
//         if (def.closeAfter) ctx.socket.end();
//       } catch (e) {
//         ctx.replyErr(
//           msg.id,
//           msg.act,
//           PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
//           e?.message || "error"
//         );
//       }
//     });

//     socket.on("close", () => {
//       if (ctx.session) delete sessions[ctx.session.id];
//     });

//     socket.on("error", () => {
//       // no hagas throw acá; dejar que 'close' limpie la sesión
//     });
//   });

//   server.listen(CONFIG.PORT, () => {
//     console.log(`Server listening on port ${CONFIG.PORT}`);
//   });
// }

// startServer();

// // import net from "net";

// // import { CONFIG } from "./config.js";
// // import { initDB } from "./db/db.js";
// // import { validateToken, createSession, hasScope } from "./security/auth.js";
// // import { Deframer } from "./transport/codec.js";
// // import { send } from "./transport/msg.js";
// // import { commands } from "./commands/index.js";
// // import {
// //   validators,
// //   validateAuth,
// //   formatAjvErrors,
// // } from "./security/validation.js";

// // import { PROTOCOL } from "./protocol/standard.js";
// // import {
// //   makeHello,
// //   makeRes,
// //   makeErr,
// //   assertEnvelope,
// // } from "./protocol/messages.js";

// // const sessions = {};

// // async function startServer() {
// //   const db = await initDB();

// //   const server = net.createServer((socket) => {
// //     // desactiva algoritmo de Nagle
// //     socket.setNoDelay(true);
// //     // activa keep-alive para detectar peers muertos
// //     socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

// //     const deframer = new Deframer(CONFIG.MAX_FRAME);
// //     socket.pipe(deframer);

// //     // HELLO
// //     send(
// //       socket,
// //       makeHello({ maxFrame: CONFIG.MAX_FRAME, heartbeat: CONFIG.HEARTBEAT_MS })
// //     );

// //     let session = null;

// //     const closeWith = (code, msg) => {
// //       try {
// //         send(socket, makeErr("0", "CONNECTION", code, msg));
// //       } finally {
// //         socket.end();
// //       }
// //     };

// //     deframer.on("data", async (payload) => {
// //       let msg;
// //       try {
// //         msg = JSON.parse(payload.toString("utf8"));
// //       } catch {
// //         return send(
// //           socket,
// //           makeErr(
// //             "0",
// //             "PARSE",
// //             PROTOCOL.ERROR_CODES.BAD_REQUEST,
// //             "invalid json"
// //           )
// //         );
// //       }

// //       // Validación mínima del envelope
// //       try {
// //         assertEnvelope(msg);
// //       } catch (e) {
// //         return send(
// //           socket,
// //           makeErr(
// //             msg?.id || "0",
// //             msg?.act || "UNKNOWN",
// //             e.code || PROTOCOL.ERROR_CODES.BAD_REQUEST,
// //             e.message
// //           )
// //         );
// //       }

// //       // AUTH (unico "act" permitido sin sesion)
// //       if (!session && msg.act === PROTOCOL.CORE_ACTS.AUTH) {
// //         const data = msg.data ?? {};
// //         if (!validateAuth(data)) {
// //           return send(
// //             socket,
// //             makeErr(
// //               msg.id,
// //               PROTOCOL.CORE_ACTS.AUTH,
// //               PROTOCOL.ERROR_CODES.BAD_REQUEST,
// //               "invalid auth payload",
// //               formatAjvErrors(validateAuth.errors)
// //             )
// //           );
// //         }
// //         const tokenData = await validateToken(db, data.token);
// //         if (!tokenData) {
// //           return closeWith(
// //             PROTOCOL.ERROR_CODES.INVALID_TOKEN,
// //             "revoked/expired/invalid"
// //           );
// //         }
// //         session = createSession(tokenData, socket, sessions);
// //         return send(
// //           socket,
// //           makeRes(msg.id, PROTOCOL.CORE_ACTS.AUTH, {
// //             sessionId: session.id,
// //             scopes: session.scopes,
// //           })
// //         );
// //       }

// //       // Verificación de sesión activa
// //       if (!session) {
// //         return send(
// //           socket,
// //           makeErr(
// //             msg.id,
// //             msg.act,
// //             PROTOCOL.ERROR_CODES.AUTH_REQUIRED,
// //             "authenticate first"
// //           )
// //         );
// //       }

// //       // Dispatcher
// //       const def = commands.get(msg.act);
// //       if (!def) {
// //         return send(
// //           socket,
// //           makeErr(
// //             msg.id,
// //             msg.act,
// //             PROTOCOL.ERROR_CODES.UNKNOWN_ACTION,
// //             "not implemented"
// //           )
// //         );
// //       }

// //       // Validación de payload con AJV
// //       const validate = validators.get(msg.act);
// //       const data = msg.data ?? {};
// //       if (validate && !validate(data)) {
// //         return send(
// //           socket,
// //           makeErr(
// //             msg.id,
// //             msg.act,
// //             PROTOCOL.ERROR_CODES.BAD_REQUEST,
// //             "invalid payload",
// //             formatAjvErrors(validate.errors)
// //           )
// //         );
// //       }

// //       // Autorización por scope
// //       if (def.scope && !hasScope(session, def.scope)) {
// //         return send(
// //           socket,
// //           makeErr(
// //             msg.id,
// //             msg.act,
// //             PROTOCOL.ERROR_CODES.FORBIDDEN,
// //             `scope ${def.scope} required`
// //           )
// //         );
// //       }

// //       try {
// //         const result = await def.handler({ session, data, db, socket });
// //         send(socket, makeRes(msg.id, msg.act, result ?? {}));
// //         if (def.closeAfter) socket.end();
// //       } catch (e) {
// //         send(
// //           socket,
// //           makeErr(
// //             msg.id,
// //             msg.act,
// //             PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
// //             e?.message || "error"
// //           )
// //         );
// //       }
// //     });

// //     socket.on("close", () => {
// //       if (session) delete sessions[session.id];
// //     });

// //     socket.on("error", () => {});
// //   });

// //   server.listen(CONFIG.PORT, () => {
// //     console.log(`Server listening on port ${CONFIG.PORT}`);
// //   });
// // }

// // startServer();

// // // import net from "net";

// // // import { CONFIG } from "./config.js";
// // // import { initDB } from "./db/db.js";
// // // import { validateToken, createSession, hasScope } from "./security/auth.js";
// // // import { Deframer } from "./transport/codec.js";
// // // import { send, ok, err } from "./transport/msg.js";
// // // import { commands } from "./commands/index.js";
// // // import {
// // //   validators,
// // //   validateAuth,
// // //   formatAjvErrors,
// // // } from "./security/validation.js";

// // // const sessions = {};

// // // async function startServer() {
// // //   const db = await initDB();

// // //   const server = net.createServer((socket) => {
// // //     socket.setNoDelay(true);
// // //     socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

// // //     const deframer = new Deframer(CONFIG.MAX_FRAME);
// // //     socket.pipe(deframer);

// // //     // HELLO
// // //     send(socket, {
// // //       v: 1,
// // //       t: "hello",
// // //       data: { maxFrame: CONFIG.MAX_FRAME, heartbeat: CONFIG.HEARTBEAT_MS },
// // //     });

// // //     let session = null;

// // //     const closeWith = (code, msg) => {
// // //       try {
// // //         send(socket, err("0", "CONNECTION", code, msg));
// // //       } finally {
// // //         socket.end();
// // //       }
// // //     };

// // //     deframer.on("data", async (payload) => {
// // //       let msg;
// // //       try {
// // //         msg = JSON.parse(payload.toString("utf8"));
// // //       } catch {
// // //         return send(socket, err("0", "PARSE", "BAD_REQUEST", "invalid json"));
// // //       }

// // //       if (!msg.t || msg.t !== "req" || !msg.id || !msg.act) {
// // //         return send(
// // //           socket,
// // //           err(
// // //             msg.id || "0",
// // //             msg.act || "UNKNOWN",
// // //             "BAD_REQUEST",
// // //             "invalid envelope"
// // //           )
// // //         );
// // //       }

// // //       // AUTH (único permitido sin sesión)
// // //       if (!session && msg.act === "AUTH") {
// // //         const data = msg.data ?? {};
// // //         if (!validateAuth(data)) {
// // //           return send(
// // //             socket,
// // //             err(
// // //               msg.id,
// // //               "AUTH",
// // //               "BAD_REQUEST",
// // //               "invalid auth payload",
// // //               formatAjvErrors(validateAuth.errors)
// // //             )
// // //           );
// // //         }
// // //         const tokenData = await validateToken(db, data.token);
// // //         if (!tokenData)
// // //           return closeWith("INVALID_TOKEN", "revoked/expired/invalid");
// // //         session = createSession(tokenData, socket, sessions);
// // //         return send(
// // //           socket,
// // //           ok(msg.id, "AUTH", { sessionId: session.id, scopes: session.scopes })
// // //         );
// // //       }

// // //       if (!session) {
// // //         return send(
// // //           socket,
// // //           err(msg.id, msg.act, "AUTH_REQUIRED", "authenticate first")
// // //         );
// // //       }

// // //       // Dispatcher
// // //       const def = commands.get(msg.act);
// // //       if (!def)
// // //         return send(
// // //           socket,
// // //           err(msg.id, msg.act, "UNKNOWN_ACTION", "not implemented")
// // //         );

// // //       // Validación de payload con AJV
// // //       const validate = validators.get(msg.act);
// // //       const data = msg.data ?? {};
// // //       if (validate && !validate(data)) {
// // //         return send(
// // //           socket,
// // //           err(
// // //             msg.id,
// // //             msg.act,
// // //             "BAD_REQUEST",
// // //             "invalid payload",
// // //             formatAjvErrors(validate.errors)
// // //           )
// // //         );
// // //       }

// // //       // Autorización por scope
// // //       if (def.scope && !hasScope(session, def.scope)) {
// // //         return send(
// // //           socket,
// // //           err(msg.id, msg.act, "FORBIDDEN", `scope ${def.scope} required`)
// // //         );
// // //       }

// // //       try {
// // //         const result = await def.handler({ session, data, db, socket });
// // //         send(socket, ok(msg.id, msg.act, result ?? {}));
// // //         if (def.closeAfter) socket.end();
// // //       } catch (e) {
// // //         send(
// // //           socket,
// // //           err(msg.id, msg.act, "INTERNAL_ERROR", e?.message || "error")
// // //         );
// // //       }
// // //     });

// // //     socket.on("close", () => {
// // //       if (session) delete sessions[session.id];
// // //     });
// // //     socket.on("error", () => {});
// // //   });

// // //   server.listen(CONFIG.PORT, () => {
// // //     console.log(`Server listening on port ${CONFIG.PORT}`);
// // //   });
// // // }

// // // startServer();
