#!/bin/bash

# Script de inicio simplificado que usa PostgreSQL en contenedor

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
echo -e "${PURPLE}🚀 Iniciando Sistema de Computer Vision${NC}"
echo -e "${PURPLE}=====================================${NC}"
echo ""

# Verificar que PostgreSQL esté corriendo
log_step "Verificando PostgreSQL..."
if docker compose ps | grep -q "postgres.*Up.*healthy"; then
    log_success "PostgreSQL ya está funcionando"
else
    log_info "Iniciando PostgreSQL..."
    docker compose up -d postgres
    sleep 10
    
    if docker compose ps | grep -q "postgres.*Up"; then
        log_success "PostgreSQL iniciado"
    else
        log_error "Error al iniciar PostgreSQL"
        exit 1
    fi
fi

# Probar conexión
log_info "Probando conexión a PostgreSQL..."
if docker compose exec -T postgres psql -U postgres -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
    log_success "Conexión a PostgreSQL exitosa"
else
    log_error "No se pudo conectar a PostgreSQL"
    exit 1
fi

# Instalar dependencias de Session Store
log_step "Configurando Session Store..."
cd "$PROJECT_DIR/services/session-store"

if [ ! -d "node_modules" ]; then
    log_info "Instalando dependencias de Session Store..."
    npm install > "$LOG_DIR/session-store-install.log" 2>&1
fi

# Ejecutar migraciones usando el contenedor Docker
log_info "Ejecutando migraciones de base de datos..."
docker compose exec -T postgres psql -U postgres -d postgres << 'EOF'
-- Crear base de datos si no existe
SELECT 'CREATE DATABASE session_store' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'session_store');
\gexec

-- Conectar a la base de datos session_store
\c session_store

-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Enum para estados de sesión
DO $$ BEGIN
  CREATE TYPE session_state AS ENUM ('active', 'completed', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabla de sesiones
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  state session_state NOT NULL DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de detecciones
CREATE TABLE IF NOT EXISTS detections (
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

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_detections_session_id ON detections(session_id);
CREATE INDEX IF NOT EXISTS idx_detections_timestamp ON detections(timestamp DESC);

SELECT 'Migraciones completadas exitosamente' as resultado;
EOF

if [ $? -eq 0 ]; then
    log_success "Migraciones ejecutadas exitosamente"
else
    log_error "Error ejecutando migraciones"
    exit 1
fi

# Compilar Session Store
log_info "Compilando Session Store..."
npm run build > "$LOG_DIR/session-store-build.log" 2>&1

# Iniciar Session Store
log_info "Iniciando Session Store..."
npm run start > "$LOG_DIR/session-store.log" 2>&1 &
SESSION_STORE_PID=$!
echo $SESSION_STORE_PID > "$LOG_DIR/session-store.pid"

# Esperar que esté listo
log_info "Esperando que Session Store esté listo..."
for i in {1..30}; do
    if curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
        log_success "Session Store está funcionando"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Session Store no respondió a tiempo"
        exit 1
    fi
    sleep 2
done

# Instalar y iniciar Object Storage
log_step "Configurando Object Storage..."
cd "$PROJECT_DIR/services/object-storage"

if [ ! -d "node_modules" ]; then
    log_info "Instalando dependencias de Object Storage..."
    npm install > "$LOG_DIR/object-storage-install.log" 2>&1
fi

mkdir -p "$PROJECT_DIR/data/storage"

log_info "Compilando Object Storage..."
npm run build > "$LOG_DIR/object-storage-build.log" 2>&1

log_info "Iniciando Object Storage..."
npm run start > "$LOG_DIR/object-storage.log" 2>&1 &
OBJECT_STORAGE_PID=$!
echo $OBJECT_STORAGE_PID > "$LOG_DIR/object-storage.pid"

# Esperar que esté listo
for i in {1..20}; do
    if curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
        log_success "Object Storage está funcionando"
        break
    fi
    if [ $i -eq 20 ]; then
        log_warning "Object Storage tardó en responder, continuando..."
        break
    fi
    sleep 2
done

# Instalar y iniciar Web UI
log_step "Configurando Web UI..."
cd "$PROJECT_DIR/services/web-ui"

if [ ! -d "node_modules" ]; then
    log_info "Instalando dependencias de Web UI..."
    npm install > "$LOG_DIR/web-ui-install.log" 2>&1
fi

log_info "Compilando Web UI..."
npm run build > "$LOG_DIR/web-ui-build.log" 2>&1

log_info "Iniciando Web UI..."
npm run serve > "$LOG_DIR/web-ui.log" 2>&1 &
WEB_UI_PID=$!
echo $WEB_UI_PID > "$LOG_DIR/web-ui.pid"

sleep 3

# Ejecutar pruebas básicas
log_step "Ejecutando pruebas del sistema..."

# Test crear sesión
session_response=$(curl -s -X POST http://localhost:8080/api/sessions \
    -H "Content-Type: application/json" \
    -d '{
        "startTime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
        "state": "active",
        "metadata": {"test": "sistema-completo", "camara": "disponible"}
    }')

if echo "$session_response" | grep -q '"id"'; then
    session_id=$(echo "$session_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    log_success "✅ Sesión creada: $session_id"
    
    # Test crear detección
    detection_response=$(curl -s -X POST http://localhost:8080/api/detections \
        -H "Content-Type: application/json" \
        -d '{
            "sessionId": "'$session_id'",
            "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
            "className": "person",
            "confidence": 0.95,
            "boundingBox": {"x": 100, "y": 150, "width": 200, "height": 300},
            "attributes": {"test": true}
        }')
    
    if echo "$detection_response" | grep -q '"id"'; then
        detection_id=$(echo "$detection_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        log_success "✅ Detección creada: $detection_id"
    else
        log_warning "⚠️  Error creando detección de prueba"
    fi
else
    log_error "❌ Error creando sesión de prueba"
fi

echo ""
log_step "🎉 Sistema iniciado exitosamente!"
echo ""

# Mostrar estado final
echo -e "${BLUE}📊 Estado de los servicios:${NC}"
echo "════════════════════════════════════════"

# PostgreSQL
if docker compose ps | grep -q "postgres.*Up.*healthy"; then
    echo -e "  🐘 PostgreSQL:      ${GREEN}FUNCIONANDO${NC} (Docker)"
else
    echo -e "  🐘 PostgreSQL:      ${RED}ERROR${NC}"
fi

# Session Store
if kill -0 $SESSION_STORE_PID 2>/dev/null && curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
    echo -e "  📊 Session Store:    ${GREEN}FUNCIONANDO${NC} (PID: $SESSION_STORE_PID)"
else
    echo -e "  📊 Session Store:    ${RED}ERROR${NC}"
fi

# Object Storage
if kill -0 $OBJECT_STORAGE_PID 2>/dev/null; then
    if curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
        echo -e "  💾 Object Storage:   ${GREEN}FUNCIONANDO${NC} (PID: $OBJECT_STORAGE_PID)"
    else
        echo -e "  💾 Object Storage:   ${YELLOW}INICIANDO${NC} (PID: $OBJECT_STORAGE_PID)"
    fi
else
    echo -e "  💾 Object Storage:   ${RED}ERROR${NC}"
fi

# Web UI
if kill -0 $WEB_UI_PID 2>/dev/null; then
    echo -e "  🌐 Web UI:          ${GREEN}FUNCIONANDO${NC} (PID: $WEB_UI_PID)"
else
    echo -e "  🌐 Web UI:          ${YELLOW}INICIANDO${NC}"
fi

echo ""
echo -e "${BLUE}🌐 URLs de acceso:${NC}"
echo "════════════════════════════════════════"
echo -e "  🖥️  Web UI:              ${GREEN}http://localhost:8092${NC}"
echo -e "  📊 Session Store API:   ${GREEN}http://localhost:8080${NC}"
echo -e "  💾 Object Storage:      ${GREEN}http://localhost:8090${NC}"
echo ""

echo -e "${BLUE}🧪 Tests manuales:${NC}"
echo "════════════════════════════════════════"
echo -e "  curl http://localhost:8080/health"
echo -e "  curl http://localhost:8080/api/sessions"
echo -e "  curl http://localhost:8090/health"
echo ""

echo -e "${YELLOW}Para detener el sistema:${NC}"
echo -e "  $PROJECT_DIR/scripts/stop-system.sh"
echo ""

echo -e "${YELLOW}Para monitorear en tiempo real:${NC}"
echo -e "  $PROJECT_DIR/scripts/monitor-system.sh"
echo ""

log_success "✨ ¡Sistema listo para usar con tu cámara web!"
echo ""
echo -e "${PURPLE}🎥 Próximos pasos:${NC}"
echo -e "  1. Abre http://localhost:8092 en tu navegador"
echo -e "  2. El sistema detectará automáticamente tu cámara web (/dev/video0)"
echo -e "  3. Las detecciones se guardarán en la base de datos"
echo -e "  4. Los archivos se almacenarán en data/storage/"