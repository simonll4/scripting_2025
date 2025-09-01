/**
 * ============================================================================
 * AGENT CLIENT - PROTOCOL-AWARE VERSION
 * ============================================================================
 *
 * Cliente del agente que hace uso completo del módulo de protocolo centralizado.
 * Implementa manejo de errores mejorado y validación de mensajes.
 */

import net from "net";
import readline from "readline";
import {
  MessageDeframer,
  MessageFramer,
} from "../server/utils/transport/transport.js";
import {
  PROTOCOL,
  makeRequest,
  validateMessageEnvelope,
  ErrorTemplates,
} from "../protocol/index.js";

class AgentClient {
  constructor(host = "127.0.0.1", port = 4000) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.deframer = null;
    this.framer = null;
    this.sessionId = null;
    this.nextId = 1;
    this.isAuthenticated = false;
    this.isConnected = false;

    this.setupReadline();
  }

  setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "agent> ",
    });

    this.rl.on("line", (line) => this.handleUserInput(line));
    this.rl.on("close", () => this.disconnect());
  }

  connect(token) {
    if (!token) {
      console.error("Token requerido para conectar");
      return;
    }

    this.token = token;
    this.socket = net.createConnection(
      {
        host: this.host,
        port: this.port,
      },
      () => {
        this.onConnected();
      }
    );

    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true, 15000);

    this.setupTransport();
    this.setupSocketHandlers();
  }

  setupTransport() {
    this.deframer = new MessageDeframer();
    this.framer = new MessageFramer();

    this.socket.pipe(this.deframer);
    this.framer.pipe(this.socket);

    this.deframer.on("data", (buf) => {
      try {
        const msg = JSON.parse(buf.toString("utf8"));
        this.handleMessage(msg);
      } catch (e) {
        console.error("Error parsing message:", e.message);
      }
    });
  }

  setupSocketHandlers() {
    this.socket.on("close", () => {
      this.isConnected = false;
      this.isAuthenticated = false;
      console.log("Conexión cerrada");
      process.exit(0);
    });

    this.socket.on("error", (e) => {
      console.error("Socket error:", e.message);
      process.exit(1);
    });
  }

  onConnected() {
    this.isConnected = true;
    console.log(`Conectado a ${this.host}:${this.port}`);
    console.log("Esperando saludo del servidor...");
  }

  send(action, data = null) {
    if (!this.isConnected) {
      console.error("No conectado al servidor");
      return null;
    }

    const id = `c${this.nextId++}`;
    const message = makeRequest(id, action, data);

    try {
      this.framer.write(message);
      return id;
    } catch (error) {
      console.error("Error enviando mensaje:", error.message);
      return null;
    }
  }

  handleMessage(msg) {
    try {
      // Validar estructura básica del mensaje
      this.validateMessage(msg);

      switch (msg.t) {
        case PROTOCOL.TYPES.HELLO:
          this.handleHello(msg);
          break;
        case PROTOCOL.TYPES.RES:
          this.handleResponse(msg);
          break;
        case PROTOCOL.TYPES.ERR:
          this.handleError(msg);
          break;
        default:
          console.warn(`Tipo de mensaje desconocido: ${msg.t}`);
      }
    } catch (error) {
      console.error("Error procesando mensaje:", error.message);
    }
  }

  validateMessage(msg) {
    if (!msg || typeof msg !== "object") {
      throw new Error("Mensaje inválido");
    }

    if (msg.v !== PROTOCOL.VERSION) {
      throw new Error(`Versión de protocolo no soportada: ${msg.v}`);
    }
  }

  handleHello(msg) {
    console.log("Saludo recibido del servidor");

    // Configurar heartbeat si viene especificado
    const heartbeat = msg.data?.heartbeat;
    if (typeof heartbeat === "number" && heartbeat > 0) {
      this.socket.setKeepAlive(true, heartbeat);
      console.log(`Heartbeat configurado: ${heartbeat}ms`);
    }

    // Proceder con autenticación
    console.log("Iniciando autenticación...");
    this.send(PROTOCOL.CORE_ACTS.AUTH, { token: this.token });
  }

  handleResponse(msg) {
    if (msg.act === PROTOCOL.CORE_ACTS.AUTH) {
      this.handleAuthResponse(msg);
    } else {
      this.handleGenericResponse(msg);
    }
  }

  handleAuthResponse(msg) {
    if (msg.data?.sessionId) {
      this.sessionId = msg.data.sessionId;
      this.isAuthenticated = true;
      console.log(`Autenticado exitosamente. Session ID: ${this.sessionId}`);
      this.rl.prompt();
    } else {
      console.error("Respuesta de autenticación inválida");
      this.disconnect();
    }
  }

  handleGenericResponse(msg) {
    console.log(`\\n=== Respuesta (${msg.act}) ===`);
    if (msg.data) {
      console.log(JSON.stringify(msg.data, null, 2));
    }
    console.log("========================\\n");
    this.rl.prompt();
  }

  handleError(msg) {
    const code = msg.code || "UNKNOWN_ERROR";
    const message = msg.msg || "Error desconocido";
    const action = msg.act || "unknown";

    console.error(`\\n❌ Error en ${action}`);
    console.error(`   Código: ${code}`);
    console.error(`   Mensaje: ${message}`);

    if (msg.details) {
      console.error(`   Detalles: ${JSON.stringify(msg.details)}`);
    }

    console.error("");

    // Si el error es de autenticación, desconectar
    if (
      code === PROTOCOL.ERROR_CODES.UNAUTHORIZED ||
      code === PROTOCOL.ERROR_CODES.INVALID_TOKEN
    ) {
      console.error("Error de autenticación. Desconectando...");
      this.disconnect();
      return;
    }

    this.rl.prompt();
  }

  handleUserInput(line) {
    const [cmd, ...args] = line.trim().split(/\\s+/);

    if (!cmd) {
      return this.rl.prompt();
    }

    if (!this.isAuthenticated && cmd !== "quit") {
      console.log("Debe estar autenticado para ejecutar comandos");
      return this.rl.prompt();
    }

    switch (cmd.toLowerCase()) {
      case "quit":
      case "exit":
        this.disconnect();
        break;

      case "ping":
        this.send(PROTOCOL.CORE_ACTS.PING);
        break;

      case "getosinfo":
        const seconds = parseInt(args[0] || "60", 10);
        if (isNaN(seconds) || seconds < 1) {
          console.log("Uso: getosinfo [segundos] (debe ser >= 1)");
        } else {
          this.send(PROTOCOL.CORE_ACTS.GET_OS_INFO, { seconds });
        }
        break;

      case "help":
        this.showHelp();
        break;

      default:
        console.log(
          `Comando desconocido: ${cmd}. Escriba 'help' para ver comandos disponibles.`
        );
    }

    this.rl.prompt();
  }

  showHelp() {
    console.log(`
Comandos disponibles:
  ping                    - Hacer ping al servidor
  getosinfo [segundos]    - Obtener información del OS (default: 60s)
  help                    - Mostrar esta ayuda
  quit, exit              - Desconectar y salir
    `);
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
    if (this.rl) {
      this.rl.close();
    }
  }
}

// Configuración y inicio del cliente
const token = process.argv[2] || process.env.AGENT_TOKEN;

if (!token) {
  console.error("Uso: node client-enhanced.js <token>");
  console.error("O establecer variable de entorno AGENT_TOKEN");
  process.exit(1);
}

const client = new AgentClient();
client.connect(token);
