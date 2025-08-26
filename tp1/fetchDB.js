import fs from "fs";
import nodeFetch from "node-fetch";

let quantity = 3;
let page = 1;
let filePath = "./db.json";
const seed = "scripting2025"; // semilla fija

export function setQuantity(num) {
  quantity = num;
}
export function setPage(num) {
  page = num;
}

export function setFile(pathToFile) {
  filePath = pathToFile;
}

export async function fetch() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }

  const currentUsers = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const url = `https://randomuser.me/api/?results=${quantity}&page=${page}&seed=${seed}`;

  try {
    const res = await nodeFetch(url);

    if (!res.ok) {
      throw new Error(`Error en API: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    const newUsers = json.results;

    // Filtrar usuarios que ya existen (evitar duplicados)
    const currentUsersIds = new Set(
      currentUsers.map((user) => user.login.uuid)
    );

    const uniqueUsers = newUsers.filter(
      (user) => !currentUsersIds.has(user.login.uuid)
    );

    if (uniqueUsers.length === 0) {
      console.warn(
        `los usuarios de la página ${page} ya existen en ${filePath}`
      );
      return;
    }

    // Append solo usuarios unicos
    const actualizados = [...currentUsers, ...uniqueUsers];
    fs.writeFileSync(filePath, JSON.stringify(actualizados, null, 2));

    console.log(
      `Guardados ${
        uniqueUsers.length
      } usuarios unicos en ${filePath} (pagina ${page}, se omitieron ${
        newUsers.length - uniqueUsers.length
      } duplicados)`
    );
  } catch (error) {
    console.error(`Error al obtener usuarios: ${error.message}`);
    throw error;
  }
}
