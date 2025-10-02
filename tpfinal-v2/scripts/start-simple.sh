#!/bin/bash

# Script simplificado que usa las tablas ya existentes

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

PROJECT_DIR="/home/simonll4/Desktop/scritping/tpfinal-v2"
LOG_DIR="$PROJECT_DIR/logs"

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_step() { echo -e "${PURPLE}🚀 $1${NC}"; }

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

echo ""
echo -e "${PURPLE}🚀 Iniciando Sistema (Modo Rápido)${NC}"
echo -e "${PURPLE}==================================${NC}"
echo ""

# Verificar PostgreSQL
log_step "Verificando PostgreSQL..."
if docker compose ps | grep -q "postgres.*Up"; then
    log_success "PostgreSQL funcionando"
else
    log_info "Iniciando PostgreSQL..."
    docker compose up -d postgres
    sleep 8
fi

# Verificar tablas existentes
log_info "Verificando estructura de base de datos..."
table_check=$(docker compose exec -T postgres psql -U postgres -d session_store -c "\dt" 2>/dev/null | grep -E "(sessions|detections)" | wc -l)

if [ "$table_check" -ge 2 ]; then
    log_success "Tablas de base de datos encontradas"
else
    log_warning "Recreando estructura de base de datos..."
    docker compose exec -T postgres psql -U postgres -d session_store << 'EOF'
-- Limpiar y recrear tablas
DROP TABLE IF EXISTS detections CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TYPE IF EXISTS session_state CASCADE;

-- Recrear todo
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE session_state AS ENUM ('active', 'completed', 'error');

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  state session_state NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE detections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  class_name VARCHAR(100) NOT NULL,
  confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bounding_box JSONB NOT NULL,
  attributes JSONB DEFAULT '{}',
  enriched_attributes JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_sessions_start_time ON sessions(start_time DESC);
CREATE INDEX idx_detections_session_id ON detections(session_id);
CREATE INDEX idx_detections_timestamp ON detections(timestamp DESC);

SELECT 'Base de datos preparada' as resultado;
EOF
    log_success "Base de datos preparada"
fi

# Iniciar Session Store
log_step "Iniciando Session Store..."
cd "$PROJECT_DIR/services/session-store"

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    log_info "Instalando dependencias..."
    npm install > "$LOG_DIR/session-store-install.log" 2>&1
fi

# Compilar
log_info "Compilando TypeScript..."
npm run build > "$LOG_DIR/session-store-build.log" 2>&1

# Iniciar en background
log_info "Iniciando servicio..."
npm run start > "$LOG_DIR/session-store.log" 2>&1 &
SESSION_STORE_PID=$!
echo $SESSION_STORE_PID > "$LOG_DIR/session-store.pid"

# Esperar que responda
log_info "Esperando respuesta del servicio..."
for i in {1..30}; do
    if curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
        log_success "Session Store funcionando (PID: $SESSION_STORE_PID)"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Session Store no respondió"
        exit 1
    fi
    sleep 2
done

# Iniciar Object Storage
log_step "Iniciando Object Storage..."
cd "$PROJECT_DIR/services/object-storage"

if [ ! -d "node_modules" ]; then
    log_info "Instalando dependencias..."
    npm install > "$LOG_DIR/object-storage-install.log" 2>&1
fi

mkdir -p "$PROJECT_DIR/data/storage"

log_info "Compilando TypeScript..."
npm run build > "$LOG_DIR/object-storage-build.log" 2>&1

log_info "Iniciando servicio..."
npm run start > "$LOG_DIR/object-storage.log" 2>&1 &
OBJECT_STORAGE_PID=$!
echo $OBJECT_STORAGE_PID > "$LOG_DIR/object-storage.pid"

for i in {1..20}; do
    if curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
        log_success "Object Storage funcionando (PID: $OBJECT_STORAGE_PID)"
        break
    fi
    if [ $i -eq 20 ]; then
        log_warning "Object Storage tardó en responder"
        break
    fi
    sleep 2
done

# Probar funcionalidad completa
log_step "Probando funcionalidad del sistema..."

# Crear sesión de prueba
session_data='{
  "startTime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "state": "active",
  "metadata": {
    "test": "inicio-sistema",
    "timestamp": "'$(date)'",
    "camara": "disponible"
  }
}'

session_response=$(curl -s -X POST http://localhost:8080/api/sessions \
    -H "Content-Type: application/json" \
    -d "$session_data")

if echo "$session_response" | grep -q '"id"'; then
    session_id=$(echo "$session_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    log_success "✅ Sesión creada: $session_id"
    
    # Crear detección de prueba
    detection_data='{
      "sessionId": "'$session_id'",
      "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
      "className": "person",
      "confidence": 0.89,
      "boundingBox": {
        "x": 150,
        "y": 100,
        "width": 180,
        "height": 280
      },
      "attributes": {
        "test": true,
        "color": "unknown"
      }
    }'
    
    detection_response=$(curl -s -X POST http://localhost:8080/api/detections \
        -H "Content-Type: application/json" \
        -d "$detection_data")
    
    if echo "$detection_response" | grep -q '"id"'; then
        detection_id=$(echo "$detection_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        log_success "✅ Detección creada: $detection_id"
        
        # Obtener sesión con detecciones
        session_with_detections=$(curl -s "http://localhost:8080/api/sessions/$session_id/detections")
        if echo "$session_with_detections" | grep -q "$detection_id"; then
            log_success "✅ Consulta de detecciones exitosa"
        fi
    else
        log_warning "⚠️  Error creando detección de prueba"
    fi
    
    # Obtener estadísticas
    stats_response=$(curl -s "http://localhost:8090/api/stats")
    if echo "$stats_response" | grep -q "totalSize"; then
        log_success "✅ Object Storage respondiendo correctamente"
    fi
    
else
    log_error "❌ Error creando sesión de prueba"
    log_error "Respuesta: $session_response"
fi

echo ""
log_step "🎉 ¡Sistema funcionando correctamente!"
echo ""

# Estado final
echo -e "${BLUE}📊 Estado Final del Sistema:${NC}"
echo "══════════════════════════════════════════"

# PostgreSQL
if docker compose ps | grep -q "postgres.*Up"; then
    session_count=$(docker compose exec -T postgres psql -U postgres -d session_store -t -c "SELECT COUNT(*) FROM sessions;" 2>/dev/null | tr -d ' ' || echo "?")
    detection_count=$(docker compose exec -T postgres psql -U postgres -d session_store -t -c "SELECT COUNT(*) FROM detections;" 2>/dev/null | tr -d ' ' || echo "?")
    echo -e "  🐘 PostgreSQL:       ${GREEN}FUNCIONANDO${NC} ($session_count sesiones, $detection_count detecciones)"
else
    echo -e "  🐘 PostgreSQL:       ${RED}ERROR${NC}"
fi

# Session Store
if kill -0 $SESSION_STORE_PID 2>/dev/null && curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
    echo -e "  📊 Session Store:     ${GREEN}FUNCIONANDO${NC} (PID: $SESSION_STORE_PID)"
else
    echo -e "  📊 Session Store:     ${RED}ERROR${NC}"
fi

# Object Storage
if kill -0 $OBJECT_STORAGE_PID 2>/dev/null; then
    if curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
        echo -e "  💾 Object Storage:    ${GREEN}FUNCIONANDO${NC} (PID: $OBJECT_STORAGE_PID)"
    else
        echo -e "  💾 Object Storage:    ${YELLOW}INICIANDO${NC} (PID: $OBJECT_STORAGE_PID)"
    fi
else
    echo -e "  💾 Object Storage:    ${RED}ERROR${NC}"
fi

echo ""
echo -e "${BLUE}🌐 Acceso al Sistema:${NC}"
echo "══════════════════════════════════════════"
echo -e "  📊 Session Store API:  ${GREEN}http://localhost:8080${NC}"
echo -e "  💾 Object Storage:     ${GREEN}http://localhost:8090${NC}"
echo ""

echo -e "${BLUE}🧪 Comandos de Prueba:${NC}"
echo "══════════════════════════════════════════"
echo -e "  # Probar API de sesiones"
echo -e "  curl http://localhost:8080/api/sessions"
echo ""
echo -e "  # Ver estadísticas de almacenamiento"  
echo -e "  curl http://localhost:8090/api/stats"
echo ""
echo -e "  # Crear nueva sesión"
echo -e "  curl -X POST http://localhost:8080/api/sessions \\"
echo -e "    -H 'Content-Type: application/json' \\"
echo -e "    -d '{\"startTime\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\",\"state\":\"active\"}'"
echo ""

echo -e "${YELLOW}📱 Para agregar más servicios:${NC}"
echo "══════════════════════════════════════════"
echo -e "  • Web UI:              cd services/web-ui && npm install && npm run build && npm run serve"
echo -e "  • Attribute Enricher:  cd services/attribute-enricher && npm install && npm run build && npm run start"
echo -e "  • Edge Agent:          cd services/edge-agent && npm install && npm run build && npm run start"
echo ""

echo -e "${YELLOW}🛑 Para detener el sistema:${NC}"
echo -e "  $PROJECT_DIR/scripts/stop-system.sh"
echo ""

echo -e "${GREEN}✨ ¡El sistema está listo para conectar tu cámara web!${NC}"
echo -e "${PURPLE}🎥 Tu cámara está en: /dev/video0${NC}"