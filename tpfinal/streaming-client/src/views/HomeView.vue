<script setup lang="ts">
import HlsPlayer from '../components/HlsPlayer.vue'
import WebRtcPlayer from '../components/WebRtcPlayer.vue'
import RecordingsViewer from '../components/RecordingsViewer.vue'
</script>

<template>
  <main class="main-container">
    <div class="header">
      <h1>🎥 Streaming Dashboard</h1>
      <p class="subtitle">
        Visualiza el streaming en tiempo real y accede a las grabaciones
      </p>
    </div>

    <div class="streaming-section">
      <h2>📡 Streaming en Vivo</h2>
      <div class="players-grid">
        <HlsPlayer />
        <WebRtcPlayer />
      </div>
    </div>

    <div class="recordings-section">
      <h2>📁 Grabaciones</h2>
      <RecordingsViewer />
    </div>
  </main>
</template>

<style scoped>
.main-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
}

.header {
  text-align: center;
  margin-bottom: 40px;
  padding: 20px 0;
}

.header h1 {
  color: #2c3e50;
  margin: 0 0 10px 0;
  font-size: 2.5rem;
  font-weight: bold;
}

.subtitle {
  color: #7f8c8d;
  font-size: 1.1rem;
  margin: 0;
}

.streaming-section,
.recordings-section {
  margin-bottom: 40px;
}

.streaming-section h2,
.recordings-section h2 {
  color: #2c3e50;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 3px solid #3498db;
  font-size: 1.8rem;
}

.players-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 1024px) {
  .players-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .main-container {
    padding: 10px;
  }
  
  .header h1 {
    font-size: 2rem;
  }
  
  .streaming-section h2,
  .recordings-section h2 {
    font-size: 1.5rem;
  }
}
</style>
