import { execFile } from "child_process";
import { access } from "fs/promises";
import { constants as FS } from "fs";
import { OS_CMD_POLICY } from "../../../config.js";

export default {
  scope: "OS_CMD",
  closeAfter: false,
  async handler({ data }) {
    const { cmd, args = [], timeoutMs = OS_CMD_POLICY.timeoutMsDefault } = data;
    const bin = OS_CMD_POLICY.binaries[cmd];
    if (!bin) return { error: "CMD_NOT_ALLOWED", message: "No permitido" };

    try {
      await access(bin, FS.X_OK);
    } catch {
      return { error: "BIN_NOT_FOUND", message: bin };
    }

    return await new Promise((resolve) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, shell: false, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error)
            return resolve({
              ok: false,
              exitCode: error.code ?? null,
              timedOut: !!error.killed,
              stdout: String(stdout ?? ""),
              stderr: String(stderr ?? error.message ?? ""),
            });
          resolve({
            ok: true,
            exitCode: 0,
            timedOut: false,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
          });
        }
      );
    });
  },
};
