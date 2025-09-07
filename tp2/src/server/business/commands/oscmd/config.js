export const OS_CMD_POLICY = {
  // cmd -> ruta absoluta
  binaries: {
    ls: "/bin/ls",
    cat: "/bin/cat",
    wc: "/usr/bin/wc",
    tail: "/usr/bin/tail",
    head: "/usr/bin/head",
    stat: "/usr/bin/stat",
  },
  // límites globales
  maxArgs: 32,
  maxArgLen: 512,
  timeoutMsDefault: 5000,
  timeoutMsMax: 60000,
};
