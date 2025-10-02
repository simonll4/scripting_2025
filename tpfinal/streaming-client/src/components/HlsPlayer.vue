<template>
  <div class="hls-player">
    <div class="player-header">
      <h3>🎥 Streaming HLS</h3>
      <div class="status-indicator" :class="{ connected: isConnected, loading: isLoading }">
        {{ statusText }}
      </div>
    </div>
    
    <div class="video-container">
      <video
        ref="videoElement"
        controls
        muted
        class="video-player"
        @loadstart="onLoadStart"
        @loadeddata="onLoadedData"
        @error="onError"
      />
      
      <div v-if="error" class="error-message">
        ❌ {{ error }}
      </div>
      
      <div v-if="isLoading && !error" class="loading-message">
        ⏳ Cargando stream...
      </div>
    </div>
    
    <div class="controls">
      <button @click="startStream" :disabled="isConnected || isLoading" class="btn-primary">
        📡 Conectar HLS
      </button>
      <button @click="stopStream" :disabled="!isConnected" class="btn-secondary">
        ⏹️ Desconectar
      </button>
    </div>
    
    <div class="stream-info" v-if="streamInfo">
      <h4>📊 Información del Stream</h4>
      <div class="info-grid">
        <div><strong>URL:</strong> {{ streamUrl }}</div>
        <div><strong>Estado:</strong> {{ streamInfo.networkState || 'N/A' }}</div>
        <div><strong>Ready State:</strong> {{ streamInfo.readyState || 'N/A' }}</div>
        <div><strong>Buffered:</strong> {{ streamInfo.bufferedTime || 'N/A' }}s</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import Hls from 'hls.js'

const videoElement = ref<HTMLVideoElement | null>(null)
const hls = ref<Hls | null>(null)
const isConnected = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const streamInfo = ref<any>({})

const streamUrl = computed(() => {
  const baseUrl = import.meta.env.VITE_HLS_BASE || 'http://localhost:8888'
  const streamPath = import.meta.env.VITE_STREAM_PATH || 'webcam'
  return `${baseUrl}/${streamPath}/index.m3u8`
})

const statusText = computed(() => {
  if (isLoading.value) return 'Conectando...'
  if (isConnected.value) return 'Conectado'
  if (error.value) return 'Error'
  return 'Desconectado'
})

const startStream = async () => {
  if (!videoElement.value) return
  
  error.value = null
  isLoading.value = true
  
  try {
    if (Hls.isSupported()) {
      // Usar HLS.js
      hls.value = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 10
      })
      
      hls.value.loadSource(streamUrl.value)
      hls.value.attachMedia(videoElement.value)
      
      hls.value.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest cargado')
        videoElement.value?.play()
      })
      
      hls.value.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data)
        if (data.fatal) {
          error.value = `Error HLS: ${data.type} - ${data.details}`
          isLoading.value = false
          isConnected.value = false
        }
      })
      
    } else if (videoElement.value.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari nativo
      videoElement.value.src = streamUrl.value
      await videoElement.value.play()
    } else {
      throw new Error('HLS no es soportado en este navegador')
    }
    
  } catch (err: any) {
    error.value = err.message || 'Error desconocido'
    isLoading.value = false
  }
}

const stopStream = () => {
  if (hls.value) {
    hls.value.destroy()
    hls.value = null
  }
  
  if (videoElement.value) {
    videoElement.value.pause()
    videoElement.value.src = ''
  }
  
  isConnected.value = false
  isLoading.value = false
  error.value = null
  streamInfo.value = {}
}

const onLoadStart = () => {
  isLoading.value = true
}

const onLoadedData = () => {
  isLoading.value = false
  isConnected.value = true
  updateStreamInfo()
}

const onError = (event: Event) => {
  const target = event.target as HTMLVideoElement
  error.value = `Error de video: ${target.error?.message || 'Error desconocido'}`
  isLoading.value = false
  isConnected.value = false
}

const updateStreamInfo = () => {
  if (!videoElement.value) return
  
  const video = videoElement.value
  streamInfo.value = {
    networkState: getNetworkStateText(video.networkState),
    readyState: getReadyStateText(video.readyState),
    bufferedTime: video.buffered.length > 0 ? video.buffered.end(0).toFixed(2) : '0'
  }
}

const getNetworkStateText = (state: number) => {
  const states = ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE']
  return states[state] || 'UNKNOWN'
}

const getReadyStateText = (state: number) => {
  const states = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA']
  return states[state] || 'UNKNOWN'
}

// Actualizar info cada segundo
let infoInterval: number
onMounted(() => {
  infoInterval = setInterval(() => {
    if (isConnected.value) {
      updateStreamInfo()
    }
  }, 1000)
})

onUnmounted(() => {
  stopStream()
  if (infoInterval) {
    clearInterval(infoInterval)
  }
})
</script>

<style scoped>
.hls-player {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.player-header h3 {
  margin: 0;
  color: #2c3e50;
}

.status-indicator {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: bold;
  background: #e74c3c;
  color: white;
  transition: background-color 0.3s;
}

.status-indicator.loading {
  background: #f39c12;
}

.status-indicator.connected {
  background: #27ae60;
}

.video-container {
  position: relative;
  margin-bottom: 15px;
}

.video-player {
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  background: #000;
}

.error-message, .loading-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 16px;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.btn-primary, .btn-secondary {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-secondary {
  background: #95a5a6;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #7f8c8d;
}

.btn-primary:disabled, .btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stream-info {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #3498db;
}

.stream-info h4 {
  margin: 0 0 10px 0;
  color: #2c3e50;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .controls {
    flex-direction: column;
  }
}
</style>