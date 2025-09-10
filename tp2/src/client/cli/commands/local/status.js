export const status = {
  name: "status",
  desc: "Mostrar información de conexión y estado del cliente",
  usage: "status",
  local: true,
  run(ctx) {
    const client = ctx.client;
    const state = client.state;
    
    console.log(`\n\x1b[36m${"═".repeat(60)}\x1b[0m`);
    console.log(`\x1b[1m ESTADO DEL CLIENTE\x1b[0m`);
    console.log(`\x1b[36m${"═".repeat(60)}\x1b[0m`);
    
    // Estado de conexión
    const connStatus = state.connected ? '\x1b[32mConectado\x1b[0m' : '\x1b[31mDesconectado\x1b[0m';
    console.log(`\nConexión: ${connStatus}`);
    
    // Estado de autenticación
    const authStatus = state.authenticated ? '\x1b[32mAutenticado\x1b[0m' : '\x1b[31mNo autenticado\x1b[0m';
    console.log(`Autenticación: ${authStatus}`);
    
    // ID de sesión
    if (state.sessionId) {
      console.log(`ID de sesión: \x1b[33m${state.sessionId}\x1b[0m`);
    }
    
    // Configuración de conexión
    console.log(`\n\x1b[1m  Configuración:\x1b[0m`);
    console.log(`   Servidor: \x1b[36m${client.cfg.host}:${client.cfg.port}\x1b[0m`);
    console.log(`   Timeout conexión: \x1b[33m${client.cfg.connectTimeoutMs}ms\x1b[0m`);
    console.log(`   Timeout solicitud: \x1b[33m${client.cfg.requestTimeoutMs}ms\x1b[0m`);
    console.log(`   Keep alive: \x1b[33m${client.cfg.keepAliveMs}ms\x1b[0m`);
    
    // Estado de la cola de mensajes
    console.log(`\n\x1b[1m Cola de mensajes:\x1b[0m`);
    console.log(`   En vuelo: \x1b[33m${client.inFlight}\x1b[0m/\x1b[33m${client.maxInFlight}\x1b[0m`);
    console.log(`   En cola: \x1b[33m${client.queue.length}\x1b[0m`);
    console.log(`   Próximo ID: \x1b[33mc${client.ids}\x1b[0m`);
    
    console.log(`\x1b[36m${"═".repeat(60)}\x1b[0m\n`);
  },
};
