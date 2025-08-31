import { Framer } from "./codec.js";

export function send(socket, obj) {
  if (!socket._framer) {
    socket._framer = new Framer();
    socket._framer.pipe(socket);
  }
  socket._framer.write(obj);
}
