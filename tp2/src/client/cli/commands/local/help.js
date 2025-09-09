const COMMAND_INFO = {
  help: { 
    desc: "Mostrar información de ayuda y uso de comandos", 
    usage: "help [comando]", 
    local: true,
    examples: ["help", "help ps", "help oscmd"],
    details: "Muestra la lista completa de comandos disponibles o información detallada de un comando específico."
  },
  clear: {
    desc: "Limpiar la pantalla de la consola",
    usage: "clear",
    local: true,
    examples: ["clear"],
    details: "Borra todo el contenido visible en la consola para tener una vista limpia."
  },
  status: {
    desc: "Mostrar información de conexión y estado del cliente",
    usage: "status", 
    local: true,
    examples: ["status"],
    details: "Muestra información detallada sobre el estado de la conexión, autenticación, configuración y cola de mensajes del cliente."
  },
  quit: { 
    desc: "Cerrar conexión con el servidor y salir del cliente", 
    usage: "quit", 
    local: false,
    examples: ["quit"],
    details: "Envía una solicitud de desconexión al servidor y termina la sesión del cliente de forma limpia."
  },
  getosinfo: {
    desc: "Obtener métricas de rendimiento del sistema remoto",
    usage: "getosinfo [segundos]",
    local: false,
    examples: ["getosinfo", "getosinfo 30", "getosinfo 300"],
    details: "Recupera información de CPU y memoria de los últimos N segundos (por defecto 60, máximo 3600). Incluye porcentaje de uso de CPU, memoria usada en bytes y porcentaje de memoria utilizada.",
    params: {
      "segundos": "Número de segundos históricos a consultar (1-3600, por defecto: 60)"
    }
  },
  watch: {
    desc: "Iniciar monitoreo de cambios en archivos/directorios",
    usage: "watch <ruta> [segundos]",
    local: false,
    examples: ["watch /home/user/docs", "watch /var/log 120", "watch /etc/nginx.conf"],
    details: "Inicia el monitoreo de un archivo o directorio específico por un tiempo determinado. Devuelve un token que se usa con 'getwatches' para obtener los eventos.",
    params: {
      "ruta": "Ruta absoluta del archivo o directorio a monitorear (requerido)",
      "segundos": "Duración del monitoreo en segundos (por defecto: 60, máximo: 3600)"
    }
  },
  getwatches: {
    desc: "Obtener eventos de monitoreo de archivos/directorios",
    usage: "getwatches <token> [opciones]",
    local: false,
    examples: [
      "getwatches abc123token", 
      "getwatches abc123token --since 1640995200000",
      "getwatches abc123token --page-size 50 --order desc"
    ],
    details: "Recupera los eventos registrados para un token de monitoreo específico. Soporta filtrado temporal y paginación.",
    params: {
      "token": "Token de monitoreo obtenido del comando 'watch' (requerido)",
      "--since": "Timestamp en milisegundos desde cuando obtener eventos",
      "--until": "Timestamp en milisegundos hasta cuando obtener eventos", 
      "--page-size": "Número de eventos por página (1-20000, por defecto: 1000)",
      "--order": "Orden de los eventos: 'asc' o 'desc' (por defecto: 'asc')",
      "--cursor": "Cursor de paginación para obtener la siguiente página"
    }
  },
  ps: {
    desc: "Listar y filtrar procesos del sistema remoto",
    usage: "ps [opciones]",
    local: false,
    examples: [
      "ps",
      "ps --limit 50 --sort cpu --order desc",
      "ps --user root --pattern nginx",
      "ps --fields pid,name,cpuPercent,memRssBytes"
    ],
    details: "Lista los procesos en ejecución del sistema remoto con capacidades avanzadas de filtrado, ordenamiento y proyección de campos.",
    params: {
      "--limit": "Número máximo de procesos a mostrar (1-1000, por defecto: 100)",
      "--sort": "Campo para ordenar: 'cpu', 'mem', 'pid', 'name' (por defecto: 'cpu')",
      "--order": "Orden: 'asc' o 'desc' (por defecto: 'desc')",
      "--user": "Filtrar por nombre de usuario específico",
      "--pattern": "Expresión regular para filtrar por nombre de proceso o comando",
      "--fields": "Campos específicos a mostrar separados por comas (opcional)"
    }
  },
  oscmd: {
    desc: "Ejecutar comandos del sistema operativo en el servidor remoto",
    usage: "oscmd <comando> [argumentos] [--timeout <ms>]",
    local: false,
    examples: [
      "oscmd ls -la",
      "oscmd ps aux --timeout 5000",
      "oscmd cat /etc/hostname",
      "oscmd find /tmp -name '*.log' --timeout 15000",
      "oscmd 'df -h' --timeout 3000"
    ],
    details: "Ejecuta comandos del sistema operativo en el servidor remoto de forma segura. Los comandos complejos con espacios deben ir entre comillas. El servidor tiene políticas de seguridad que pueden restringir ciertos comandos peligrosos.",
    params: {
      "<comando>": "Comando base a ejecutar (requerido). Ej: 'ls', 'ps', 'cat'",
      "[argumentos]": "Argumentos y flags del comando (opcional). Ej: '-la', 'aux', '/etc/hostname'",
      "--timeout <ms>": "Tiempo límite de ejecución en milisegundos (opcional, rango: 1000-60000, por defecto: 10000)"
    }
  },
};

export const help = {
  name: "help",
  desc: "Mostrar ayuda",
  usage: "help [cmd]",
  local: true,
  run(ctx, [cmd]) {
    if (cmd && COMMAND_INFO[cmd]) {
      const c = COMMAND_INFO[cmd];
      
      console.log(`\n${"=".repeat(60)}`);
      console.log(`COMANDO: ${cmd.toUpperCase()}`);
      console.log(`${"=".repeat(60)}`);
      console.log(`\nDescripción:`);
      console.log(`   ${c.desc}`);
      
      console.log(`\nUso:`);
      console.log(`   ${c.usage}`);
      
      if (c.details) {
        console.log(`\nDetalles:`);
        console.log(`   ${c.details}`);
      }
      
      if (c.params && Object.keys(c.params).length > 0) {
        console.log(`\nParámetros:`);
        Object.entries(c.params).forEach(([param, desc]) => {
          console.log(`   ${param.padEnd(15)} - ${desc}`);
        });
      }
      
      if (c.examples && c.examples.length > 0) {
        console.log(`\nEjemplos:`);
        c.examples.forEach((example, index) => {
          console.log(`   ${index + 1}. ${example}`);
        });
      }
      
      const type = c.local ? "Local" : "Remoto";
      console.log(`\nTipo: ${type}`);
      console.log(`${"=".repeat(60)}\n`);
      
    } else {
      // Mostrar lista de comandos
      console.log(`\n${"=".repeat(70)}`);
      console.log(`CLIENTE AGENTE - COMANDOS DISPONIBLES`);
      console.log(`${"=".repeat(70)}`);
      
      const localCommands = [];
      const remoteCommands = [];
      
      Object.entries(COMMAND_INFO).forEach(([name, info]) => {
        if (info.local) {
          localCommands.push({name, info});
        } else {
          remoteCommands.push({name, info});
        }
      });
      
      if (localCommands.length > 0) {
        console.log(`\nCOMANDOS LOCALES:`);
        console.log(`${"-".repeat(50)}`);
        localCommands.forEach(({name, info}) => {
          console.log(`   ${name.padEnd(12)} - ${info.desc}`);
          console.log(`   ${" ".repeat(12)}   Uso: ${info.usage}`);
        });
      }
      
      if (remoteCommands.length > 0) {
        console.log(`\nCOMANDOS REMOTOS (Servidor):`);
        console.log(`${"-".repeat(50)}`);
        remoteCommands.forEach(({name, info}) => {
          console.log(`   ${name.padEnd(12)} - ${info.desc}`);
          console.log(`   ${" ".repeat(12)}   Uso: ${info.usage}`);
        });
      }
      
      console.log(`\nPara obtener ayuda detallada: help <comando>`);
      console.log(`   Ejemplo: help ps`);
      console.log(`${"=".repeat(70)}\n`);
    }
  },
};
