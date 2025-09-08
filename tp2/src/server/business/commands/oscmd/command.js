import { execFile } from "child_process";
import { access } from "fs/promises";
import { constants as FS } from "fs";
import { OS_CMD_POLICY } from "./config.js";
import { SCOPES } from "../../../security/index.js";
import { PROTOCOL } from "../../../../protocol/index.js";

export default {
  scope: SCOPES.OS_CMD, // Fixed: use unified scope
  closeAfter: false,
  async handler({ data }) {
    const { cmd, args = [], timeoutMs = OS_CMD_POLICY.timeoutMsDefault } = data;
    
    // Validate required parameters
    if (!cmd || typeof cmd !== "string") {
      const error = new Error("Missing or invalid 'cmd' parameter");
      error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
      throw error;
    }

    // Validate timeout
    if (timeoutMs && (typeof timeoutMs !== "number" || timeoutMs < 1000 || timeoutMs > 60000)) {
      const error = new Error("Invalid timeoutMs: must be between 1000 and 60000");
      error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
      throw error;
    }

    const bin = OS_CMD_POLICY.binaries[cmd];
    if (!bin) {
      const error = new Error(`Command '${cmd}' not allowed`);
      error.code = PROTOCOL.ERROR_CODES.CMD_NOT_ALLOWED;
      throw error;
    }

    try {
      await access(bin, FS.X_OK);
    } catch {
      const error = new Error(`Binary not found: ${bin}`);
      error.code = PROTOCOL.ERROR_CODES.BIN_NOT_FOUND;
      throw error;
    }

    return await new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, shell: false, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            return resolve({
              ok: false,
              exitCode: error.code ?? null,
              timedOut: !!error.killed,
              stdout: String(stdout ?? ""),
              stderr: String(stderr ?? error.message ?? ""),
            });
          }
          
          // Check if output is too large
          const result = {
            ok: true,
            exitCode: 0,
            timedOut: false,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
          };

          const resultJson = JSON.stringify(result);
          if (Buffer.byteLength(resultJson, 'utf8') > PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES) {
            // Truncate output if too large
            const maxLength = Math.floor(PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES * 0.8 / 2); // Reserve space for JSON overhead
            result.stdout = result.stdout.substring(0, maxLength) + "\n... [OUTPUT TRUNCATED]";
            result.stderr = result.stderr.substring(0, maxLength) + "\n... [OUTPUT TRUNCATED]";
            result.truncated = true;
          }

          resolve(result);
        }
      );
    });
  },
};
