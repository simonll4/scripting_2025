export default {
  type: "object",
  additionalProperties: false,
  properties: {
    seconds: { type: "integer", minimum: 1, maximum: 3600 },
  },
  required: [],
};

// export default {
//   type: "object",
//   additionalProperties: false,
//   properties: {
//     seconds: { type: "integer", minimum: 1, maximum: 3600, default: 3600 }
//   },
//   required: []
// };
