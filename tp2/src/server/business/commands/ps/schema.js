// Única fuente de verdad para límites y listas válidas
export const MAX_PROCESSES_LIMIT = 1000;

export const VALID_SORT_FIELDS = ["cpu", "mem", "pid", "name"];

// Campos que el comando puede proyectar hacia la respuesta
export const PROJECTION_FIELDS = [
  "pid",
  "ppid",
  "user",
  "name",
  "cmd",
  "state",
  "cpuPercent",
  "memRssBytes",
  "memVszBytes",
  "priority",
  "nice",
  "startedAt",
];

// Esquema AJV
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Debe coincidir con MAX_PROCESSES_LIMIT
    limit: {
      type: "integer",
      minimum: 1,
      maximum: MAX_PROCESSES_LIMIT,
      default: 100,
    },
    sortBy: { enum: VALID_SORT_FIELDS, default: "cpu" },
    order: { enum: ["asc", "desc"], default: "desc" },
    user: { type: "string", minLength: 1 },
    namePattern: { type: "string", minLength: 1 },
    fields: {
      type: "array",
      items: { enum: PROJECTION_FIELDS },
      uniqueItems: true,
      minItems: 1,
    },
  },
  required: [],
};

export default schema;
