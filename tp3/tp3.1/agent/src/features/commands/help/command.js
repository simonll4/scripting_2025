import { listCommands } from "../index.js";

export async function handleHelp(/* args */) {
  const listado = listCommands().map(({ name, description }) => ({
    command: name,
    description: description || "",
  }));
  return { message: "OK", result: listado };
}
