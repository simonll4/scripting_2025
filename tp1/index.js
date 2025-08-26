/**
 * GENERADOR DE USUARIOS ALEATORIOS
 * ================================
 *
 * Este programa obtiene usuarios aleatorios de la API randomuser.me y los guarda
 * en un archivo JSON local, evitando duplicados basados en el UUID del usuario.
 *
 * COMO EJECUTAR:
 * node index.js [opciones]
 *
 * PARAMETROS DISPONIBLES:
 * -c <numero>    : Cantidad de usuarios a obtener por página (default: 3)
 * -f <archivo>   : Archivo donde guardar los usuarios (default: ./db.json)
 * -p <numero>    : Número de página de la API a consultar (default: 1)
 *
 * EJEMPLOS DE USO:
 * node index.js                           // Obtiene 3 usuarios de la página 1
 * node index.js -c 10                     // Obtiene 10 usuarios de la página 1
 * node index.js -p 2 -c 5                 // Obtiene 5 usuarios de la página 2
 * node index.js -f usuarios.json -c 7     // Guarda 7 usuarios en usuarios.json
 * node index.js -p 3 -c 8 -f data.json   // Página 3, 8 usuarios, archivo data.json
 */

import { setPage, setFile, setQuantity, fetch } from "./fetchDB.js";

const args = process.argv.slice(2);

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-c" && args[i + 1]) {
    setQuantity(parseInt(args[i + 1], 10));
  }
  if (args[i] === "-f" && args[i + 1]) {
    setFile(args[i + 1]);
  }
  if (args[i] === "-p" && args[i + 1]) {
    setPage(parseInt(args[i + 1], 10));
  }
}

try {
  await fetch();
} catch (error) {
  console.error(`${error.message}`);
  process.exit(1);
}
