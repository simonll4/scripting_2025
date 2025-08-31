#!/usr/bin/env node
import net from "net";
import readline from "readline";
import { EventEmitter } from "events";
import { MessageDeframer, MessageFramer, PROTOCOL } from "../server/utils/index.js";

const HOST = "127.0.0.1";
const PORT = 4000;

const token = process.argv[2] || process.env.AGENT_TOKEN;
if (!token) {
  console.error("Uso: node client.js <token>");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "agent> ",
});

const socket = net.createConnection({ host: HOST, port: PORT }, () => {
  console.log("Conectado:", HOST, PORT);
});
socket.setNoDelay(true);
// Keep-Alive inicial por si el HELLO no trae heartbeat
socket.setKeepAlive(true, 15000);

const deframer = new MessageDeframer();
const framer = new MessageFramer();
socket.pipe(deframer);
framer.pipe(socket);

let sessionId = null;
let nextId = 1;

function send(act, data) {
  const id = `c${nextId++}`;
  framer.write({ v: PROTOCOL.VERSION, t: PROTOCOL.TYPES.REQ, id, act, data });
  return id;
}

deframer.on("data", (buf) => {
  let msg;
  try {
    msg = JSON.parse(buf.toString("utf8"));
  } catch (e) {
    console.error("Respuesta no-JSON del servidor:", e.message);
    return;
  }

  if (msg.t === PROTOCOL.TYPES.HELLO) {
    // Ajustar TCP keep-alive al heartbeat anunciado por el server, si viene
    const hb = msg.data?.heartbeat;
    if (typeof hb === "number" && hb > 0) {
      socket.setKeepAlive(true, hb);
    }
    // Autenticación
    send(PROTOCOL.CORE_ACTS.AUTH, { token });
    return;
  }

  if (
    msg.t === PROTOCOL.TYPES.RES &&
    msg.act === PROTOCOL.CORE_ACTS.AUTH &&
    msg.data?.sessionId
  ) {
    sessionId = msg.data.sessionId;
    console.log("Autenticado. sessionId:", sessionId);
    rl.prompt();
    return;
  }

  if (msg.t === PROTOCOL.TYPES.ERR) {
    // Mostrar información útil de error si existe
    const code = msg.err?.code || msg.code || "ERR";
    const message = msg.err?.message || msg.msg || "error";
    console.error(`Error (${code}): ${message}`);
    return;
  }

  console.log("Respuesta:", JSON.stringify(msg, null, 2));
});

socket.on("close", () => {
  console.log("Conexión cerrada");
  process.exit(0);
});

socket.on("error", (e) => {
  console.error("Socket error:", e.message);
  process.exit(1);
});

rl.on("line", (line) => {
  const [cmd, ...args] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();

  if (cmd === "quit") {
    // Cierre limpio del lado cliente (sin comando QUIT del protocolo)
    rl.close();
    socket.end();
    return;
  }

  if (cmd === "getosinfo") {
    const seconds = parseInt(args[0] ?? "60", 10);
    send(PROTOCOL.CORE_ACTS.GET_OS_INFO, { seconds });
    rl.prompt();
    return;
  }

  console.log("Comando desconocido");
  rl.prompt();
});

// TODO: Legacy client implementations - Old versions - Not used anymore
// These are previous iterations of the client code before the current implementation
// Could be removed entirely to clean up the file

// #!/usr/bin/env node
// import net from "net";
// import readline from "readline";
// import { Deframer, Framer } from "./transport/codec.js";
// import { PROTOCOL } from "./protocol/standard.js";

// const HOST = "127.0.0.1";
// const PORT = 4000;

// const token = process.argv[2] || process.env.AGENT_TOKEN;
// if (!token) {
//   console.error("Uso: node client.js <token>");
//   process.exit(1);
// }

// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout,
//   prompt: "agent> ",
// });
// const socket = net.createConnection({ host: HOST, port: PORT }, () =>
//   console.log("Conectado:", HOST, PORT)
// );
// socket.setNoDelay(true);

// const deframer = new Deframer();
// const framer = new Framer();
// socket.pipe(deframer);
// framer.pipe(socket);

// let sessionId = null;
// let nextId = 1;

// function send(act, data) {
//   const id = `c${nextId++}`;
//   framer.write({ v: PROTOCOL.VERSION, t: PROTOCOL.TYPES.REQ, id, act, data });
//   return id;
// }

// deframer.on("data", (buf) => {
//   const msg = JSON.parse(buf.toString("utf8"));
//   if (msg.t === PROTOCOL.TYPES.HELLO) {
//     // responder AUTH
//     send(PROTOCOL.CORE_ACTS.AUTH, { token });
//     return;
//   }
//   if (msg.t === PROTOCOL.TYPES.RES && msg.act === PROTOCOL.CORE_ACTS.AUTH && msg.data?.sessionId) {
//     sessionId = msg.data.sessionId;
//     console.log("Autenticado. sessionId:", sessionId);
//     rl.prompt();
//     return;
//   }
//   if (msg.t === PROTOCOL.TYPES.ERR) {
//     console.error("Error:", msg.code, msg.msg);
//     return;
//   }
//   console.log("Respuesta:", JSON.stringify(msg, null, 2));
// });

// socket.on("close", () => {
//   console.log("Conexión cerrada");
//   process.exit(0);
// });
// socket.on("error", (e) => {
//   console.error("Socket error:", e.message);
//   process.exit(1);
// });

// rl.on("line", (line) => {
//   const [cmd, ...args] = line.trim().split(/\s+/);
//   if (!cmd) return rl.prompt();

//   if (cmd === "quit") {
//     send(PROTOCOL.CORE_ACTS.QUIT);
//     rl.close();
//     return;
//   }
//   if (cmd === "ping") {
//     send(PROTOCOL.CORE_ACTS.PING);
//     rl.prompt();
//     return;
//   }
//   if (cmd === "getosinfo") {
//     const seconds = parseInt(args[0] ?? "60");
//     send(PROTOCOL.CORE_ACTS.GET_OS_INFO, { seconds });
//     rl.prompt();
//     return;
//   }
//   console.log("Comando desconocido");
//   rl.prompt();
// });

// // #!/usr/bin/env node
// // import net from "net";
// // import readline from "readline";

// // const HOST = "127.0.0.1";
// // const PORT = 4000;

// // // Obtenemos el token desde argumento CLI o env
// // const token = process.argv[2] || process.env.AGENT_TOKEN;
// // if (!token) {
// //   console.error(
// //     "Debes pasar un token como argumento: node client.js <token>"
// //   );
// //   process.exit(1);
// // }

// // // readline para modo interactivo
// // const rl = readline.createInterface({
// //   input: process.stdin,
// //   output: process.stdout,
// //   prompt: "agent> ",
// // });

// // const socket = net.createConnection({ host: HOST, port: PORT }, () => {
// //   console.log("Conectado al agente en", HOST, PORT);
// // });

// // // buffer para manejar mensajes JSON por línea
// // let buffer = "";

// // socket.on("data", (data) => {
// //   buffer += data.toString();
// //   let parts = buffer.split("\n");
// //   buffer = parts.pop();
// //   for (const part of parts) {
// //     if (!part.trim()) continue;
// //     try {
// //       const msg = JSON.parse(part);
// //       if (msg.msg === "auth_required") {
// //         socket.write(JSON.stringify({ auth: { token } }) + "\n");
// //       } else if (msg.ok && msg.sessionId) {
// //         console.log("Autenticado. Session:", msg.sessionId);
// //         rl.prompt();
// //       } else if (msg.err) {
// //         console.error("Error:", msg.err);
// //       } else {
// //         console.log("Respuesta:", JSON.stringify(msg, null, 2));
// //       }
// //     } catch (e) {
// //       console.error("Respuesta no válida:", part);
// //     }
// //   }
// // });

// // socket.on("close", () => {
// //   console.log("Conexión cerrada");
// //   process.exit(0);
// // });

// // socket.on("error", (err) => {
// //   console.error("Error de conexión:", err.message);
// //   process.exit(1);
// // });

// // // manejo de input interactivo
// // rl.on("line", (line) => {
// //   line = line.trim();
// //   if (!line) {
// //     rl.prompt();
// //     return;
// //   }

// //   if (line === "quit") {
// //     socket.write(JSON.stringify({ command: "quit" }) + "\n");
// //     rl.close();
// //     return;
// //   }

// //   // parseamos: "comando arg1 arg2 ..."
// //   const [cmd, ...args] = line.split(" ");

// //   if (cmd === "getosinfo") {
// //     socket.write(JSON.stringify({ command: "getosinfo" }) + "\n");
// //   } else {
// //     console.log("Comando desconocido:", cmd);
// //   }

// //   rl.prompt();
// // });
