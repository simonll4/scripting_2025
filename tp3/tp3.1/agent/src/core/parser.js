export function parseIncoming({ topic, message, packet, isV5 }) {
  // request/commands/{agent}/{command}
  const parts = topic.split("/");
  const command = parts[3] || "";

  let args = {},
    replyTo = null,
    id = null;

  const text = message?.toString("utf8") || "";
  if (text) {
    if (text[0] === "{") {
      try {
        const p = JSON.parse(text);
        args = p.args || {};
        replyTo = p.replyTo ?? null;
        id = p.id ?? null;
      } catch {
        /* loguea app.js */
      }
    } else {
      args = { path: text.trim() };
    }
  }

  const v5Props =
    isV5 && packet?.properties
      ? {
          responseTopic: packet.properties.responseTopic,
          correlationData: packet.properties.correlationData,
        }
      : null;

  if (isV5 && !id && v5Props?.correlationData) {
    id = v5Props.correlationData.toString("utf8");
  }

  return { command, args, replyTo, id, v5Props, qos: packet?.qos };
}

// // core/parser.js
// export function extractCommand(topic) {
//   // request/commands/{agent}/{command}
//   const parts = topic.split("/");
//   return parts[3] || "";
// }

// export function parseIncoming({ topic, message, packet, isV5 }) {
//   const command = extractCommand(topic);
//   let args = {},
//     replyTo = null,
//     id = null;

//   const text = message?.toString("utf8") || "";
//   if (text) {
//     if (text[0] === "{") {
//       try {
//         const p = JSON.parse(text);
//         args = p.args || {};
//         replyTo = p.replyTo ?? null;
//         id = p.id ?? null;
//       } catch {
//         /* noop: lo loguea app.js */
//       }
//     } else {
//       args = { path: text.trim() };
//     }
//   }

//   const v5Props =
//     isV5 && packet?.properties
//       ? {
//           responseTopic: packet.properties.responseTopic,
//           correlationData: packet.properties.correlationData,
//         }
//       : null;

//   if (isV5 && !id && v5Props?.correlationData) {
//     id = v5Props.correlationData.toString("utf8");
//   }

//   return { command, args, replyTo, id, v5Props, qos: packet?.qos };
// }
