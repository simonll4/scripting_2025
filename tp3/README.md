# TP3

## Estructura del Proyecto

```
tp3/
├── tp3.0/          # Sistema de captura de imágenes (TCP + MQTT)
├── tp3.1/          # Sistema Agent-CLP (MQTT)
├── mosquitto/      # Configuración del broker MQTT
└── README.md       # Este archivo
```

## TP3.0 - Sistema de Captura de Imágenes

Sistema distribuido que combina TCP y MQTT para captura automática de imágenes via webcam.

**Componentes:**

- **Agent-TCP**: Servidor que recibe comandos TCP y captura imágenes
- **Scheduler**: Cliente que envía comandos periódicos
- **Saver**: Suscriptor MQTT que almacena las imágenes

**Tecnologías:** Node.js, TCP, MQTT, FFmpeg, SQLite

**[Ver documentación completa](tp3.0/README.md)**

## TP3.1 - Sistema Agent-CLP

Sistema de ejecución remota de comandos a través de MQTT con comunicación unicast.

**Componentes:**

- **Agent**: Servicio que ejecuta comandos remotos
- **CLP**: Cliente de línea de comandos interactivo

**Tecnologías:** Node.js, MQTT v5.0/v3.1.1, TOML

**[Ver documentación completa](tp3.1/README.md)**
