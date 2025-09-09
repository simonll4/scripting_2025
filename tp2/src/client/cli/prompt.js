import readline from "readline";
import { COMMANDS } from "./commands/index.js";
import { logger } from "../utils/logger.js";
import { loadHistory, saveHistory } from "../utils/history.js";
import { formatResponse, formatLatencyInfo } from "../utils/formatter.js";

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
      prompt: "\x1b[36magent\x1b[0m\x1b[1m❯\x1b[0m ",
      historySize: 1000,
      terminal: true,
      completer: this._createCommandCompleter(),
    });
  }

  _createCommandCompleter() {
    return (line) => {
      const words = line.split(' ');
      const commandNames = Object.keys(COMMANDS);
      
      if (words.length === 1) {
        // Completar nombre de comando
        const matches = commandNames.filter((cmd) => cmd.startsWith(line));
        return [matches.length ? matches : commandNames, line];
      } else {
        // Sugerir parámetros comunes para comandos específicos
        const commandName = words[0];
        const lastWord = words[words.length - 1];
        const suggestions = [];
        
        switch (commandName) {
          case 'ps':
            const psOptions = ['--limit', '--sort', '--order', '--user', '--pattern', '--fields'];
            suggestions.push(...psOptions.filter(opt => opt.startsWith(lastWord)));
            break;
          case 'oscmd':
            if (lastWord === '--timeout') {
              suggestions.push('5000', '10000', '15000');
            } else if (!lastWord.startsWith('--')) {
              suggestions.push('--timeout');
            }
            break;
          case 'getwatches':
            const gwOptions = ['--since', '--until', '--page-size', '--order', '--cursor'];
            suggestions.push(...gwOptions.filter(opt => opt.startsWith(lastWord)));
            break;
          case 'getosinfo':
            if (!isNaN(lastWord) || lastWord === '') {
              suggestions.push('30', '60', '120', '300', '600');
            }
            break;
        }
        
        return [suggestions, lastWord];
      }
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
      try {
        const formattedError = formatResponse(error);
        console.log(formattedError);
        
        const latencyInfo = formatLatencyInfo(error);
        if (latencyInfo) {
          console.log(latencyInfo);
        }
      } catch (formattingError) {
        // Fallback para errores de formateo
        console.log(`Error del servidor: ${error.msg || error.message || 'Error desconocido'}`);
        if (error.code) console.log(`   Código: ${error.code}`);
        if (error.details) console.log(`   Detalles: ${JSON.stringify(error.details, null, 2)}`);
      }
      
      console.log(""); // Línea en blanco
      this._showPrompt();
    };

    // Desconexión
    this.client.onDisconnected = () => {
      console.log(`\n\x1b[36m${"=".repeat(60)}\x1b[0m`);
      console.log(`\x1b[1mCONEXIÓN CERRADA\x1b[0m`);
      console.log(`\x1b[36m${"=".repeat(60)}\x1b[0m`);
      console.log(`\nLa conexión con el servidor se ha cerrado`);
      console.log(`Saliendo del cliente...`);
      console.log(`\x1b[36m${"=".repeat(60)}\x1b[0m\n`);
      this.shutdown();
    };
  }

  _showWelcomeMessage() {
    const line = "=".repeat(50);
    console.log(`
\x1b[36m${line}\x1b[0m
\x1b[1mCONECTADO AL SERVIDOR\x1b[0m
\x1b[36m${line}\x1b[0m

Escriba '\x1b[33mhelp\x1b[0m' para ver comandos disponibles
Use '\x1b[33mhelp <comando>\x1b[0m' para ayuda detallada

\x1b[36m${line}\x1b[0m
`);
  }

  _displayServerResponse(message) {
    try {
      // Usar el nuevo sistema de formateo avanzado
      const formattedResponse = formatResponse(message);
      console.log(formattedResponse);
      
      // Mostrar información de latencia si está disponible
      const latencyInfo = formatLatencyInfo(message);
      if (latencyInfo) {
        console.log(latencyInfo);
      }
      
    } catch (error) {
      // Fallback al formato básico si el formateador falla
      logger.warn('Error formateando respuesta, usando formato básico', { error: error.message });
      
      const data = message.data;
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
      console.log(`\n\n\x1b[36m${"=".repeat(40)}\x1b[0m`);
      console.log(`\x1b[1mINTERRUPCIÓN DETECTADA\x1b[0m`);
      console.log(`\x1b[36m${"=".repeat(40)}\x1b[0m`);
      console.log(`\nCerrando cliente de forma segura...`);
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
      console.log(`\n\x1b[31mComando desconocido:\x1b[0m '\x1b[33m${commandName}\x1b[0m'`);
      console.log(`Use '\x1b[32mhelp\x1b[0m' para ver comandos disponibles`);
      console.log("");
      return this._showPrompt();
    }

    // Ejecutar comando
    try {
      await this._executeCommand(command, commandName, args);
    } catch (error) {
      console.log(`\n\x1b[31mError ejecutando comando '\x1b[33m${commandName}\x1b[31m':\x1b[0m`);
      console.log(`   \x1b[33m${error.message}\x1b[0m`);
      console.log("");
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
      throw new Error("No se pudo enviar el comando al servidor. Verifique la conexión.");
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
