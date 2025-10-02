<template>
  <div class="debug-viewer">
    <div class="header">
      <h1>🔧 Edge Agent Debug</h1>
      <p>Ventana de desarrollo para probar la inferencia en tiempo real</p>
      <div class="debug-warning">
        ⚠️ Esta es una vista de desarrollo - Solo para testing del Edge Agent
      </div>
    </div>

    <div class="debug-content">
      <div class="debug-info">
        <h2>🎯 Estado del Edge Agent</h2>
        <div class="status-grid">
          <div class="status-item">
            <label>Estado:</label>
            <span class="status-indicator" :class="{ active: agentRunning }">
              {{ agentRunning ? '🟢 Funcionando' : '🔴 Detenido' }}
            </span>
          </div>
          <div class="status-item">
            <label>Cámara:</label>
            <span>{{ cameraDevice || 'No detectada' }}</span>
          </div>
          <div class="status-item">
            <label>Modelo:</label>
            <span>{{ modelPath || 'No cargado' }}</span>
          </div>
          <div class="status-item">
            <label>Detecciones:</label>
            <span>{{ totalDetections }}</span>
          </div>
        </div>
      </div>

      <div class="debug-actions">
        <h3>🛠️ Acciones de Debug</h3>
        <div class="actions-grid">
          <button @click="checkAgentStatus" class="debug-button">
            🔍 Verificar Estado
          </button>
          <button @click="checkCamera" class="debug-button">
            📹 Probar Cámara
          </button>
          <button @click="testInference" class="debug-button">
            🧠 Probar Inferencia
          </button>
          <button @click="viewLogs" class="debug-button">
            📋 Ver Logs
          </button>
        </div>
      </div>

      <div v-if="debugLog.length > 0" class="debug-log">
        <h3>📝 Log de Debug</h3>
        <div class="log-container">
          <div 
            v-for="(entry, index) in debugLog" 
            :key="index"
            class="log-entry"
            :class="entry.level"
          >
            <span class="log-time">{{ entry.timestamp }}</span>
            <span class="log-message">{{ entry.message }}</span>
          </div>
        </div>
        <button @click="clearLog" class="clear-log-button">
          🗑️ Limpiar Log
        </button>
      </div>

      <div class="debug-note">
        <h3>ℹ️ Nota</h3>
        <p>
          Esta vista es solo para desarrollo. El video en tiempo real con 
          bounding boxes se muestra directamente en el Edge Agent cuando está 
          procesando la cámara. Esta UI está diseñada para mostrar grabaciones 
          de situaciones relevantes, no streaming en vivo.
        </p>
        <p>
          Para ver el video en tiempo real con detecciones, inicia el Edge Agent 
          con <code>SHOW_DEBUG_WINDOW=true</code>.
        </p>
      </div>
    </div>
  </div>
</template>v class="debug-viewer">
    <div class="header">
      <h1>� Edge Agent Debug</h1>
      <p>Ventana de desarrollo para probar la inferencia en tiempo real</p>
      <div class="debug-warning">
        ⚠️ Esta es una vista de desarrollo - Solo para testing del Edge Agent
      </div>
    </div>

    <div class="stream-container">
      <!-- Control de sesión activa -->
      <div class="session-control">
        <div v-if="!activeSession" class="no-session">
          <h2>🔧 Iniciar Debug del Edge Agent</h2>
          <form @submit.prevent="startDebugSession" class="session-form">
            <div class="form-group">
              <label for="deviceId">ID del Dispositivo:</label>
              <input
                id="deviceId"
                v-model="newSession.deviceId"
                type="text"
                placeholder="webcam-laptop"
                required
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label for="streamPath">Ruta del Stream:</label>
              <select id="streamPath" v-model="newSession.streamPath" class="form-select">
                <option value="/dev/video0">📹 Cámara Web (/dev/video0)</option>
                <option value="/dev/video1">📹 Cámara Externa (/dev/video1)</option>
                <option value="rtsp://demo">📡 Stream RTSP Demo</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="classes">Clases a Detectar:</label>
              <div class="classes-selection">
                <label v-for="cls in availableClasses" :key="cls" class="class-checkbox">
                  <input
                    type="checkbox"
                    :value="cls"
                    v-model="newSession.classes"
                  />
                  <span>{{ cls }}</span>
                </label>
              </div>
            </div>
            
            <button 
              type="submit" 
              :disabled="loading"
              class="start-button"
            >
              {{ loading ? '🚀 Iniciando...' : '🎬 Iniciar Sesión' }}
            </button>
          </form>
        </div>

        <div v-else class="active-session">
          <h2>🔴 Sesión Activa</h2>
          <div class="session-info">
            <p><strong>ID:</strong> {{ activeSession.session_id }}</p>
            <p><strong>Dispositivo:</strong> {{ activeSession.dev_id }}</p>
            <p><strong>Inicio:</strong> {{ formatDate(activeSession.created_at) }}</p>
            <p><strong>Clases:</strong> 
              <span v-for="cls in activeSession.classes" :key="cls" class="class-tag">
                {{ cls }}
              </span>
            </p>
          </div>
          
          <div class="session-actions">
            <button @click="stopSession" class="stop-button">
              ⏹️ Detener Sesión
            </button>
            <button @click="refreshStream" class="refresh-button">
              🔄 Actualizar Stream
            </button>
          </div>
        </div>
      </div>

      <!-- Video Stream -->
      <div class="video-section">
        <div v-if="streamUrl" class="video-container">
          <video
            ref="videoElement"
            class="stream-video"
            controls
            autoplay
            muted
            playsinline
          >
            Tu navegador no soporta video HTML5.
          </video>
          
          <!-- Overlay de detecciones -->
          <canvas
            v-if="showOverlay && detections.length > 0"
            ref="overlayCanvas"
            class="detection-overlay"
          ></canvas>
          
          <div class="video-controls">
            <button @click="toggleOverlay" class="overlay-toggle">
              {{ showOverlay ? '🔲 Ocultar Anotaciones' : '🎯 Mostrar Anotaciones' }}
            </button>
            <button @click="toggleFullscreen" class="fullscreen-button">
              🔍 Pantalla Completa
            </button>
          </div>
        </div>
        
        <div v-else class="no-stream">
          <div class="stream-placeholder">
            <h3>📹 Sin Stream Activo</h3>
            <p>Inicia una sesión para comenzar la transmisión</p>
            <div class="stream-status">
              <div class="status-indicator" :class="{ active: isStreaming }"></div>
              <span>{{ isStreaming ? 'Conectado' : 'Desconectado' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Panel de detecciones en tiempo real -->
      <div class="detections-panel">
        <h3>🎯 Detecciones en Tiempo Real</h3>
        <div v-if="detections.length === 0" class="no-detections">
          <p>Sin detecciones activas</p>
          <div class="detection-status">
            <div class="pulse-indicator"></div>
            <span>Monitoreando...</span>
          </div>
        </div>
        
        <div v-else class="detections-list">
          <div 
            v-for="detection in recentDetections" 
            :key="detection.detection_id"
            class="detection-item"
          >
            <div class="detection-icon">
              {{ getClassIcon(detection.class) }}
            </div>
            <div class="detection-info">
              <strong>{{ detection.class }}</strong>
              <span class="confidence">{{ Math.round(detection.score * 100) }}%</span>
              <small>{{ formatTime(detection.timestamp) }}</small>
            </div>
          </div>
        </div>
        
        <div class="detection-stats">
          <div class="stat">
            <span class="stat-value">{{ detections.length }}</span>
            <span class="stat-label">Total</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ uniqueClasses.length }}</span>
            <span class="stat-label">Clases</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ averageConfidence }}%</span>
            <span class="stat-label">Confianza</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mensajes de error -->
    <div v-if="error" class="error-banner">
      <strong>❌ Error:</strong> {{ error }}
      <button @click="clearError" class="close-error">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Estado reactivo
const agentRunning = ref(false)
const cameraDevice = ref('/dev/video0')
const modelPath = ref('models/yolov8n.onnx')
const totalDetections = ref(0)
const debugLog = ref<Array<{timestamp: string, level: string, message: string}>>([])

// Funciones
const checkAgentStatus = async () => {
  addLogEntry('info', 'Verificando estado del Edge Agent...')
  
  try {
    // Simular verificación del agente
    const response = await fetch('http://localhost:8081/health').catch(() => null)
    agentRunning.value = response?.ok || false
    
    if (agentRunning.value) {
      addLogEntry('success', 'Edge Agent está funcionando correctamente')
    } else {
      addLogEntry('warning', 'Edge Agent no está respondiendo')
    }
  } catch (err) {
    addLogEntry('error', 'Error al verificar el estado del agente')
  }
}

const checkCamera = async () => {
  addLogEntry('info', 'Probando acceso a la cámara...')
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach(track => track.stop())
    addLogEntry('success', 'Cámara accesible correctamente')
  } catch (err) {
    addLogEntry('error', 'Error accediendo a la cámara: ' + (err as Error).message)
  }
}

const testInference = () => {
  addLogEntry('info', 'Probando motor de inferencia...')
  
  // Simular prueba de inferencia
  setTimeout(() => {
    const success = Math.random() > 0.3
    if (success) {
      totalDetections.value += Math.floor(Math.random() * 5) + 1
      addLogEntry('success', `Inferencia exitosa. ${totalDetections.value} detecciones totales`)
    } else {
      addLogEntry('error', 'Error en el motor de inferencia')
    }
  }, 1000)
}

const viewLogs = () => {
  addLogEntry('info', 'Cargando logs del Edge Agent...')
  
  // Simular carga de logs
  setTimeout(() => {
    addLogEntry('info', 'Edge Agent iniciado')
    addLogEntry('info', 'Cámara /dev/video0 detectada')
    addLogEntry('info', 'Modelo ONNX cargado exitosamente')
    addLogEntry('success', 'Sistema listo para detecciones')
  }, 500)
}

const clearLog = () => {
  debugLog.value = []
}

const addLogEntry = (level: string, message: string) => {
  debugLog.value.push({
    timestamp: new Date().toLocaleTimeString(),
    level,
    message
  })
  
  // Mantener solo los últimos 50 logs
  if (debugLog.value.length > 50) {
    debugLog.value = debugLog.value.slice(-50)
  }
}

// Lifecycle
onMounted(() => {
  addLogEntry('info', 'Debug viewer inicializado')
  checkAgentStatus()
})
</script>

<style scoped>
.live-stream {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  min-height: 100vh;
  color: white;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h1 {
  font-size: 2.5rem;
  margin: 0;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.stream-container {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: 20px;
  align-items: start;
}

.session-control, .detections-panel {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.session-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 600;
  font-size: 0.9rem;
}

.form-input, .form-select {
  padding: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
}

.form-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.classes-selection {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.class-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.class-checkbox:hover {
  background: rgba(255, 255, 255, 0.2);
}

.start-button, .stop-button, .refresh-button {
  padding: 15px 30px;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.start-button {
  background: #4CAF50;
  color: white;
}

.stop-button {
  background: #FF6B6B;
  color: white;
}

.refresh-button {
  background: #4ECDC4;
  color: white;
}

.start-button:hover, .stop-button:hover, .refresh-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.active-session {
  text-align: center;
}

.session-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 20px;
  border-radius: 10px;
  margin: 20px 0;
  text-align: left;
}

.session-info p {
  margin: 8px 0;
  font-size: 0.9rem;
}

.session-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.video-section {
  position: relative;
}

.video-container {
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 15px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.stream-video {
  width: 100%;
  height: auto;
  max-height: 500px;
  display: block;
}

.detection-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.video-controls {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
}

.overlay-toggle, .fullscreen-button {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.overlay-toggle:hover, .fullscreen-button:hover {
  background: rgba(0, 0, 0, 0.9);
}

.no-stream {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  border: 2px dashed rgba(255, 255, 255, 0.3);
}

.stream-placeholder {
  text-align: center;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ff4444;
  display: inline-block;
  margin-right: 8px;
}

.status-indicator.active {
  background: #44ff44;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.detections-panel h3 {
  margin: 0 0 20px 0;
  text-align: center;
}

.no-detections {
  text-align: center;
  padding: 20px;
}

.pulse-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #4ECDC4;
  display: inline-block;
  margin-right: 10px;
  animation: pulse 1.5s infinite;
}

.detections-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 20px;
}

.detection-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 4px solid #4CAF50;
}

.detection-icon {
  font-size: 1.5rem;
}

.detection-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.confidence {
  color: #4CAF50;
  font-weight: 600;
  font-size: 0.9rem;
}

.detection-stats {
  display: flex;
  justify-content: space-around;
  background: rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 10px;
}

.stat {
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #FFE66D;
}

.stat-label {
  font-size: 0.8rem;
  opacity: 0.8;
}

.class-tag {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  margin: 2px;
  display: inline-block;
}

.error-banner {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #FF6B6B;
  color: white;
  padding: 15px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  z-index: 1000;
  max-width: 400px;
}

.close-error {
  background: none;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  float: right;
  margin-left: 10px;
}

@media (max-width: 1200px) {
  .stream-container {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  
  .classes-selection {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .live-stream {
    padding: 15px;
  }
  
  .header h1 {
    font-size: 2rem;
  }
  
  .session-actions {
    flex-direction: column;
    align-items: center;
  }
  
  .video-controls {
    position: static;
    padding: 10px;
    background: rgba(0, 0, 0, 0.5);
    justify-content: center;
  }
}
</style>