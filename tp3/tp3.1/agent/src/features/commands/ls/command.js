import fs from "node:fs/promises";
import path from "node:path";
import { loadAgentConfig } from "../../../config/index.js";

const cfg = loadAgentConfig();
const ROOT = path.resolve(cfg.agent.root_dir || ".");

export async function handleLs(args = {}) {
  const requested = (args.path || ".").trim();
  let resolved;

  if (requested === "." || requested === "") {
    resolved = ROOT;
  } else if (path.isAbsolute(requested)) {
    resolved = path.resolve(requested);
    if (!resolved.startsWith(ROOT)) {
      return {
        code: "EACCES",
        message: "Access denied: path outside allowed directory",
        result: false,
      };
    }
  } else {
    resolved = path.resolve(ROOT, requested);
    if (!resolved.startsWith(ROOT)) {
      return {
        code: "EACCES",
        message: "Access denied: path outside allowed directory",
        result: false,
      };
    }
  }

  try {
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const result = entries.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "folder" : "file",
    }));
    return {
      message: "OK",
      result,
      path: requested === "." ? cfg.agent.root_dir : requested,
    };
  } catch (e) {
    if (e.code === "ENOENT")
      return { code: "ENOENT", message: "Path not found", result: false };
    if (e.code === "EACCES")
      return { code: "EACCES", message: "Permission denied", result: false };
    return {
      code: "ERROR",
      message: `Error accessing path: ${e.message}`,
      result: false,
    };
  }
}
