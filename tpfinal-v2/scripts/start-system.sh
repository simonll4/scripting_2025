#!/bin/bash

# Script de inicio completo para el Sistema de Computer Vision
# Inicia todos los servicios en el orden correcto y verifica su estado

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuración
PROJECT_DIR="/home/simonll4/Desktop/scritping/tpfinal-v2"
LOG_DIR="$PROJECT_DIR/logs"

# Crear directorio de logs
mkdir -p "$LOG_DIR"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_step() {
    echo -e "${PURPLE}🚀 $1${NC}"
}

# Función para esperar que un servicio esté listo
wait_for_service() {
    local service_name=$1
    local health_url=$2
    local max_attempts=30
    local attempt=1
    
    log_info "Esperando que $service_name esté listo..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$health_url" > /dev/null 2>&1; then
            log_success "$service_name está listo"
            return 0
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            log_warning "Intento $attempt/$max_attempts para $service_name..."
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name no se pudo iniciar en el tiempo esperado"
    return 1
}

# Función para verificar prerrequisitos
check_prerequisites() {
    log_step "Verificando prerrequisitos..."
    
    # Verificar Node.js
    if ! command -v node > /dev/null; then
        log_error "Node.js no encontrado. Por favor instálalo primero."
        exit 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js >= 18 requerido. Versión actual: $(node --version)"
        exit 1
    fi
    
    # Verificar Docker
    if ! command -v docker > /dev/null; then
        log_error "Docker no encontrado. Por favor instálalo primero."
        exit 1
    fi
    
    # Verificar Docker Compose
    if ! command -v docker-compose > /dev/null && ! docker compose version > /dev/null 2>&1; then
        log_error "Docker Compose no encontrado. Por favor instálalo primero."
        exit 1
    fi
    
    # Verificar cámara web
    if [ ! -e "/dev/video0" ]; then
        log_warning "Cámara web no encontrada en /dev/video0"
        log_info "El sistema funcionará sin cámara, usando datos de prueba"
    else
        log_success "Cámara web detectada en /dev/video0"
    fi
    
    # Verificar Python
    if ! command -v python3 > /dev/null; then
        log_error "Python3 no encontrado. Requerido para ONNX."
        exit 1
    fi
    
    log_success "Todos los prerrequisitos están instalados"
}

# Función para descargar modelo ONNX si no existe
ensure_model() {
    log_step "Verificando modelo ONNX..."
    
    local model_path="$PROJECT_DIR/models/yolov8n.onnx"
    
    if [ -f "$model_path" ]; then
        log_success "Modelo ONNX encontrado"
        return 0
    fi
    
    log_info "Descargando modelo YOLOv8 nano..."
    mkdir -p "$PROJECT_DIR/models"
    
    if command -v wget > /dev/null; then
        wget -O "$model_path" "https://github.com/ultralytics/assets/releases/download/v8.0.0/yolov8n.onnx"
    elif command -v curl > /dev/null; then
        curl -L -o "$model_path" "https://github.com/ultralytics/assets/releases/download/v8.0.0/yolov8n.onnx"
    else
        log_error "Ni wget ni curl disponibles para descargar el modelo"
        return 1
    fi
    
    if [ -f "$model_path" ]; then
        log_success "Modelo ONNX descargado exitosamente"
    else
        log_error "Falló la descarga del modelo ONNX"
        return 1
    fi
}

# Función para instalar dependencias
install_dependencies() {
    log_step "Instalando dependencias..."
    
    cd "$PROJECT_DIR"
    
    # Instalar dependencias del workspace principal
    if [ ! -d "node_modules" ]; then
        log_info "Instalando dependencias del workspace principal..."
        npm install
    fi
    
    # Instalar dependencias de todos los servicios
    log_info "Instalando dependencias de todos los servicios..."
    npm run install:workspaces > "$LOG_DIR/install.log" 2>&1
    
    log_success "Dependencias instaladas"
}

# Función para iniciar servicios Docker
start_docker_services() {
    log_step "Iniciando servicios Docker (PostgreSQL, Redis, MediaMTX)..."
    
    cd "$PROJECT_DIR"
    
    # Detener servicios anteriores si existen
    if command -v docker-compose > /dev/null; then
        docker-compose down > /dev/null 2>&1 || true
        docker-compose up -d postgres redis mediamtx
    else
        docker compose down > /dev/null 2>&1 || true
        docker compose up -d postgres redis mediamtx
    fi
    
    # Esperar a PostgreSQL
    log_info "Esperando que PostgreSQL esté listo..."
    local attempts=0
    while [ $attempts -lt 30 ]; do
        if PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "SELECT 1;" > /dev/null 2>&1; then
            break
        fi
        sleep 2
        attempts=$((attempts + 1))
    done
    
    if [ $attempts -eq 30 ]; then
        log_error "PostgreSQL no se pudo conectar"
        return 1
    fi
    
    log_success "Servicios Docker iniciados"
}

# Función para configurar la base de datos
setup_database() {
    log_step "Configurando base de datos..."
    
    cd "$PROJECT_DIR/services/session-store"
    
    # Ejecutar migraciones
    log_info "Ejecutando migraciones de base de datos..."
    npm run db:migrate > "$LOG_DIR/migrate.log" 2>&1
    
    log_success "Base de datos configurada"
}

# Función para iniciar Session Store
start_session_store() {
    log_step "Iniciando Session Store..."
    
    cd "$PROJECT_DIR/services/session-store"
    
    # Compilar TypeScript
    npm run build > "$LOG_DIR/session-store-build.log" 2>&1
    
    # Iniciar servicio en background
    npm run start > "$LOG_DIR/session-store.log" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/session-store.pid"
    
    # Esperar que esté listo
    wait_for_service "Session Store" "http://localhost:8080/health"
    
    log_success "Session Store iniciado (PID: $pid)"
}

# Función para iniciar Object Storage
start_object_storage() {
    log_step "Iniciando Object Storage..."
    
    cd "$PROJECT_DIR/services/object-storage"
    
    # Crear directorio de almacenamiento
    mkdir -p "$PROJECT_DIR/data/storage"
    
    # Compilar TypeScript
    npm run build > "$LOG_DIR/object-storage-build.log" 2>&1
    
    # Iniciar servicio en background
    npm run start > "$LOG_DIR/object-storage.log" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/object-storage.pid"
    
    # Esperar que esté listo
    wait_for_service "Object Storage" "http://localhost:8090/health"
    
    log_success "Object Storage iniciado (PID: $pid)"
}

# Función para iniciar Attribute Enricher
start_attribute_enricher() {
    log_step "Iniciando Attribute Enricher..."
    
    cd "$PROJECT_DIR/services/attribute-enricher"
    
    # Compilar TypeScript
    npm run build > "$LOG_DIR/attribute-enricher-build.log" 2>&1
    
    # Iniciar servicio en background
    npm run start > "$LOG_DIR/attribute-enricher.log" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/attribute-enricher.pid"
    
    # Esperar que esté listo
    wait_for_service "Attribute Enricher" "http://localhost:8091/health"
    
    log_success "Attribute Enricher iniciado (PID: $pid)"
}

# Función para iniciar Web UI
start_web_ui() {
    log_step "Iniciando Web UI..."
    
    cd "$PROJECT_DIR/services/web-ui"
    
    # Compilar para producción
    npm run build > "$LOG_DIR/web-ui-build.log" 2>&1
    
    # Iniciar servidor de producción
    npm run serve > "$LOG_DIR/web-ui.log" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/web-ui.pid"
    
    # Esperar un poco para que inicie
    sleep 5
    
    log_success "Web UI iniciado (PID: $pid)"
}

# Función para iniciar Edge Agent (opcional)
start_edge_agent() {
    log_step "Iniciando Edge Agent..."
    
    cd "$PROJECT_DIR/services/edge-agent"
    
    # Instalar dependencias Python
    if [ ! -f "venv/bin/activate" ]; then
        log_info "Creando entorno virtual Python..."
        python3 -m venv venv
        source venv/bin/activate
        pip install onnxruntime opencv-python numpy > "$LOG_DIR/python-deps.log" 2>&1
    else
        source venv/bin/activate
    fi
    
    # Compilar TypeScript
    npm run build > "$LOG_DIR/edge-agent-build.log" 2>&1
    
    # Iniciar servicio en background
    npm run start > "$LOG_DIR/edge-agent.log" 2>&1 &
    local pid=$!
    echo $pid > "$LOG_DIR/edge-agent.pid"
    
    sleep 3
    
    log_success "Edge Agent iniciado (PID: $pid)"
}

# Función para mostrar el estado de todos los servicios
show_status() {
    echo ""
    log_step "Estado de los servicios:"
    echo ""
    
    # Docker services
    echo -e "${CYAN}📦 Servicios Docker:${NC}"
    if command -v docker-compose > /dev/null; then
        docker-compose ps
    else
        docker compose ps
    fi
    echo ""
    
    # Node.js services
    echo -e "${CYAN}🟢 Servicios Node.js:${NC}"
    
    services=("session-store:8080" "object-storage:8090" "attribute-enricher:8091" "web-ui:8092")
    
    for service_port in "${services[@]}"; do
        service=$(echo $service_port | cut -d':' -f1)
        port=$(echo $service_port | cut -d':' -f2)
        
        if [ -f "$LOG_DIR/$service.pid" ]; then
            pid=$(cat "$LOG_DIR/$service.pid")
            if kill -0 $pid 2>/dev/null; then
                if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
                    echo -e "  ✅ $service (PID: $pid, Puerto: $port) - ${GREEN}FUNCIONANDO${NC}"
                else
                    echo -e "  ⚠️  $service (PID: $pid, Puerto: $port) - ${YELLOW}INICIANDO${NC}"
                fi
            else
                echo -e "  ❌ $service (PID: $pid) - ${RED}DETENIDO${NC}"
            fi
        else
            echo -e "  ⭕ $service - ${YELLOW}NO INICIADO${NC}"
        fi
    done
    
    echo ""
    echo -e "${CYAN}🌐 URLs de acceso:${NC}"
    echo -e "  🖥️  Web UI:              http://localhost:8092"
    echo -e "  📊 Session Store API:   http://localhost:8080"
    echo -e "  💾 Object Storage:      http://localhost:8090"
    echo -e "  🎨 Attribute Enricher:  http://localhost:8091"
    echo -e "  📺 MediaMTX HLS:        http://localhost:8888"
    echo ""
}

# Función para ejecutar pruebas básicas
run_basic_tests() {
    log_step "Ejecutando pruebas básicas..."
    
    # Test Session Store
    if curl -s -f "http://localhost:8080/health" | grep -q "healthy"; then
        log_success "Session Store: OK"
    else
        log_error "Session Store: FALLO"
    fi
    
    # Test Object Storage
    if curl -s -f "http://localhost:8090/health" | grep -q "healthy"; then
        log_success "Object Storage: OK"
    else
        log_error "Object Storage: FALLO"
    fi
    
    # Test Attribute Enricher
    if curl -s -f "http://localhost:8091/health" | grep -q "healthy"; then
        log_success "Attribute Enricher: OK"
    else
        log_error "Attribute Enricher: FALLO"
    fi
    
    # Test creación de sesión
    local session_response=$(curl -s -X POST http://localhost:8080/api/sessions \
        -H "Content-Type: application/json" \
        -d '{
            "startTime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
            "state": "active",
            "metadata": {"test": "startup-test"}
        }')
    
    if echo "$session_response" | grep -q '"id"'; then
        log_success "Creación de sesión: OK"
        local session_id=$(echo "$session_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
        log_info "Sesión de prueba creada: $session_id"
    else
        log_error "Creación de sesión: FALLO"
    fi
}

# Función principal
main() {
    echo ""
    echo -e "${PURPLE}🚀 Iniciando Sistema de Computer Vision${NC}"
    echo -e "${PURPLE}======================================${NC}"
    echo ""
    
    # Cambiar al directorio del proyecto
    cd "$PROJECT_DIR"
    
    # Ejecutar pasos de inicio
    check_prerequisites
    ensure_model
    install_dependencies
    start_docker_services
    setup_database
    start_session_store
    start_object_storage
    start_attribute_enricher
    start_web_ui
    
    # Preguntar si iniciar Edge Agent
    echo ""
    read -p "¿Iniciar Edge Agent (requiere cámara web)? [y/N]: " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        start_edge_agent
    else
        log_info "Edge Agent no iniciado - el sistema funcionará sin detección en tiempo real"
    fi
    
    echo ""
    log_step "🎉 Sistema iniciado exitosamente!"
    
    # Mostrar estado
    show_status
    
    # Ejecutar pruebas básicas
    run_basic_tests
    
    echo ""
    log_success "✨ El sistema está listo para usar!"
    echo ""
    echo -e "${CYAN}Próximos pasos:${NC}"
    echo -e "  1. Abre tu navegador en: ${GREEN}http://localhost:8092${NC}"
    echo -e "  2. Explora el dashboard y crea sesiones"
    echo -e "  3. Revisa los logs en: ${YELLOW}$LOG_DIR/${NC}"
    echo ""
    echo -e "${YELLOW}Para detener todos los servicios, ejecuta:${NC}"
    echo -e "  ${GREEN}$PROJECT_DIR/scripts/stop-system.sh${NC}"
    echo ""
}

# Manejar señales para limpieza
trap 'log_warning "Proceso interrumpido por el usuario"' INT TERM

# Ejecutar función principal
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi