export default {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
};

// export default {
//   type: "object",
//   additionalProperties: false,
//   properties: {
//     limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
//     sortBy: { enum: ["cpu", "mem", "pid", "name"], default: "cpu" },
//     order: { enum: ["asc", "desc"], default: "desc" },
//     user: { type: "string", minLength: 1 },
//     namePattern: { type: "string", minLength: 1 },
//     fields: {
//       type: "array",
//       items: {
//         enum: [
//           "pid",
//           "ppid",
//           "user",
//           "name",
//           "cmd",
//           "state",
//           "cpuPercent",
//           "memRssBytes",
//           "memVszBytes",
//           "priority",
//           "nice",
//           "startedAt",
//         ],
//       },
//       uniqueItems: true,
//       minItems: 1,
//     },
//   },
//   required: [],
// };
