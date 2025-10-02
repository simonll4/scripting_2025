#!/bin/bash

# Script simplificado y corregido para iniciar el sistema

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
log_step "Iniciando Sistema (Modo Corregido)"
echo -e "${PURPLE}====================================${NC}"
echo ""

# Verificar Docker Compose
log_step "Verificando PostgreSQL..."
if ! docker compose ps | grep -q "tpfinal-postgres.*Up"; then
    log_error "PostgreSQL no está funcionando. Iniciando..."
    docker compose up -d postgres
    sleep 5
fi
log_success "PostgreSQL funcionando"

# Verificar estructura de base de datos
log_info "Verificando estructura de base de datos..."
docker compose exec -T postgres psql -U postgres -d session_store -c "\dt" &> /dev/null
if [ $? -eq 0 ]; then
    log_success "Tablas de base de datos encontradas"
else
    log_warning "Creando tablas de base de datos..."
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

CREATE INDEX idx_detections_session_id ON detections(session_id);
CREATE INDEX idx_detections_timestamp ON detections(timestamp);
CREATE INDEX idx_detections_class_name ON detections(class_name);
CREATE INDEX idx_sessions_state ON sessions(state);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);

SELECT 'Database setup completed' as status;
EOF
    log_success "Base de datos configurada"
fi

# Compilar módulo shared primero
log_step "Compilando módulo shared..."
cd "$PROJECT_DIR/shared"
npm run build &> /dev/null
log_success "Módulo shared compilado"

# Limpiar procesos anteriores
log_info "Limpiando procesos anteriores..."
pkill -f "session-store" || true
pkill -f "object-storage" || true
pkill -f "edge-agent" || true
pkill -f "attribute-enricher" || true
rm -f /tmp/session-store.pid /tmp/object-storage.pid /tmp/edge-agent.pid /tmp/attribute-enricher.pid

sleep 2

# Iniciar Session Store
log_step "Iniciando Session Store..."
cd "$PROJECT_DIR/services/session-store"
log_info "Instalando dependencias..."
npm install &> /dev/null
log_info "Compilando TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    log_error "Error compilando Session Store"
    exit 1
fi
log_info "Iniciando servidor..."
nohup npm start > "$LOG_DIR/session-store.log" 2>&1 &
echo $! > /tmp/session-store.pid
log_success "Session Store iniciado (PID: $(cat /tmp/session-store.pid))"

sleep 3

# Verificar que Session Store esté funcionando
if curl -s http://localhost:8080/health > /dev/null; then
    log_success "Session Store respondiendo correctamente"
else
    log_warning "Session Store no responde aún, continuando..."
fi

# Iniciar Object Storage
log_step "Iniciando Object Storage..."
cd "$PROJECT_DIR/services/object-storage"
log_info "Instalando dependencias..."
npm install &> /dev/null
log_info "Compilando TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    log_error "Error compilando Object Storage"
    exit 1
fi
log_info "Iniciando servidor..."
nohup npm start > "$LOG_DIR/object-storage.log" 2>&1 &
echo $! > /tmp/object-storage.pid
log_success "Object Storage iniciado (PID: $(cat /tmp/object-storage.pid))"

sleep 3

# Verificar que Object Storage esté funcionando
if curl -s http://localhost:8090/health > /dev/null; then
    log_success "Object Storage respondiendo correctamente"
else
    log_warning "Object Storage no responde aún, continuando..."
fi

# Iniciar Edge Agent
log_step "Iniciando Edge Agent..."
cd "$PROJECT_DIR/services/edge-agent"
log_info "Instalando dependencias..."
npm install &> /dev/null
log_info "Compilando TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    log_error "Error compilando Edge Agent"
    exit 1
fi
log_info "Iniciando servidor..."
nohup npm start > "$LOG_DIR/edge-agent.log" 2>&1 &
echo $! > /tmp/edge-agent.pid
log_success "Edge Agent iniciado (PID: $(cat /tmp/edge-agent.pid))"

sleep 3

# Iniciar Attribute Enricher
log_step "Iniciando Attribute Enricher..."
cd "$PROJECT_DIR/services/attribute-enricher"
log_info "Instalando dependencias..."
npm install &> /dev/null
log_info "Compilando TypeScript..."
npm run build
if [ $? -ne 0 ]; then
    log_error "Error compilando Attribute Enricher"
    exit 1
fi
log_info "Iniciando servidor..."
nohup npm start > "$LOG_DIR/attribute-enricher.log" 2>&1 &
echo $! > /tmp/attribute-enricher.pid
log_success "Attribute Enricher iniciado (PID: $(cat /tmp/attribute-enricher.pid))"

sleep 2

echo ""
log_success "🎉 ¡Sistema iniciado!"
echo ""
echo -e "${YELLOW}📊 URLs de los servicios:${NC}"
echo -e "  📊 Session Store:     http://localhost:8080"
echo -e "  💾 Object Storage:    http://localhost:8090"
echo -e "  🤖 Edge Agent:        http://localhost:8081"
echo -e "  🎨 Attribute Enricher: http://localhost:8082"
echo ""
echo -e "${YELLOW}🧪 Tests rápidos:${NC}"
echo -e "  curl http://localhost:8080/health"
echo -e "  curl http://localhost:8090/health"
echo -e "  curl http://localhost:8081/health"
echo -e "  curl http://localhost:8082/health"
echo ""
echo -e "${YELLOW}📋 Para ver el estado:${NC}"
echo -e "  ./scripts/status.sh"
echo ""
echo -e "${YELLOW}🛑 Para detener:${NC}"
echo -e "  ./scripts/stop-system.sh"
echo ""