import { EdgeAgent } from './EdgeAgent';
import { CONFIG } from './config';

async function main() {
  console.log('🎬 Starting Edge Agent for Computer Vision TP');
  console.log('Configuration:', {
    device: CONFIG.DEVICE_PATH,
    frameRate: CONFIG.FRAME_RATE,
    videoSize: CONFIG.VIDEO_SIZE,
    confidenceThreshold: CONFIG.CONFIDENCE_THRESHOLD,
    classesOfInterest: CONFIG.CLASSES_OF_INTEREST,
    postRollMs: CONFIG.POST_ROLL_MS,
    mediamtxUrl: CONFIG.MEDIAMTX_URL,
    sessionStoreUrl: CONFIG.SESSION_STORE_URL
  });

  const agent = new EdgeAgent();

  // Setup event listeners
  agent.on('initialized', () => {
    console.log('✅ Edge Agent initialized');
  });

  agent.on('started', () => {
    console.log('🚀 Edge Agent started and monitoring for events');
  });

  agent.on('session_started', ({ sessionId, timestamp }) => {
    console.log(`📝 Session started: ${sessionId} at ${new Date(timestamp).toISOString()}`);
  });

  agent.on('session_ended', ({ sessionId, timestamp, detectionsCount }) => {
    const duration = timestamp - (timestamp - 10000); // Approximate
    console.log(`📋 Session ended: ${sessionId}`);
    console.log(`   Duration: ${Math.round(duration / 1000)}s`);
    console.log(`   Detections: ${detectionsCount}`);
    console.log(`   Ended at: ${new Date(timestamp).toISOString()}`);
  });

  agent.on('camera_stopped', () => {
    console.log('📹 Camera capture stopped');
  });

  agent.on('stopped', () => {
    console.log('⏹️ Edge Agent stopped');
  });

  // Handle errors
  agent.on('error', (error) => {
    console.error('❌ Edge Agent error:', error);
  });

  try {
    // Initialize and start
    await agent.initialize();
    await agent.start();

    // Keep process alive
    console.log('🔄 Edge Agent running. Press Ctrl+C to stop.');

    // Status reporting every 30 seconds
    setInterval(() => {
      const stats = agent.getStats();
      console.log(`📊 Status: ${stats.state} | Session: ${stats.sessionId || 'none'} | Detections: ${stats.detectionsCount} | Streaming: ${stats.isStreaming}`);
    }, 30000);

  } catch (error) {
    console.error('💥 Failed to start Edge Agent:', error);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main();
}

export { EdgeAgent };