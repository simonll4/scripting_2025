import readline from "readline";
import { COMMANDS } from "./commands/index.js";
import { logger } from "../utils/logger.js";
import { loadHistory, saveHistory } from "../utils/history.js";

/**
 * Interfaz de línea de comandos interactiva para el cliente.
 * Maneja el prompt, autocompletado, historial y ejecución de comandos.
 */
export class Prompt {
  constructor(client) {
    this.client = client;
    this.rl = null;
    this.isShuttingDown = false;
  }

  // ============================================================================
  // API PÚBLICA
  // ============================================================================

  start() {
    this._createReadlineInterface();
    this._loadCommandHistory();
    this._setupClientEventHandlers();
    this._setupReadlineEventHandlers();

    // Mostrar prompt inicial
    this.rl.prompt();
  }

  shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this._saveCommandHistory();
    this._disconnectClient();

    process.exit(0);
  }

  // ============================================================================
  // CONFIGURACIÓN INICIAL
  // ============================================================================

  _createReadlineInterface() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "agent> ",
      historySize: 1000,
      terminal: true,
      completer: this._createCommandCompleter(),
    });
  }

  _createCommandCompleter() {
    return (line) => {
      const commandNames = Object.keys(COMMANDS);
      const matches = commandNames.filter((cmd) => cmd.startsWith(line));

      // Si hay coincidencias, mostrarlas; si no, mostrar todos los comandos
      return [matches.length ? matches : commandNames, line];
    };
  }

  _loadCommandHistory() {
    try {
      this.rl.history = loadHistory();
    } catch (error) {
      // Ignorar errores al cargar historial
    }
  }

  // ============================================================================
  // MANEJO DE EVENTOS DEL CLIENTE
  // ============================================================================

  _setupClientEventHandlers() {
    // Autenticación exitosa
    this.client.onAuthenticated = (sessionId) => {
      this._showWelcomeMessage();
      this._showPrompt();
    };

    // Respuesta del servidor
    this.client.onResponse = (message) => {
      this._displayServerResponse(message);
      this._showPrompt();
    };

    // Error del servidor
    this.client.onError = (error) => {
      // El error ya se loggea en el cliente, solo mostrar prompt
      this._showPrompt();
    };

    // Desconexión
    this.client.onDisconnected = () => {
      console.log("\nConexión cerrada por el servidor.");
      this.shutdown();
    };
  }

  _showWelcomeMessage() {
    console.log(`
Cliente del Agente
Autenticación OK | Escriba 'help' para ver comandos.
`);
  }

  _displayServerResponse(message) {
    const data = message.data;

    // Formato especial para respuestas de oscmd
    if (data && typeof data === "object" && 
        ('ok' in data || 'exitCode' in data || 'stdout' in data || 'stderr' in data)) {
      
      if (data.error) {
        console.log(`❌ Error: ${data.error}`);
        if (data.message) console.log(`   ${data.message}`);
      } else if (data.ok === false) {
        console.log(`❌ Command failed (exit code: ${data.exitCode || 'unknown'})`);
        if (data.timedOut) console.log(`   ⏱️  Command timed out`);
        if (data.stderr) {
          console.log(`   stderr: ${data.stderr.trim()}`);
        }
        if (data.stdout) {
          console.log(`   stdout: ${data.stdout.trim()}`);
        }
      } else if (data.ok === true) {
        console.log(`✅ Command executed successfully (exit code: ${data.exitCode})`);
        if (data.stdout) {
          console.log(''); // Línea en blanco
          console.log(data.stdout.trim());
        }
        if (data.stderr && data.stderr.trim()) {
          console.log(''); // Línea en blanco
          console.log(`stderr: ${data.stderr.trim()}`);
        }
      } else {
        // Fallback para otras respuestas estructuradas
        console.log(JSON.stringify(data, null, 2));
      }
    } else {
      // Para otros tipos de respuestas
      if (data && typeof data === "object") {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(data ?? "(sin datos)");
      }
    }

    console.log(""); // Línea en blanco para separación
  }

  _showPrompt() {
    if (this.rl && !this.isShuttingDown) {
      this.rl.prompt();
    }
  }

  // ============================================================================
  // MANEJO DE EVENTOS DE READLINE
  // ============================================================================

  _setupReadlineEventHandlers() {
    this.rl.on("line", (line) => this._handleUserInput(line));
    this.rl.on("close", () => this.shutdown());

    // Manejo de Ctrl+C
    this.rl.on("SIGINT", () => {
      console.log("\n\nSaliendo...");
      this.shutdown();
    });
  }

  async _handleUserInput(line) {
    const input = line.trim();

    // Ignorar líneas vacías
    if (!input) {
      return this._showPrompt();
    }

    // Parsear comando y argumentos
    const [commandName, ...args] = input.split(/\s+/);
    const command = COMMANDS[commandName];

    // Validar que el comando existe
    if (!command) {
      logger.error(
        `Comando desconocido: '${commandName}'. Usa 'help' para ver comandos disponibles.`
      );
      return this._showPrompt();
    }

    // Ejecutar comando
    try {
      await this._executeCommand(command, commandName, args);
    } catch (error) {
      logger.error(`Error ejecutando comando '${commandName}'`, {
        error: error.message,
      });
      this._showPrompt();
    }
  }

  async _executeCommand(command, commandName, args) {
    if (command.local) {
      // Comando local - ejecutar inmediatamente
      await this._executeLocalCommand(command, args);
      this._showPrompt();
    } else {
      // Comando remoto - enviar al servidor
      await this._executeRemoteCommand(command, commandName, args);
      // El prompt se mostrará cuando llegue la respuesta
    }
  }

  async _executeLocalCommand(command, args) {
    if (typeof command.run === "function") {
      command.run(this, args);
    } else {
      throw new Error("Comando local malformado: falta función 'run'");
    }
  }

  async _executeRemoteCommand(command, commandName, args) {
    // Construir payload si el comando lo requiere
    let payload = null;

    if (typeof command.build === "function") {
      payload = command.build(args);
    }

    // Validar que el comando tiene una acción definida
    if (!command.action) {
      throw new Error(`Comando '${commandName}' no tiene acción definida`);
    }

    // Enviar al servidor
    const requestId = this.client.send(command.action, payload);

    if (!requestId) {
      throw new Error("Falló el envío del comando al servidor");
    }
  }

  // ============================================================================
  // LIMPIEZA Y CIERRE
  // ============================================================================

  _saveCommandHistory() {
    try {
      const history = this.rl?.history || [];
      saveHistory(history);
    } catch (error) {
      // Ignorar errores al guardar historial
    }
  }

  _disconnectClient() {
    try {
      this.client.disconnect();
    } catch (error) {
      // Ignorar errores al desconectar
    }
  }
}
