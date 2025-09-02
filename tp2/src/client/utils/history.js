import fs from "fs";
import os from "os";
const PATH = `${os.homedir()}/.agent_history`;

export function loadHistory() {
  try {
    if (fs.existsSync(PATH)) {
      return fs
        .readFileSync(PATH, "utf8")
        .split("\n")
        .filter(Boolean)
        .reverse();
    }
  } catch {}
  return [];
}

export function saveHistory(historyArray) {
  try {
    const unique = Array.from(new Set((historyArray || []).slice().reverse()));
    fs.writeFileSync(PATH, unique.join("\n") + "\n");
  } catch {}
}
