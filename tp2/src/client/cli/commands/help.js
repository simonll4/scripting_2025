const COMMAND_INFO = {
  help: { desc: "Mostrar ayuda", usage: "help [cmd]", local: true },
  quit: { desc: "Desconectar y salir", usage: "quit", local: false },
  getosinfo: {
    desc: "Obtener información del sistema operativo",
    usage: "getosinfo [segundos=60]",
    local: false,
  },
  watch: {
    desc: "Iniciar monitoreo de un directorio o archivo",
    usage: "watch <path> [tiempo=60]",
    local: false,
  },
  getwatches: {
    desc: "Obtener eventos del monitoreo activo",
    usage: "getwatches <token>",
    local: false,
  },
  ps: {
    desc: "Listar procesos del sistema remoto",
    usage: "ps",
    local: false,
  },
  oscmd: {
    desc: "Ejecutar comando del sistema operativo remoto",
    usage: "oscmd <comando> [argumentos...]",
    local: false,
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
      console.log(`\n${cmd} - ${c.desc}\nUso: ${c.usage}\n`);
    } else {
      console.log("\nComandos disponibles:");
      Object.entries(COMMAND_INFO).forEach(([name, c]) => {
        const type = c.local ? "[local]" : "[servidor]";
        console.log(`  ${name.padEnd(12)} ${type.padEnd(10)} ${c.desc}`);
        console.log(`  ${" ".repeat(12)} ${" ".repeat(10)} Uso: ${c.usage}`);
      });
      console.log("");
    }
  },
};
