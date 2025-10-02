#!/usr/bin/env node

const WebcamAgent = require('./webcam-agent');
const fs = require('fs');
const path = require('path');

/**
 * Script principal del agente de webcam
 */

async function main() {
  // Crear directorio de logs si no existe
  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const agent = new WebcamAgent();

  // Manejo de señales del sistema
  const gracefulShutdown = async (signal) => {
    console.log(`\nRecibida señal ${signal}, cerrando agente...`);
    try {
      await agent.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error durante el cierre:', error.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Eventos del agente
  agent.on('started', () => {
    console.log('🚀 Agente de webcam iniciado');
  });

  agent.on('streaming-started', () => {
    console.log('📹 Streaming de webcam activo');
    const status = agent.getStatus();
    console.log(`📺 RTSP: rtsp://localhost:8554/webcam`);
    console.log(`📺 HLS: http://localhost:8888/webcam/index.m3u8`);
    console.log(`📺 WebRTC: http://localhost:8889/whep/webcam`);
  });

  agent.on('streaming-error', (error) => {
    console.error('❌ Error en streaming:', error.message);
  });

  agent.on('max-reconnect-attempts-reached', () => {
    console.error('💀 Máximo número de intentos de reconexión alcanzado. Cerrando agente...');
    process.exit(1);
  });

  agent.on('stopped', () => {
    console.log('⏹️  Agente detenido');
  });

  // Manejo de errores no capturados
  process.on('uncaughtException', (error) => {
    console.error('Error no capturado:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Promesa rechazada no manejada en:', promise, 'razón:', reason);
    gracefulShutdown('unhandledRejection');
  });

  // Iniciar el agente
  try {
    console.log('🔧 Iniciando agente de webcam...');
    await agent.start();
  } catch (error) {
    console.error('❌ Error al iniciar el agente:', error.message);

    if (error.message.includes('GStreamer')) {
      console.log('\n💡 Para instalar GStreamer en Ubuntu:');
      console.log('   sudo apt update');
      console.log('   sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly');
    }

    if (error.message.includes('/dev/video')) {
      console.log('\n💡 Verifica que tu webcam esté conectada y disponible:');
      console.log('   ls -la /dev/video*');
      console.log('   v4l2-ctl --list-devices');
    }

    process.exit(1);
  }
}

// Ejecutar si es el módulo principal
if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;