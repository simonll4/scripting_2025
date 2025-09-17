/**
 * CLI Colors and Formatting Utilities
 * 
 * Simple ANSI color codes and formatting helpers for better
 * command line interface presentation.
 */

// ANSI color codes
export const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
};

// Icons for different types of output - removed for text-only formatting
export const ICONS = {
  success: "",
  error: "",
  warning: "",
  info: "",
  folder: "",
  file: "",
  arrow: "->",
  bullet: "-",
};

// Color helper functions
export function colorize(text, color) {
  return `${color}${text}${COLORS.reset}`;
}

export function success(text) {
  return colorize(`[SUCCESS] ${text}`, COLORS.brightGreen);
}

export function error(text) {
  return colorize(`[ERROR] ${text}`, COLORS.brightRed);
}

export function warning(text) {
  return colorize(`[WARNING] ${text}`, COLORS.brightYellow);
}

export function info(text) {
  return colorize(`[INFO] ${text}`, COLORS.brightBlue);
}

export function header(text) {
  return colorize(text, COLORS.bold + COLORS.cyan);
}

export function highlight(text) {
  return colorize(text, COLORS.brightYellow);
}

export function dim(text) {
  return colorize(text, COLORS.dim);
}

export function formatFileItem(item) {
  if (item.type === "directory") {
    const name = colorize(item.name + "/", COLORS.brightBlue);
    return `${name}`;
  } else {
    const name = colorize(item.name, COLORS.white);
    return `${name}`;
  }
}

export function formatCommand(command, description) {
  const cmd = colorize(command, COLORS.brightCyan);
  const desc = colorize(description, COLORS.gray);
  return `  ${cmd}  ${ICONS.arrow}  ${desc}`;
}

export function formatAgentInfo(agentName, mqttVersion, clientId) {
  const agent = colorize(agentName, COLORS.brightGreen);
  const version = colorize(`MQTT v${mqttVersion}`, COLORS.yellow);
  const id = colorize(clientId, COLORS.gray);
  return `[INFO] Connected - Agent: ${agent} | ${version} | ID: ${id}`;
}

export function formatPrompt(agentName) {
  return colorize(`${agentName}`, COLORS.brightGreen) + colorize("> ", COLORS.white);
}