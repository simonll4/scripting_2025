export const OS_CMD_POLICY = {
  // Whitelist de binarios (claves lógicas -> ruta absoluta)
  binaries: {
    ls: "/bin/ls",
    cat: "/bin/cat",
    wc: "/usr/bin/wc",
    tail: "/usr/bin/tail",
    head: "/usr/bin/head",
    stat: "/usr/bin/stat",
    pwd: "/usr/bin/pwd",
    touch: "/usr/bin/touch",
    mkdir: "/usr/bin/mkdir",
  },

  // *** Raíz lógica y encierro de rutas ***
  baseDir: "/home/simonll4",
  allowedRoots: ["/home/simonll4"],

  // Límites globales
  maxArgs: 32,
  maxArgLen: 512,
  timeoutMsDefault: 5000,
  timeoutMsMax: 60000,

  // Política global de caracteres permitidos en args (flags/paths/valores):
  // Letras/números, _ - . / : @ % + , espacios
  // Evita comillas, ;, |, &, $, `, \n, etc. (no usamos shell, pero reducimos superficie)
  argRegex: String.raw`^[\w\-./:@%+, ]*$`,

  // Allowlist por comando (flags permitidos y cuáles consumen valor)
  perCommand: {
    ls: {
      allowFlags: ["-a", "-l", "-h", "-1", "-t", "-r", "-S", "-R", "--"],
      flagsWithValue: [],
    },
    cat: {
      allowFlags: ["-n", "-b", "-s", "--"],
      flagsWithValue: [],
    },
    tail: {
      allowFlags: ["-n", "-c", "--"],
      flagsWithValue: ["-n", "-c"],
    },
    head: {
      allowFlags: ["-n", "-c", "--"],
      flagsWithValue: ["-n", "-c"],
    },
    wc: {
      allowFlags: ["-l", "-w", "-c", "-m", "--"],
      flagsWithValue: [],
    },
    stat: {
      allowFlags: ["-c", "--"],
      flagsWithValue: ["-c"],
    },
    pwd: {
      allowFlags: ["-L", "-P", "--"],
      flagsWithValue: [],
      touch: {
        allowFlags: ["-a", "-m", "-c", "-h", "-d", "-t", "--"],
        flagsWithValue: ["-d", "-t"],
      },

      mkdir: {
        allowFlags: ["-p", "-v", "-m", "--"],
        flagsWithValue: ["-m"],
      },
    },
  },
};
