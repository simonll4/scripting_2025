# Sistema MQTT Agent-CLP

Sistema distribuido que implementa un agente MQTT y un cliente de línea de comandos (CLP) para la ejecución remota de comandos a través del protocolo MQTT.

## Descripción del Problema

El objetivo es crear un sistema que permita:

1. **Agente MQTT**: Un servicio que se conecta a un broker MQTT, anuncia su presencia y responde a comandos remotos
2. **Cliente CLP**: Una interfaz de línea de comandos que se conecta al agente y permite ejecutar comandos de forma interactiva
3. **Comunicación Unicast**: Evitar que múltiples clientes reciban respuestas de comandos que no enviaron

## Solución Implementada

### Arquitectura de la Solución

```
┌─────────────────┐              ┌───────────────────┐              ┌─────────────────┐
│      CLP        │              │ BROKER MOSQUITTO  │              │     AGENT       │
│                 │ ─[PUBLISH]──►│                   │ ◄[PUBLISH]───│                 │
│ Cliente línea   │ request/cmd  │ • Topics comando  │  presence    │ Ejecuta comando │
│ de comandos     │              │ • Topics respuesta│              │   (ls, help)    │
│                 │◄─[SUBSCRIBE]─│ • presence/agents │ ◄[PUBLISH]───│                 │
│                 │   response   │   (heartbeat)     │  response    │Anuncia presencia│
│                 │◄─[SUBSCRIBE]─│ • LWT (offline)   │              │                 │
│                 │   presence   │   auto-publish    │ ─[SUBSCRIBE]►│                 │
└─────────────────┘              │   on disconnect   │ request/cmd  └─────────────────┘
                                 └───────────────────┘
```


### Componentes del Sistema

- **Agent**: Servicio que ejecuta comandos (ls, help) y anuncia su presencia
- **CLP**: Cliente interactivo que envía comandos y recibe respuestas
- **Broker MQTT**: Intermediario que maneja topics y correlación de mensajes

### Solución del Problema de Unicast

El desafío principal es **evitar que múltiples CLPs reciban respuestas de comandos que no enviaron**. La solución funciona independientemente de las versiones MQTT de cada componente.

#### **Detección de Versión por Servicio**
Cada servicio (Agent y CLP) detecta su propia versión MQTT al conectarse:
1. **Intenta MQTT v5.0** primero
2. **Si falla → Fallback a MQTT v3.1.1** automáticamente
3. **Cada servicio opera independientemente** de la versión del otro

#### **Compatibilidad por Versión del Broker**
**El broker determina la versión que todos usan**. Los servicios se adaptan automáticamente:

| Broker | Agent detecta | CLP detecta | Resultado |
|--------|---------------|-------------|-----------|
| v5.0   | v5.0          | v5.0        | ✅ Correlación v5.0 (óptima) |
| v3.1.1 | v3.1.1        | v3.1.1      | ✅ Correlación v3.1.1 |

> **Compatibilidad:** El broker debe soportar MQTT 5.0 o 3.1.1. Si se negocia otra versión, no se asegura de que los servicios se conecten correctamente y registrarán un error.


#### **Punto Clave: El Broker Decide**
- **El broker determina qué versión MQTT está disponible**
- **Todos los servicios se adaptan a la misma versión** que soporta el broker
- **No hay mezcla de versiones** - si el broker es v3.1.1, todos usan v3.1.1
- **Fallback automático**: Si broker no soporta v5.0, todos caen a v3.1.1

### Sistema de Presencia

- **Heartbeat**: Agent publica estado cada 30s en `presence/agents/{agentName}`
- **LWT**: Si Agent se desconecta, broker automáticamente publica "offline"
- **Verificación**: CLP verifica que Agent esté online antes de enviar comandos


## Uso del Sistema

### Configuración
La configuración se toma desde archivos TOML. En el CLP, los parámetros de línea
de comandos (`-h`, `-p`, `-u`, `-P`, `-a`) sobrescriben los valores del archivo.
- `agent/agent.toml`: Configuración del agente
- `clp/clp.toml`: Configuración del cliente

### Ejecución
```bash
# Iniciar Agent
cd agent/ && node src/index.js

# Iniciar CLP (configuración por defecto)
cd clp/ && node src/index.js

# CLP con parámetros
node src/index.js -h broker -p port -u user -P pass -a agentName
```

### Comandos Disponibles
- **`help`**: Lista comandos disponibles
- **`ls [path]`**: Lista archivos y directorios
- **`quit`**: Salir del cliente


## Logs por Servicio
- Agent: genera líneas de log con timestamp; con la configuración actual (`output = ""`) escribe en consola y en `agent/logs/agent.log`.
- CLP: escribe solo en archivos para no contaminar la CLI, creando `clp/logs/clp-<clientId>.log` por cada cliente conectado.
