#!/bin/bash

# Script simplificado para testear el sistema básico
# Solo inicia los servicios esenciales sin Edge Agent

set -e

# Colores para output
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

# Crear directorio de logs
mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

echo ""
echo -e "${PURPLE}🧪 Iniciando Sistema de Computer Vision (Modo Test)${NC}"
echo -e "${PURPLE}===================================================${NC}"
echo ""

# Paso 1: Instalar dependencias básicas
log_step "Instalando dependencias del workspace principal..."
npm install
log_success "Dependencias del workspace instaladas"

# Paso 2: Iniciar PostgreSQL con Docker
log_step "Iniciando PostgreSQL..."
if command -v docker-compose > /dev/null; then
    docker-compose up -d postgres
else
    docker compose up -d postgres
fi

# Esperar a PostgreSQL
log_info "Esperando que PostgreSQL esté listo..."
sleep 10

# Verificar conexión a PostgreSQL
for i in {1..30}; do
    if PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "PostgreSQL conectado"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "PostgreSQL no se pudo conectar"
        exit 1
    fi
    sleep 2
done

# Paso 3: Instalar dependencias del Session Store
log_step "Configurando Session Store..."
cd "$PROJECT_DIR/services/session-store"
npm install > "$LOG_DIR/session-store-install.log" 2>&1
log_success "Dependencias del Session Store instaladas"

# Paso 4: Ejecutar migraciones
log_info "Ejecutando migraciones de base de datos..."
npm run db:migrate > "$LOG_DIR/migrate.log" 2>&1
log_success "Migraciones ejecutadas"

# Paso 5: Compilar y iniciar Session Store
log_info "Compilando Session Store..."
npm run build > "$LOG_DIR/session-store-build.log" 2>&1

log_info "Iniciando Session Store..."
npm run start > "$LOG_DIR/session-store.log" 2>&1 &
SESSION_STORE_PID=$!
echo $SESSION_STORE_PID > "$LOG_DIR/session-store.pid"
log_success "Session Store iniciado (PID: $SESSION_STORE_PID)"

# Esperar que Session Store esté listo
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

# Paso 6: Instalar y iniciar Object Storage
log_step "Configurando Object Storage..."
cd "$PROJECT_DIR/services/object-storage"
npm install > "$LOG_DIR/object-storage-install.log" 2>&1

# Crear directorio de almacenamiento
mkdir -p "$PROJECT_DIR/data/storage"

log_info "Compilando Object Storage..."
npm run build > "$LOG_DIR/object-storage-build.log" 2>&1

log_info "Iniciando Object Storage..."
npm run start > "$LOG_DIR/object-storage.log" 2>&1 &
OBJECT_STORAGE_PID=$!
echo $OBJECT_STORAGE_PID > "$LOG_DIR/object-storage.pid"
log_success "Object Storage iniciado (PID: $OBJECT_STORAGE_PID)"

# Esperar que Object Storage esté listo
log_info "Esperando que Object Storage esté listo..."
for i in {1..30}; do
    if curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
        log_success "Object Storage está funcionando"
        break
    fi
    if [ $i -eq 30 ]; then
        log_error "Object Storage no respondió a tiempo"
        # No salimos aquí, continuamos
        log_warning "Continuando sin Object Storage..."
        break
    fi
    sleep 2
done

# Paso 7: Probar funcionalidad básica
log_step "Ejecutando pruebas básicas..."

# Test Session Store API
session_response=$(curl -s -X POST http://localhost:8080/api/sessions \
    -H "Content-Type: application/json" \
    -d '{
        "startTime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
        "state": "active",
        "metadata": {"test": "basic-test"}
    }')

if echo "$session_response" | grep -q '"id"'; then
    session_id=$(echo "$session_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    log_success "Sesión creada exitosamente: $session_id"
    
    # Test obtener sesión
    get_response=$(curl -s "http://localhost:8080/api/sessions/$session_id")
    if echo "$get_response" | grep -q "$session_id"; then
        log_success "Recuperación de sesión exitosa"
    else
        log_error "Error al recuperar sesión"
    fi
else
    log_error "Error al crear sesión"
    log_error "Respuesta: $session_response"
fi

echo ""
log_step "🎉 Sistema básico funcionando!"
echo ""

# Mostrar estado
echo -e "${BLUE}📊 Estado de los servicios:${NC}"
echo "────────────────────────────────────────"
echo -e "  🐘 PostgreSQL:     ${GREEN}FUNCIONANDO${NC}"

if kill -0 $SESSION_STORE_PID 2>/dev/null && curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
    echo -e "  📊 Session Store:   ${GREEN}FUNCIONANDO${NC} (PID: $SESSION_STORE_PID)"
else
    echo -e "  📊 Session Store:   ${RED}ERROR${NC}"
fi

if [ -f "$LOG_DIR/object-storage.pid" ]; then
    OBJECT_STORAGE_PID=$(cat "$LOG_DIR/object-storage.pid")
    if kill -0 $OBJECT_STORAGE_PID 2>/dev/null && curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
        echo -e "  💾 Object Storage:  ${GREEN}FUNCIONANDO${NC} (PID: $OBJECT_STORAGE_PID)"
    else
        echo -e "  💾 Object Storage:  ${YELLOW}PROBLEMAS${NC}"
    fi
fi

echo ""
echo -e "${BLUE}🌐 URLs de acceso:${NC}"
echo "────────────────────────────────────────"
echo -e "  📊 Session Store API:   ${GREEN}http://localhost:8080${NC}"
echo -e "  💾 Object Storage:      ${GREEN}http://localhost:8090${NC}"
echo ""

echo -e "${YELLOW}Para probar la API manualmente:${NC}"
echo -e "  curl http://localhost:8080/health"
echo -e "  curl http://localhost:8080/api/sessions"
echo ""

echo -e "${YELLOW}Para detener el sistema:${NC}"
echo -e "  $PROJECT_DIR/scripts/stop-system.sh"
echo ""

log_success "✨ Sistema de test listo!"