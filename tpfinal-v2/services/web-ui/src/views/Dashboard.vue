<template>
  <div class="dashboard">
    <div class="header">
      <h1>🎬 Computer Vision System</h1>
      <p>Busca y reproduce sesiones de grabación</p>
    </div>

    <!-- Formulario de búsqueda -->
    <div class="search-section">
      <div class="filters-card">
        <h2>🔍 Filtros de búsqueda</h2>
        <form @submit.prevent="handleSearch" class="search-form">
          <div class="filter-group">
            <label for="existen">Objetos que deben existir:</label>
            <input
              id="existen"
              v-model="filters.existen"
              type="text"
              placeholder="persona,sombrero:red,mascota"
              class="filter-input"
            />
            <small>Separa con comas. Ejemplo: persona,sombrero:red</small>
          </div>
          
          <div class="filter-group">
            <label for="noExisten">Objetos que NO deben existir:</label>
            <input
              id="noExisten"
              v-model="filters.noExisten"
              type="text"
              placeholder="vehiculo,animal:grande"
              class="filter-input"
            />
            <small>Separa con comas. Ejemplo: vehiculo,animal:grande</small>
          </div>
          
          <button 
            type="submit" 
            :disabled="loading"
            class="search-button"
          >
            {{ loading ? '🔄 Buscando...' : '🔍 Buscar' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Resultados -->
    <div class="results-section">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Buscando sesiones...</p>
      </div>

      <div v-else-if="error" class="error-state">
        <h3>❌ Error al buscar sesiones</h3>
        <p>{{ error }}</p>
        <button @click="handleSearch" class="retry-button">
          🔄 Reintentar
        </button>
      </div>

      <div v-else-if="sessions.length === 0 && hasSearched" class="empty-state">
        <h3>📭 No hay sesiones que coincidan</h3>
        <p>Intenta ajustar los filtros o usar términos más amplios</p>
        <ul class="suggestions">
          <li>• Usa términos más generales como "persona" o "objeto"</li>
          <li>• Verifica la ortografía de los filtros</li>
          <li>• Prueba sin filtros para ver todas las sesiones</li>
        </ul>
      </div>

      <div v-else-if="sessions.length > 0" class="sessions-grid">
        <h2>📋 Sesiones encontradas ({{ sessions.length }})</h2>
        <div class="grid">
          <div 
            v-for="session in sessions" 
            :key="session.session_id"
            class="session-card"
            @click="openSession(session)"
          >
            <div class="session-thumbnail">
              <img 
                v-if="session.thumb_url" 
                :src="session.thumb_url"
                :alt="`Miniatura de ${session.session_id}`"
                class="thumbnail-image"
                @error="handleImageError"
              />
              <div v-else class="thumbnail-placeholder">
                📹 Sin miniatura
              </div>
            </div>
            
            <div class="session-info">
              <h3 class="session-id">{{ session.session_id }}</h3>
              <p class="session-device">📱 {{ session.dev_id }}</p>
              <p class="session-date">
                🕒 {{ formatDate(session.created_at) }}
              </p>
              
              <div class="session-classes">
                <span 
                  v-for="cls in session.classes" 
                  :key="cls"
                  class="class-tag"
                >
                  {{ cls }}
                </span>
              </div>
              
              <button class="play-button" @click.stop="openSession(session)">
                ▶️ Reproducir
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Estado inicial -->
      <div v-else-if="!hasSearched" class="initial-state">
        <h2>👋 Bienvenido</h2>
        <p>Usa los filtros de arriba para buscar sesiones de grabación</p>
        <div class="quick-actions">
          <button @click="loadAllSessions" class="quick-button">
            📋 Ver todas las sesiones
          </button>
          <button @click="loadRecentSessions" class="quick-button">
            🕒 Sesiones recientes
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// Estado reactivo
const sessions = ref<any[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const hasSearched = ref(false)

const filters = reactive({
  existen: '',
  noExisten: ''
})

// Funciones
const handleSearch = async () => {
  loading.value = true
  error.value = null
  hasSearched.value = true
  
  try {
    const body: any = {}
    
    if (filters.existen.trim()) {
      body.existen = filters.existen.split(',').map(s => s.trim()).filter(s => s)
    }
    
    if (filters.noExisten.trim()) {
      body.noExisten = filters.noExisten.split(',').map(s => s.trim()).filter(s => s)
    }
    
    const response = await fetch('http://localhost:8080/api/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    sessions.value = data.sessions || []
    
  } catch (err: any) {
    error.value = err.message || 'Error al buscar sesiones'
    console.error('Error en búsqueda:', err)
  } finally {
    loading.value = false
  }
}

const loadAllSessions = async () => {
  filters.existen = ''
  filters.noExisten = ''
  await handleSearch()
}

const loadRecentSessions = async () => {
  // Implementar lógica para sesiones recientes
  await handleSearch()
}

const openSession = (session: any) => {
  router.push({
    name: 'session-detail',
    params: { sessionId: session.session_id },
    query: { 
      playlist: session.playlist_url,
      thumb: session.thumb_url,
      meta: session.meta_url
    }
  })
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

.header p {
  font-size: 1.2rem;
  opacity: 0.9;
  margin: 10px 0;
}

.search-section {
  margin-bottom: 30px;
}

.filters-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 25px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.filters-card h2 {
  margin: 0 0 20px 0;
  font-size: 1.5rem;
}

.search-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.filter-group label {
  font-weight: 600;
  font-size: 1rem;
}

.filter-input {
  padding: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
}

.filter-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.filter-input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.2);
}

.filter-group small {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
}

.search-button {
  padding: 15px 30px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.search-button:hover:not(:disabled) {
  background: #45a049;
  transform: translateY(-2px);
}

.search-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.results-section {
  min-height: 400px;
}

.loading-state, .error-state, .empty-state, .initial-state {
  text-align: center;
  padding: 60px 20px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.retry-button, .quick-button {
  padding: 12px 24px;
  background: #FF6B6B;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  margin: 10px;
  transition: all 0.3s ease;
}

.quick-button {
  background: #4ECDC4;
}

.retry-button:hover, .quick-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.suggestions {
  text-align: left;
  max-width: 400px;
  margin: 20px auto;
  list-style: none;
  padding: 0;
}

.suggestions li {
  margin: 10px 0;
  opacity: 0.9;
}

.sessions-grid h2 {
  margin-bottom: 20px;
  text-align: center;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.session-card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
}

.session-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.session-thumbnail {
  height: 180px;
  overflow: hidden;
  position: relative;
}

.thumbnail-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.8);
}

.session-info {
  padding: 20px;
}

.session-id {
  margin: 0 0 10px 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #FFE66D;
}

.session-device, .session-date {
  margin: 5px 0;
  font-size: 0.9rem;
  opacity: 0.9;
}

.session-classes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 15px 0;
}

.class-tag {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.play-button {
  width: 100%;
  padding: 12px;
  background: #FF6B6B;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.play-button:hover {
  background: #ff5252;
  transform: translateY(-2px);
}

.quick-actions {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-top: 20px;
}

@media (max-width: 768px) {
  .dashboard {
    padding: 15px;
  }
  
  .header h1 {
    font-size: 2rem;
  }
  
  .grid {
    grid-template-columns: 1fr;
  }
  
  .quick-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>