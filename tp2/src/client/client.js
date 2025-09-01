import net from "net";
import readline from "readline";
import {
  MessageDeframer,
  MessageFramer,
} from "../server/utils/transport/transport.js";
import { PROTOCOL, makeRequest } from "../protocol/index.js";

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
  const message = makeRequest(id, act, data);
  framer.write(message);
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
