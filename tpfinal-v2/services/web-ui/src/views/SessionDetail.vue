<template>
  <div class="session-detail">
    <div class="header">
      <button @click="goBack" class="back-button">
        ← Volver al listado
      </button>
      <div class="session-title">
        <h1>📹 {{ sessionId }}</h1>
        <p>Reproducción de grabación relevante</p>
      </div>
    </div>

    <div class="content-layout">
      <!-- Reproductor principal -->
      <div class="player-section">
        <div v-if="playlistUrl" class="video-container">
          <video
            ref="videoElement"
            class="main-video"
            controls
            playsinline
            @timeupdate="handleTimeUpdate"
            @loadedmetadata="handleVideoLoaded"
          >
            Tu navegador no soporta video HTML5.
          </video>
          
          <!-- Overlay de anotaciones -->
          <canvas
            v-if="showAnnotations && currentAnnotations.length > 0"
            ref="annotationCanvas"
            class="annotation-overlay"
          ></canvas>
          
          <!-- Controles del reproductor -->
          <div class="player-controls">
            <button @click="toggleAnnotations" class="annotation-toggle">
              {{ showAnnotations ? '🔲 Ocultar Anotaciones' : '🎯 Mostrar Anotaciones' }}
            </button>
            <button @click="toggleFullscreen" class="fullscreen-button">
              🔍 Pantalla Completa
            </button>
            <button @click="downloadVideo" class="download-button" v-if="false">
              💾 Descargar
            </button>
          </div>
        </div>
        
        <div v-else class="no-video">
          <div class="video-placeholder">
            <h3>❌ Grabación no disponible</h3>
            <p>{{ error || 'La grabación no está disponible en este momento' }}</p>
            <button @click="retryLoad" class="retry-button">
              🔄 Reintentar
            </button>
          </div>
        </div>

        <!-- Cronología de eventos -->
        <div v-if="timeline.length > 0" class="timeline-section">
          <h3>⏱️ Cronología de Detecciones</h3>
          <div class="timeline-container">
            <div 
              v-for="event in timeline" 
              :key="event.timestamp"
              class="timeline-event"
              :style="{ left: getTimelinePosition(event.timestamp) + '%' }"
              @click="seekToTime(event.timestamp)"
              :title="`${event.class} - ${formatTimestamp(event.timestamp)}`"
            >
              <div class="event-marker" :class="event.class">
                {{ getClassIcon(event.class) }}
              </div>
            </div>
            <div class="timeline-progress" :style="{ width: playbackProgress + '%' }"></div>
          </div>
          <div class="timeline-scale">
            <span>00:00</span>
            <span>{{ formatDuration(videoDuration) }}</span>
          </div>
        </div>
      </div>

      <!-- Panel lateral de información -->
      <div class="info-panel">
        <!-- Información de la sesión -->
        <div class="session-info-card">
          <h3>📋 Información de la Sesión</h3>
          <div class="info-grid">
            <div class="info-item">
              <label>ID de Sesión:</label>
              <span>{{ sessionData?.session_id }}</span>
            </div>
            <div class="info-item">
              <label>Dispositivo:</label>
              <span>{{ sessionData?.dev_id }}</span>
            </div>
            <div class="info-item">
              <label>Fecha/Hora:</label>
              <span>{{ formatDate(sessionData?.created_at) }}</span>
            </div>
            <div class="info-item">
              <label>Duración:</label>
              <span>{{ formatDuration(videoDuration) }}</span>
            </div>
            <div class="info-item">
              <label>Estado:</label>
              <span class="status-badge" :class="sessionData?.status || 'completed'">
                {{ getStatusLabel(sessionData?.status) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Clases detectadas -->
        <div class="classes-card">
          <h3>🎯 Clases Detectadas</h3>
          <div class="classes-list">
            <div 
              v-for="cls in sessionData?.classes || []" 
              :key="cls"
              class="class-item"
              @click="filterByClass(cls)"
            >
              <span class="class-icon">{{ getClassIcon(cls) }}</span>
              <span class="class-name">{{ cls }}</span>
              <span class="detection-count">{{ getClassCount(cls) }}</span>
            </div>
          </div>
        </div>

        <!-- Detecciones actuales -->
        <div class="current-detections-card">
          <h3>🔍 Detecciones Actuales</h3>
          <div v-if="currentDetections.length === 0" class="no-current-detections">
            <p>Sin detecciones en el momento actual</p>
          </div>
          <div v-else class="detections-list">
            <div 
              v-for="detection in currentDetections" 
              :key="detection.detection_id"
              class="detection-item"
            >
              <div class="detection-header">
                <span class="detection-class">{{ getClassIcon(detection.class) }} {{ detection.class }}</span>
                <span class="confidence-score">{{ Math.round(detection.score * 100) }}%</span>
              </div>
              <div v-if="detection.attributes && Object.keys(detection.attributes).length > 0" class="attributes">
                <div 
                  v-for="[key, value] in Object.entries(detection.attributes)" 
                  :key="key"
                  class="attribute"
                >
                  <strong>{{ key }}:</strong> {{ value }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Miniaturas de momentos clave -->
        <div v-if="keyMoments.length > 0" class="key-moments-card">
          <h3>⭐ Momentos Clave</h3>
          <div class="moments-grid">
            <div 
              v-for="moment in keyMoments" 
              :key="moment.timestamp"
              class="moment-thumbnail"
              @click="seekToTime(moment.timestamp)"
            >
              <img 
                v-if="moment.thumb_url" 
                :src="moment.thumb_url"
                :alt="`Momento en ${formatTimestamp(moment.timestamp)}`"
                class="moment-image"
              />
              <div class="moment-overlay">
                <span class="moment-time">{{ formatTimestamp(moment.timestamp) }}</span>
                <span class="moment-class">{{ moment.class }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Estado de carga -->
    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>Cargando grabación...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Hls from 'hls.js'

const route = useRoute()
const router = useRouter()

// Props de la ruta
const sessionId = route.params.sessionId as string
const playlistUrl = route.query.playlist as string
const thumbUrl = route.query.thumb as string
const metaUrl = route.query.meta as string

// Estado reactivo
const sessionData = ref<any>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const showAnnotations = ref(true)
const currentTime = ref(0)
const videoDuration = ref(0)
const timeline = ref<any[]>([])
const detections = ref<any[]>([])
const keyMoments = ref<any[]>([])

const videoElement = ref<HTMLVideoElement>()
const annotationCanvas = ref<HTMLCanvasElement>()
let hls: Hls | null = null

// Computed properties
const currentDetections = computed(() => {
  return detections.value.filter(d => {
    const startTime = d.first_ts ? new Date(d.first_ts).getTime() / 1000 : 0
    const endTime = d.last_ts ? new Date(d.last_ts).getTime() / 1000 : videoDuration.value
    return currentTime.value >= startTime && currentTime.value <= endTime
  })
})

const currentAnnotations = computed(() => {
  return currentDetections.value.filter(d => d.bbox)
})

const playbackProgress = computed(() => {
  if (videoDuration.value === 0) return 0
  return (currentTime.value / videoDuration.value) * 100
})

// Funciones principales
const loadSessionData = async () => {
  try {
    const response = await fetch(`http://localhost:8080/api/sessions/${sessionId}`)
    if (!response.ok) {
      throw new Error(`Error ${response.status}: Sesión no encontrada`)
    }
    sessionData.value = await response.json()
  } catch (err: any) {
    error.value = err.message
    console.error('Error cargando sesión:', err)
  }
}

const loadDetections = async () => {
  try {
    const response = await fetch(`http://localhost:8080/api/detections/${sessionId}`)
    if (response.ok) {
      const data = await response.json()
      detections.value = data.detections || []
      generateTimeline()
      generateKeyMoments()
    }
  } catch (err) {
    console.error('Error cargando detecciones:', err)
  }
}

const loadMetadata = async () => {
  if (!metaUrl) return
  
  try {
    const response = await fetch(metaUrl)
    if (response.ok) {
      const metadata = await response.json()
      // Procesar metadata adicional si es necesario
    }
  } catch (err) {
    console.error('Error cargando metadata:', err)
  }
}

const initializeVideo = async () => {
  if (!playlistUrl || !videoElement.value) return
  
  try {
    if (Hls.isSupported()) {
      hls = new Hls({
        debug: false,
        enableWorker: true
      })
      
      hls.loadSource(playlistUrl)
      hls.attachMedia(videoElement.value)
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('Video listo para reproducir')
      })
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('Error HLS:', data)
        if (data.fatal) {
          error.value = 'Error crítico al cargar el video'
        }
      })
    } else if (videoElement.value.canPlayType('application/vnd.apple.mpegurl')) {
      videoElement.value.src = playlistUrl
    } else {
      error.value = 'El navegador no soporta reproducción HLS'
    }
  } catch (err: any) {
    error.value = 'Error al inicializar el reproductor de video'
    console.error('Error inicializando video:', err)
  }
}

const generateTimeline = () => {
  timeline.value = detections.value.map(d => ({
    timestamp: d.first_ts ? new Date(d.first_ts).getTime() / 1000 : 0,
    class: d.class,
    confidence: d.score
  })).sort((a, b) => a.timestamp - b.timestamp)
}

const generateKeyMoments = () => {
  // Generar momentos clave basados en detecciones de alta confianza
  keyMoments.value = detections.value
    .filter(d => d.score > 0.8)
    .slice(0, 6)
    .map(d => ({
      timestamp: d.first_ts ? new Date(d.first_ts).getTime() / 1000 : 0,
      class: d.class,
      thumb_url: d.frame_url || thumbUrl
    }))
}

const updateAnnotations = async () => {
  if (!showAnnotations.value || !annotationCanvas.value || !videoElement.value) return
  
  await nextTick()
  
  const canvas = annotationCanvas.value
  const video = videoElement.value
  const ctx = canvas.getContext('2d')
  
  if (!ctx) return
  
  canvas.width = video.videoWidth || video.clientWidth
  canvas.height = video.videoHeight || video.clientHeight
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Dibujar anotaciones actuales
  currentAnnotations.value.forEach(detection => {
    if (!detection.bbox) return
    
    ctx.strokeStyle = '#FF4444'
    ctx.fillStyle = 'rgba(255, 68, 68, 0.2)'
    ctx.lineWidth = 2
    
    const x = detection.bbox.x * canvas.width
    const y = detection.bbox.y * canvas.height
    const width = detection.bbox.width * canvas.width
    const height = detection.bbox.height * canvas.height
    
    ctx.fillRect(x, y, width, height)
    ctx.strokeRect(x, y, width, height)
    
    // Etiqueta
    ctx.fillStyle = '#FF4444'
    ctx.font = '16px Arial'
    ctx.fillText(
      `${detection.class} (${Math.round(detection.score * 100)}%)`,
      x,
      y - 5
    )
  })
}

// Event handlers
const handleTimeUpdate = () => {
  if (videoElement.value) {
    currentTime.value = videoElement.value.currentTime
    updateAnnotations()
  }
}

const handleVideoLoaded = () => {
  if (videoElement.value) {
    videoDuration.value = videoElement.value.duration
  }
}

const toggleAnnotations = () => {
  showAnnotations.value = !showAnnotations.value
  if (showAnnotations.value) {
    updateAnnotations()
  }
}

const toggleFullscreen = () => {
  if (videoElement.value && videoElement.value.requestFullscreen) {
    videoElement.value.requestFullscreen()
  }
}

const seekToTime = (timestamp: number) => {
  if (videoElement.value) {
    videoElement.value.currentTime = timestamp
  }
}

const retryLoad = async () => {
  error.value = null
  loading.value = true
  await initializeVideo()
  loading.value = false
}

const downloadVideo = () => {
  if (playlistUrl) {
    window.open(playlistUrl, '_blank')
  }
}

const goBack = () => {
  router.push({ name: 'dashboard' })
}

// Funciones auxiliares
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatDuration = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

const formatTimestamp = (timestamp: number) => {
  return formatDuration(timestamp)
}

const getTimelinePosition = (timestamp: number) => {
  if (videoDuration.value === 0) return 0
  return (timestamp / videoDuration.value) * 100
}

const getClassIcon = (className: string) => {
  const icons: Record<string, string> = {
    person: '👤',
    face: '😊',
    car: '🚗',
    bicycle: '🚲',
    cat: '🐱',
    dog: '🐶',
    laptop: '💻',
    chair: '🪑',
    default: '🎯'
  }
  return icons[className] || icons.default
}

const getClassCount = (className: string) => {
  return detections.value.filter(d => d.class === className).length
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    active: 'Activa',
    completed: 'Completada',
    error: 'Error',
    default: 'Completada'
  }
  return labels[status] || labels.default
}

const filterByClass = (className: string) => {
  // Implementar filtrado por clase si es necesario
  console.log('Filtrar por clase:', className)
}

// Lifecycle hooks
onMounted(async () => {
  loading.value = true
  
  try {
    await Promise.all([
      loadSessionData(),
      loadDetections(),
      loadMetadata()
    ])
    
    if (playlistUrl) {
      await initializeVideo()
    }
  } catch (err) {
    console.error('Error durante la inicialización:', err)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  if (hls) {
    hls.destroy()
    hls = null
  }
})
</script>

<style scoped>
.session-detail {
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  color: white;
}

.header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
}

.back-button {
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(10px);
}

.back-button:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.session-title h1 {
  margin: 0;
  font-size: 2rem;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.content-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 30px;
}

.player-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.video-container {
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 15px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.main-video {
  width: 100%;
  height: auto;
  max-height: 500px;
  display: block;
}

.annotation-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.player-controls {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  gap: 10px;
}

.annotation-toggle, .fullscreen-button, .download-button {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

.annotation-toggle:hover, .fullscreen-button:hover, .download-button:hover {
  background: rgba(0, 0, 0, 0.95);
}

.no-video {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  border: 2px dashed rgba(255, 255, 255, 0.3);
}

.video-placeholder {
  text-align: center;
}

.retry-button {
  padding: 12px 24px;
  background: #4ECDC4;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 15px;
  transition: all 0.3s ease;
}

.retry-button:hover {
  background: #45b7aa;
  transform: translateY(-2px);
}

.timeline-section {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.timeline-container {
  position: relative;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  margin: 15px 0;
  overflow: hidden;
}

.timeline-event {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
}

.event-marker {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #FF6B6B;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.timeline-progress {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #45a049);
  border-radius: 20px;
  transition: width 0.1s ease;
}

.timeline-scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  opacity: 0.8;
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.session-info-card, .classes-card, .current-detections-card, .key-moments-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.session-info-card h3, .classes-card h3, .current-detections-card h3, .key-moments-card h3 {
  margin: 0 0 15px 0;
  font-size: 1.2rem;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-item label {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-badge.completed {
  background: #4CAF50;
  color: white;
}

.status-badge.active {
  background: #FF9800;
  color: white;
}

.status-badge.error {
  background: #F44336;
  color: white;
}

.classes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.class-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.class-item:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateX(5px);
}

.class-icon {
  font-size: 1.2rem;
  margin-right: 10px;
}

.class-name {
  flex: 1;
  font-weight: 500;
}

.detection-count {
  background: #4CAF50;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
}

.detections-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
}

.detection-item {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  border-left: 4px solid #4CAF50;
}

.detection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.detection-class {
  font-weight: 600;
}

.confidence-score {
  background: #4CAF50;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  font-weight: 600;
}

.attributes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  opacity: 0.9;
}

.attribute {
  padding-left: 10px;
}

.moments-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.moment-thumbnail {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.1);
}

.moment-thumbnail:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.moment-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moment-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.8));
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.moment-time {
  font-size: 0.8rem;
  font-weight: 600;
}

.moment-class {
  font-size: 0.75rem;
  opacity: 0.9;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.no-current-detections {
  text-align: center;
  padding: 20px;
  opacity: 0.7;
}

@media (max-width: 1200px) {
  .content-layout {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  
  .moments-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .session-detail {
    padding: 15px;
  }
  
  .header {
    flex-direction: column;
    text-align: center;
    gap: 15px;
  }
  
  .session-title h1 {
    font-size: 1.5rem;
  }
  
  .player-controls {
    position: static;
    padding: 10px;
    background: rgba(0, 0, 0, 0.8);
    justify-content: center;
  }
  
  .moments-grid {
    grid-template-columns: 1fr;
  }
}
</style>