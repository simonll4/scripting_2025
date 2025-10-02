<template>
  <div class="recordings-viewer">
    <div class="header">
      <h3>📁 Grabaciones</h3>
      <button @click="loadRecordings" :disabled="isLoading" class="btn-refresh">
        {{ isLoading ? '⏳' : '🔄' }} Actualizar
      </button>
    </div>
    
    <div v-if="error" class="error-message">
      ❌ {{ error }}
    </div>
    
    <div v-if="isLoading && recordings.length === 0" class="loading-message">
      ⏳ Cargando grabaciones...
    </div>
    
    <div v-if="recordings.length === 0 && !isLoading && !error" class="empty-message">
      📂 No hay grabaciones disponibles
    </div>
    
    <div class="recordings-grid">
      <div 
        v-for="recording in recordings" 
        :key="recording.name"
        class="recording-card"
        @click="selectRecording(recording)"
        :class="{ selected: selectedRecording?.name === recording.name }"
      >
        <div class="recording-thumbnail">
          <span class="file-icon">🎬</span>
        </div>
        <div class="recording-info">
          <div class="recording-name">{{ recording.displayName }}</div>
          <div class="recording-details">
            <span class="recording-date">{{ formatDate(recording.date) }}</span>
            <span class="recording-size">{{ formatSize(recording.size) }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Reproductor de grabaciones -->
    <div v-if="selectedRecording" class="recording-player">
      <div class="player-header">
        <h4>▶️ {{ selectedRecording.displayName }}</h4>
        <button @click="closePlayer" class="btn-close">✕</button>
      </div>
      
      <video
        ref="recordingVideo"
        controls
        class="recording-video"
        @loadedmetadata="onVideoLoaded"
      >
        Tu navegador no soporta el elemento video.
      </video>
      
      <div class="recording-metadata" v-if="videoMetadata">
        <div class="metadata-grid">
          <div><strong>Duración:</strong> {{ formatDuration(videoMetadata.duration) }}</div>
          <div><strong>Resolución:</strong> {{ videoMetadata.width }}x{{ videoMetadata.height }}</div>
          <div><strong>Formato:</strong> {{ selectedRecording.format }}</div>
          <div><strong>Tamaño:</strong> {{ formatSize(selectedRecording.size) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Recording {
  name: string
  displayName: string
  date: Date
  size: number
  format: string
  url: string
}

const recordings = ref<Recording[]>([])
const selectedRecording = ref<Recording | null>(null)
const recordingVideo = ref<HTMLVideoElement | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const videoMetadata = ref<any>(null)

// Cargar grabaciones reales desde la API
const loadRecordings = async () => {
  isLoading.value = true
  error.value = null
  
  try {
    const baseUrl = 'http://localhost:8080'
    const response = await fetch(`${baseUrl}/api/recordings/webcam/`)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // Procesar la respuesta del autoindex de nginx
    const recordingFiles = data.filter((item: any) => 
      item.type === 'file' && item.name.endsWith('.mp4')
    )
    
    const processedRecordings: Recording[] = recordingFiles.map((file: any) => {
      // Parsear el nombre del archivo para extraer la fecha
      // Formato: 2025-09-26_07-01-28-305500.mp4
      const match = file.name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})-\d+\.mp4$/)
      let displayName = file.name
      let date = new Date()
      
      if (match) {
        const [, dateStr, hour, minute, second] = match
        const parsedDate = new Date(`${dateStr}T${hour}:${minute}:${second}`)
        displayName = `Grabación ${parsedDate.toLocaleDateString('es-ES')} ${parsedDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
        date = parsedDate
      }
      
      return {
        name: file.name,
        displayName,
        date,
        size: parseInt(file.size) || 0,
        format: 'fMP4',
        url: `/recordings/webcam/${file.name}`
      }
    })
    
    recordings.value = processedRecordings.sort((a, b) => b.date.getTime() - a.date.getTime())
    
  } catch (err: any) {
    error.value = 'Error cargando grabaciones: ' + (err.message || 'Error de conexión')
    console.error('Error loading recordings:', err)
  } finally {
    isLoading.value = false
  }
}

const selectRecording = (recording: Recording) => {
  selectedRecording.value = recording
  videoMetadata.value = null
  
  // En un entorno real, construir la URL completa del servidor
  const baseUrl = import.meta.env.VITE_MEDIAMTX_HOST 
    ? `http://${import.meta.env.VITE_MEDIAMTX_HOST}:8080` 
    : 'http://localhost:8080'
  
  if (recordingVideo.value) {
    recordingVideo.value.src = baseUrl + recording.url
  }
}

const closePlayer = () => {
  selectedRecording.value = null
  videoMetadata.value = null
  if (recordingVideo.value) {
    recordingVideo.value.src = ''
  }
}

const onVideoLoaded = () => {
  if (recordingVideo.value) {
    videoMetadata.value = {
      duration: recordingVideo.value.duration,
      width: recordingVideo.value.videoWidth,
      height: recordingVideo.value.videoHeight
    }
  }
}

const formatDate = (date: Date): string => {
  return date.toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return 'N/A'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

onMounted(() => {
  loadRecordings()
})
</script>

<style scoped>
.recordings-viewer {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h3 {
  margin: 0;
  color: #2c3e50;
}

.btn-refresh {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #3498db;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.btn-refresh:hover:not(:disabled) {
  background: #2980b9;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message, .loading-message, .empty-message {
  text-align: center;
  padding: 40px 20px;
  color: #7f8c8d;
  font-size: 16px;
}

.error-message {
  color: #e74c3c;
  background: #fdf2f2;
  border-radius: 8px;
}

.recordings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.recording-card {
  border: 2px solid #ecf0f1;
  border-radius: 8px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 15px;
}

.recording-card:hover {
  border-color: #3498db;
  box-shadow: 0 2px 8px rgba(52, 152, 219, 0.2);
}

.recording-card.selected {
  border-color: #3498db;
  background: #f8fbff;
}

.recording-thumbnail {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  background: #ecf0f1;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-icon {
  font-size: 24px;
}

.recording-info {
  flex: 1;
  min-width: 0;
}

.recording-name {
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recording-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  color: #7f8c8d;
}

.recording-player {
  border-top: 2px solid #ecf0f1;
  padding-top: 20px;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.player-header h4 {
  margin: 0;
  color: #2c3e50;
}

.btn-close {
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close:hover {
  background: #c0392b;
}

.recording-video {
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  background: #000;
  margin-bottom: 15px;
}

.recording-metadata {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #e67e22;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .recordings-grid {
    grid-template-columns: 1fr;
  }
  
  .recording-card {
    flex-direction: column;
    text-align: center;
  }
  
  .metadata-grid {
    grid-template-columns: 1fr;
  }
}
</style>