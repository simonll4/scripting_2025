export const clear = {
  name: "clear",
  desc: "Limpiar la pantalla de la consola",
  usage: "clear",
  local: true,
  run() {
    // Limpiar pantalla usando secuencias ANSI
    process.stdout.write('\x1b[2J\x1b[0f');
  },
};
