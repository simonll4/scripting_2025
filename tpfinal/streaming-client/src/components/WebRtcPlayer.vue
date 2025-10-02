<template>
  <div class="webrtc-player">
    <div class="player-header">
      <h3>⚡ Streaming WebRTC (WHEP)</h3>
      <div class="status-indicator" :class="{ connected: isConnected, loading: isLoading }">
        {{ statusText }}
      </div>
    </div>
    
    <div class="video-container">
      <video
        ref="videoElement"
        controls
        muted
        autoplay
        playsinline
        class="video-player"
      />
      
      <div v-if="error" class="error-message">
        ❌ {{ error }}
      </div>
      
      <div v-if="isLoading && !error" class="loading-message">
        ⏳ Estableciendo conexión WebRTC...
      </div>
    </div>
    
    <div class="controls">
      <button @click="startStream" :disabled="isConnected || isLoading" class="btn-primary">
        ⚡ Conectar WebRTC
      </button>
      <button @click="stopStream" :disabled="!isConnected" class="btn-secondary">
        ⏹️ Desconectar
      </button>
    </div>
    
    <div class="stream-info" v-if="stats">
      <h4>📊 Estadísticas WebRTC</h4>
      <div class="info-grid">
        <div><strong>Estado:</strong> {{ connectionState }}</div>
        <div><strong>Bytes recibidos:</strong> {{ formatBytes(stats.bytesReceived || 0) }}</div>
        <div><strong>Frames/s:</strong> {{ stats.framesPerSecond || 'N/A' }}</div>
        <div><strong>Resolución:</strong> {{ videoResolution }}</div>
        <div><strong>Bitrate:</strong> {{ formatBitrate(stats.bitrate || 0) }}</div>
        <div><strong>Packets perdidos:</strong> {{ stats.packetsLost || 0 }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const videoElement = ref<HTMLVideoElement | null>(null)
const peerConnection = ref<RTCPeerConnection | null>(null)
const isConnected = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const stats = ref<any>({})
const connectionState = ref('disconnected')

const whepUrl = computed(() => {
  const baseUrl = import.meta.env.VITE_WEBRTC_BASE_URL || 'http://localhost:8889'
  const streamPath = import.meta.env.VITE_STREAM_PATH || 'webcam'
  return `${baseUrl}/${streamPath}/whep`
})

const statusText = computed(() => {
  if (isLoading.value) return 'Conectando...'
  if (isConnected.value) return 'Conectado'
  if (error.value) return 'Error'
  return 'Desconectado'
})

const videoResolution = computed(() => {
  if (stats.value.frameWidth && stats.value.frameHeight) {
    return `${stats.value.frameWidth}x${stats.value.frameHeight}`
  }
  return 'N/A'
})

const startStream = async () => {
  if (!videoElement.value) return
  
  error.value = null
  isLoading.value = true
  
  try {
    // Crear RTCPeerConnection
    peerConnection.value = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    })
    
    // Configurar eventos
    peerConnection.value.ontrack = (event) => {
      console.log('Track recibido:', event.track.kind)
      if (videoElement.value && event.streams[0]) {
        videoElement.value.srcObject = event.streams[0]
      }
    }
    
    peerConnection.value.onconnectionstatechange = () => {
      const state = peerConnection.value?.connectionState || 'disconnected'
      connectionState.value = state
      console.log('Connection state:', state)
      
      if (state === 'connected') {
        isConnected.value = true
        isLoading.value = false
        startStatsCollection()
      } else if (state === 'failed' || state === 'disconnected') {
        if (isLoading.value || isConnected.value) {
          error.value = 'Conexión WebRTC falló'
        }
        isConnected.value = false
        isLoading.value = false
      }
    }
    
    peerConnection.value.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.value?.iceConnectionState)
    }
    
    // Crear oferta SDP
    const offer = await peerConnection.value.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false
    })
    
    await peerConnection.value.setLocalDescription(offer)
    
    // Esperar a que se complete la recolección de candidatos ICE
    await waitForIceGatheringComplete(peerConnection.value)
    
    // Enviar oferta al servidor WHEP con candidatos ICE incluidos
    const response = await fetch(whepUrl.value, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        'Accept': 'application/sdp'
      },
      body: peerConnection.value.localDescription!.sdp
    })
    
    if (!response.ok) {
      throw new Error(`WHEP request failed: ${response.status} ${response.statusText}`)
    }
    
    const answerSdp = await response.text()
    const answer = new RTCSessionDescription({
      type: 'answer',
      sdp: answerSdp
    })
    
    await peerConnection.value.setRemoteDescription(answer)
    
    // Obtener Location header para trickle ICE
    const location = response.headers.get('Location')
    if (location) {
      console.log('Session location:', location)
      // Aquí se podría implementar trickle ICE si es necesario
    }
    
  } catch (err: any) {
    console.error('WebRTC Error:', err)
    error.value = err.message || 'Error desconocido en WebRTC'
    isLoading.value = false
    isConnected.value = false
  }
}

// Helper function para esperar que se complete la recolección de candidatos ICE
const waitForIceGatheringComplete = (pc: RTCPeerConnection): Promise<void> => {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve()
      return
    }
    
    const handleIceGatheringStateChange = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange)
        resolve()
      }
    }
    
    pc.addEventListener('icegatheringstatechange', handleIceGatheringStateChange)
    
    // Timeout de seguridad después de 5 segundos
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', handleIceGatheringStateChange)
      resolve()
    }, 5000)
  })
}

const stopStream = () => {
  if (peerConnection.value) {
    peerConnection.value.close()
    peerConnection.value = null
  }
  
  if (videoElement.value) {
    videoElement.value.srcObject = null
  }
  
  isConnected.value = false
  isLoading.value = false
  error.value = null
  stats.value = {}
  connectionState.value = 'disconnected'
  
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}

let statsInterval: number | null = null

const startStatsCollection = () => {
  if (statsInterval) return
  
  statsInterval = setInterval(async () => {
    if (!peerConnection.value || !isConnected.value) return
    
    try {
      const reports = await peerConnection.value.getStats()
      const newStats: any = {}
  
      reports.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          newStats.bytesReceived = report.bytesReceived
          newStats.packetsReceived = report.packetsReceived
          newStats.packetsLost = report.packetsLost
          newStats.framesPerSecond = report.framesPerSecond
          newStats.frameWidth = report.frameWidth
          newStats.frameHeight = report.frameHeight
          
          // Calcular bitrate
          if (stats.value.bytesReceived && stats.value.timestamp) {
            const timeDiff = (report.timestamp - stats.value.timestamp) / 1000
            const bytesDiff = report.bytesReceived - stats.value.bytesReceived
            newStats.bitrate = (bytesDiff * 8) / timeDiff // bits per second
          }
          
          newStats.timestamp = report.timestamp
        }
      })
      
      stats.value = { ...stats.value, ...newStats }
    } catch (err) {
      console.error('Error getting stats:', err)
    }
  }, 1000)
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatBitrate = (bps: number): string => {
  if (bps === 0) return '0 bps'
  const k = 1000
  const sizes = ['bps', 'Kbps', 'Mbps']
  const i = Math.floor(Math.log(bps) / Math.log(k))
  return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onUnmounted(() => {
  stopStream()
})
</script>

<style scoped>
.webrtc-player {
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
  background: #9b59b6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #8e44ad;
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
  border-left: 4px solid #9b59b6;
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