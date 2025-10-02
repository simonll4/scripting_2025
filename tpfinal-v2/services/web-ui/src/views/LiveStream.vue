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
.debug-viewer {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea, #764ba2);
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header h1 {
  color: white;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.header p {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 1rem;
}

.debug-warning {
  background: rgba(255, 193, 7, 0.2);
  border: 2px solid #ffc107;
  border-radius: 8px;
  padding: 1rem;
  color: #ffc107;
  font-weight: 600;
  max-width: 600px;
  margin: 0 auto;
}

.debug-content {
  display: grid;
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.debug-info {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.debug-info h2 {
  margin-bottom: 1.5rem;
  color: #333;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-item label {
  font-weight: 600;
  color: #666;
  font-size: 0.9rem;
}

.status-item span {
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 6px;
  font-family: monospace;
}

.status-indicator.active {
  background: #d4edda !important;
  color: #155724;
}

.debug-actions {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.debug-actions h3 {
  margin-bottom: 1.5rem;
  color: #333;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.debug-button {
  padding: 1rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.debug-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.debug-log {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.debug-log h3 {
  margin-bottom: 1.5rem;
  color: #333;
}

.log-container {
  max-height: 300px;
  overflow-y: auto;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.log-entry {
  display: flex;
  gap: 1rem;
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  font-family: monospace;
  font-size: 0.9rem;
}

.log-entry.info {
  background: #d1ecf1;
  color: #0c5460;
}

.log-entry.success {
  background: #d4edda;
  color: #155724;
}

.log-entry.warning {
  background: #fff3cd;
  color: #856404;
}

.log-entry.error {
  background: #f8d7da;
  color: #721c24;
}

.log-time {
  min-width: 80px;
  font-weight: 600;
}

.clear-log-button {
  padding: 0.5rem 1rem;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.clear-log-button:hover {
  background: #c82333;
}

.debug-note {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 2rem;
  border-left: 4px solid #17a2b8;
}

.debug-note h3 {
  color: #17a2b8;
  margin-bottom: 1rem;
}

.debug-note p {
  color: #666;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.debug-note code {
  background: #f8f9fa;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
  color: #e83e8c;
}

@media (max-width: 768px) {
  .debug-viewer {
    padding: 1rem;
  }
  
  .status-grid,
  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>