# Sistema de Módulos de Negocio

## Arquitectura

Este sistema organiza la lógica de negocio en módulos autónomos que encapsulan:
- **Comando**: Lógica de ejecución
- **Schema**: Validación de entrada
- **Metadatos**: Configuración (scope, closeAfter, etc.)

## Estructura de un Módulo

```
src/server/modules/{módulo}/
├── index.js     # Punto de entrada y metadatos
├── command.js   # Lógica de negocio
└── schema.js    # Esquema de validación
```

### Ejemplo: `getosinfo`

#### `index.js`
```javascript
import { PROTOCOL } from "../../protocol/standard.js";
import command from "./command.js";
import schema from "./schema.js";

export const act = PROTOCOL.CORE_ACTS.GET_OS_INFO;
export { command, schema };
```

#### `command.js`
```javascript
export default {
  scope: "read:sys",
  closeAfter: false,
  handler: async ({ db, session, data, socket, connection }) => {
    // Lógica de negocio aquí
    return { result: "..." };
  }
};
```

#### `schema.js`
```javascript
export default {
  type: "object",
  additionalProperties: false,
  properties: {
    seconds: { type: "integer", minimum: 1, maximum: 86400 }
  }
};
```

## Auto-registro

El sistema automáticamente:
1. Escanea todos los subdirectorios en `/modules/`
2. Importa cada `index.js`
3. Registra comandos y validadores
4. Compila schemas con AJV

### Ventajas

- ✅ **Cohesión**: Todo relacionado con una funcionalidad está junto
- ✅ **Escalabilidad**: Agregar módulos es solo crear una carpeta
- ✅ **Mantenibilidad**: Cambios aislados por módulo
- ✅ **Testabilidad**: Cada módulo se puede probar independientemente
- ✅ **Zero-config**: No hay que mantener registros manuales

## Migración desde el Sistema Anterior

### Antes
```
commands/
├── index.js           # Registro manual
├── getosinfo.js       # Handler
└── quit.js           # Handler

schemas/
└── commands/
    ├── getosinfo.schema.js
    └── quit.schema.js
```

### Después
```
modules/
├── modules.index.js   # Auto-registro
├── getosinfo/
│   ├── index.js       # Metadatos
│   ├── command.js     # Handler
│   └── schema.js      # Schema
└── quit/
    ├── index.js
    ├── command.js
    └── schema.js
```

## Uso en el Sistema

### Command Router
```javascript
import { commands } from "../modules/modules.index.js";

const commandDef = commands.get(message.act);
await commandDef.handler(context);
```

### Payload Validator
```javascript
import { validators } from "../modules/modules.index.js";

const validator = validators.get(message.act);
const isValid = validator(data);
```

## Herramientas de Desarrollo

### Listar Comandos
```javascript
import { listCommands } from "./modules/modules.index.js";
console.log(listCommands());
```

### Información de Comando
```javascript
import { getCommandInfo } from "./modules/modules.index.js";
const info = getCommandInfo("GET_OS_INFO");
```

### Recargar Módulos (Desarrollo)
```javascript
import { reloadModules } from "./modules/modules.index.js";
await reloadModules();
```
