<template>
  <div class="about-container">
    <div class="about-content">
      <h1>📝 Acerca del Proyecto</h1>
      
      <div class="project-info">
        <div class="info-card">
          <h2>🎯 Objetivo</h2>
          <p>
            Sistema de streaming en tiempo real que permite capturar video de una webcam,
            transmitirlo via MediaMTX, y visualizarlo tanto en vivo como grabaciones históricas.
          </p>
        </div>

        <div class="info-card">
          <h2>🏗️ Arquitectura</h2>
          <div class="architecture-list">
            <div class="arch-item">
              <strong>🎥 Webcam Agent:</strong> Captura video con GStreamer y envía via RTSP
            </div>
            <div class="arch-item">
              <strong>📡 MediaMTX:</strong> Servidor de streaming en Docker (RTSP → WebRTC/HLS)
            </div>
            <div class="arch-item">
              <strong>💻 Cliente Vue:</strong> Interfaz web para visualización y control
            </div>
          </div>
        </div>

        <div class="info-card">
          <h2>🔧 Tecnologías</h2>
          <div class="tech-grid">
            <div class="tech-item">
              <span class="tech-icon">🐋</span>
              <div>
                <strong>Docker</strong>
                <small>Contenedor MediaMTX</small>
              </div>
            </div>
            <div class="tech-item">
              <span class="tech-icon">📹</span>
              <div>
                <strong>GStreamer</strong>
                <small>Pipeline de video</small>
              </div>
            </div>
            <div class="tech-item">
              <span class="tech-icon">🟢</span>
              <div>
                <strong>Node.js</strong>
                <small>Agente de webcam</small>
              </div>
            </div>
            <div class="tech-item">
              <span class="tech-icon">💚</span>
              <div>
                <strong>Vue 3</strong>
                <small>Cliente web</small>
              </div>
            </div>
            <div class="tech-item">
              <span class="tech-icon">⚡</span>
              <div>
                <strong>WebRTC</strong>
                <small>Baja latencia</small>
              </div>
            </div>
            <div class="tech-item">
              <span class="tech-icon">📺</span>
              <div>
                <strong>HLS</strong>
                <small>Streaming adaptativo</small>
              </div>
            </div>
          </div>
        </div>

        <div class="info-card">
          <h2>🚀 Funcionalidades</h2>
          <ul class="features-list">
            <li>✅ Streaming en tiempo real con WebRTC (baja latencia)</li>
            <li>✅ Streaming HLS adaptativo (mayor compatibilidad)</li>
            <li>✅ Grabación automática en formato fMP4</li>
            <li>✅ Visualización de grabaciones históricas</li>
            <li>✅ Dashboard web responsivo</li>
            <li>✅ Métricas en tiempo real</li>
          </ul>
        </div>

        <div class="info-card">
          <h2>🌐 Endpoints</h2>
          <div class="endpoints-list">
            <div class="endpoint-item">
              <strong>RTSP:</strong> 
              <code>rtsp://localhost:8554/webcam</code>
            </div>
            <div class="endpoint-item">
              <strong>HLS:</strong> 
              <code>http://localhost:8888/webcam/index.m3u8</code>
            </div>
            <div class="endpoint-item">
              <strong>WebRTC:</strong> 
              <code>http://localhost:8889/whep/webcam</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: calc(100vh - 80px);
}

.about-content h1 {
  text-align: center;
  color: white;
  font-size: 2.5rem;
  margin-bottom: 40px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.info-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.info-card h2 {
  color: #2c3e50;
  margin: 0 0 20px 0;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  gap: 10px;
}

.info-card p {
  color: #5a6c7d;
  line-height: 1.6;
  margin: 0;
}

.architecture-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.arch-item {
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #3498db;
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.tech-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  transition: transform 0.2s;
}

.tech-item:hover {
  transform: translateY(-2px);
}

.tech-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.tech-item strong {
  display: block;
  color: #2c3e50;
  margin-bottom: 2px;
}

.tech-item small {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.features-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.features-list li {
  padding: 10px 0;
  color: #5a6c7d;
  font-size: 1.1rem;
}

.endpoints-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.endpoint-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.endpoint-item strong {
  color: #2c3e50;
}

.endpoint-item code {
  background: #e9ecef;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  color: #495057;
  font-size: 0.9rem;
}

@media (max-width: 768px) {
  .about-container {
    padding: 20px 10px;
  }
  
  .about-content h1 {
    font-size: 2rem;
  }
  
  .info-card {
    padding: 20px;
  }
  
  .tech-grid {
    grid-template-columns: 1fr;
  }
  
  .endpoint-item {
    align-items: flex-start;
  }
}
</style>
