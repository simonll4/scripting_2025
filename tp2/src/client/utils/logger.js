const ts = () => new Date().toISOString();

export const logger = {
  info(msg, data) {
    console.log(`[${ts()}] ${msg}`);
    if (data) console.log("   ", JSON.stringify(data, null, 2));
  },
  ok(msg, data) {
    console.log(`[${ts()}] ${msg}`);
    if (data) console.log("   ", JSON.stringify(data, null, 2));
  },
  warn(msg, data) {
    console.warn(`[${ts()}] ${msg}`);
    if (data) console.warn("   ", JSON.stringify(data, null, 2));
  },
  error(msg, data) {
    console.error(`[${ts()}] ${msg}`);
    if (data) console.error("   ", JSON.stringify(data, null, 2));
  },
  debug(msg, data) {
    // Debug logging - controlled via environment variables
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.debug(`[${ts()}] DEBUG: ${msg}`);
      if (data) console.debug("   ", JSON.stringify(data, null, 2));
    }
  },
};
