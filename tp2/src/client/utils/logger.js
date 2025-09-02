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
};
