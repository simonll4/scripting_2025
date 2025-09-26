#!/bin/bash

# Script de gestión del sistema de streaming con webcam

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBCAM_AGENT_DIR="$SCRIPT_DIR/webcam-agent"
STREAMING_DIR="$SCRIPT_DIR/streaming-local"

# Inicializar comandos de Docker
DOCKER_CMD="docker"
COMPOSE_CMD="docker compose"

# Detectar Docker y Docker Compose disponibles
if command -v docker &> /dev/null; then
    DOCKER_CMD="docker"
    elif test -x /usr/local/bin/docker; then
    DOCKER_CMD="/usr/local/bin/docker"
fi

if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="$DOCKER_CMD compose"
fi

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes coloreados
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

# Verificar prerequisitos
check_prerequisites() {
    print_header "🔍 Verificando prerequisitos..."
    
    # Docker y Docker Compose
    if ! command -v docker &> /dev/null && ! test -x /usr/local/bin/docker; then
        print_error "Docker no está instalado"
        exit 1
    fi
    
    # Usar el docker correcto
    if command -v docker &> /dev/null; then
        DOCKER_CMD="docker"
        elif test -x /usr/local/bin/docker; then
        DOCKER_CMD="/usr/local/bin/docker"
    fi
    
    if ! command -v docker-compose &> /dev/null && ! $DOCKER_CMD compose version &> /dev/null 2>&1; then
        print_error "Docker Compose no está instalado"
        exit 1
    fi
    
    # Determinar comando de compose
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        COMPOSE_CMD="$DOCKER_CMD compose"
    fi
    
    # Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js no está instalado"
        exit 1
    fi
    
    # GStreamer
    if ! command -v gst-launch-1.0 &> /dev/null; then
        print_warning "GStreamer no está instalado"
        echo "Para instalar GStreamer:"
        echo "  sudo apt update"
        echo "  sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly"
        exit 1
    fi
    
    # Dispositivos de video
    if ! ls /dev/video* &> /dev/null; then
        print_warning "No se encontraron dispositivos de video"
        echo "Conecta tu webcam y verifica con: ls -la /dev/video*"
    else
        print_status "Dispositivos de video encontrados:"
        ls -la /dev/video* || true
    fi
    
    print_status "✅ Prerequisitos verificados"
}

# Instalar dependencias
install_dependencies() {
    print_header "📦 Instalando dependencias..."
    
    if [ -d "$WEBCAM_AGENT_DIR" ]; then
        cd "$WEBCAM_AGENT_DIR"
        if [ ! -d "node_modules" ]; then
            print_status "Instalando dependencias de Node.js..."
            npm install
        else
            print_status "Dependencias ya instaladas"
        fi
        cd "$SCRIPT_DIR"
    fi
}

# Iniciar MediaMTX
start_mediamtx() {
    print_header "🚀 Iniciando MediaMTX..."
    
    cd "$STREAMING_DIR"
    
    if $COMPOSE_CMD ps | grep -q "mediamtx.*Up"; then
        print_status "MediaMTX ya está ejecutándose"
    else
        $COMPOSE_CMD up -d
        print_status "MediaMTX iniciado"
        sleep 3
    fi
    
    cd "$SCRIPT_DIR"
}

# Detener MediaMTX
stop_mediamtx() {
    print_header "⏹️ Deteniendo MediaMTX..."
    
    cd "$STREAMING_DIR"
    $COMPOSE_CMD down
    print_status "MediaMTX detenido"
    cd "$SCRIPT_DIR"
}

# Iniciar agente de webcam
start_webcam_agent() {
    print_header "📹 Iniciando agente de webcam..."
    
    cd "$WEBCAM_AGENT_DIR"
    
    # Verificar si ya está ejecutándose
    if pgrep -f "node.*index.js" > /dev/null; then
        print_warning "El agente de webcam ya está ejecutándose"
        print_status "PIDs: $(pgrep -f 'node.*index.js' | tr '\n' ' ')"
        return
    fi
    
    # Iniciar en background
    nohup npm start > logs/webcam-agent.log 2>&1 &
    AGENT_PID=$!
    
    print_status "Agente de webcam iniciado (PID: $AGENT_PID)"
    print_status "Logs: tail -f $WEBCAM_AGENT_DIR/logs/webcam-agent.log"
    
    cd "$SCRIPT_DIR"
}

# Detener agente de webcam
stop_webcam_agent() {
    print_header "⏹️ Deteniendo agente de webcam..."
    
    PIDS=$(pgrep -f "node.*index.js" || true)
    
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill -TERM
        sleep 2
        
        # Verificar si siguen ejecutándose
        REMAINING_PIDS=$(pgrep -f "node.*index.js" || true)
        if [ -n "$REMAINING_PIDS" ]; then
            print_warning "Forzando cierre de procesos restantes..."
            echo "$REMAINING_PIDS" | xargs kill -KILL
        fi
        
        print_status "Agente de webcam detenido"
    else
        print_status "El agente de webcam no está ejecutándose"
    fi
}

# Ver estado del sistema
show_status() {
    print_header "📊 Estado del sistema"
    
    echo
    print_status "🐳 Estado de Docker:"
    cd "$STREAMING_DIR"
    $COMPOSE_CMD ps || true
    cd "$SCRIPT_DIR"
    
    echo
    print_status "📹 Procesos de webcam:"
    if pgrep -f "node.*index.js" > /dev/null; then
        echo "  ✅ Agente ejecutándose (PIDs: $(pgrep -f 'node.*index.js' | tr '\n' ' '))"
    else
        echo "  ❌ Agente no está ejecutándose"
    fi
    
    echo
    print_status "🌐 URLs disponibles:"
    echo "  📺 Player web: http://localhost:8080/web/player.html"
    echo "  🎥 HLS: http://localhost:8888/webcam/index.m3u8"
    echo "  📡 RTSP: rtsp://localhost:8554/webcam"
    echo "  📤 RTMP: rtmp://localhost:1935/webcam"
    echo "  📁 Grabaciones: http://localhost:8080/recordings/"
}

# Ver logs
show_logs() {
    local service=$1
    
    case $service in
        "mediamtx")
            print_header "📋 Logs de MediaMTX"
            cd "$STREAMING_DIR"
            $COMPOSE_CMD logs -f mediamtx
        ;;
        "webcam"|"agent")
            print_header "📋 Logs del agente de webcam"
            if [ -f "$WEBCAM_AGENT_DIR/logs/combined.log" ]; then
                tail -f "$WEBCAM_AGENT_DIR/logs/combined.log"
            else
                print_error "No se encontraron logs del agente"
            fi
        ;;
        *)
            print_error "Servicio no válido. Use: mediamtx, webcam"
        ;;
    esac
}

# Test de dispositivos
test_devices() {
    print_header "🧪 Probando dispositivos de video"
    
    print_status "Dispositivos disponibles:"
    ls -la /dev/video* 2>/dev/null || print_warning "No se encontraron dispositivos /dev/video*"
    
    if command -v v4l2-ctl &> /dev/null; then
        echo
        print_status "Información detallada de dispositivos:"
        v4l2-ctl --list-devices 2>/dev/null || print_warning "Error al listar dispositivos"
        
        echo
        print_status "Formatos soportados por /dev/video0:"
        v4l2-ctl --device=/dev/video0 --list-formats-ext 2>/dev/null || print_warning "No se pudo acceder a /dev/video0"
    else
        print_warning "v4l2-ctl no está instalado. Instalar con: sudo apt install v4l-utils"
    fi
}

# Test de GStreamer
test_gstreamer() {
    print_header "🧪 Probando GStreamer"
    
    local device=${1:-/dev/video0}
    
    print_status "Probando captura desde $device..."
    print_status "Presiona Ctrl+C para detener el test"
    
    gst-launch-1.0 v4l2src device="$device" num-buffers=100 ! \
    video/x-raw,width=640,height=480,framerate=15/1 ! \
    videoconvert ! autovideosink
}

# Función principal
main() {
    case $1 in
        "check")
            check_prerequisites
        ;;
        "install")
            check_prerequisites
            install_dependencies
        ;;
        "start")
            check_prerequisites
            install_dependencies
            start_mediamtx
            sleep 3
            start_webcam_agent
            sleep 2
            show_status
        ;;
        "stop")
            stop_webcam_agent
            stop_mediamtx
        ;;
        "restart")
            $0 stop
            sleep 2
            $0 start
        ;;
        "status")
            show_status
        ;;
        "logs")
            show_logs $2
        ;;
        "test-devices")
            test_devices
        ;;
        "test-gstreamer")
            test_gstreamer $2
        ;;
        "start-mediamtx")
            start_mediamtx
        ;;
        "stop-mediamtx")
            stop_mediamtx
        ;;
        "start-webcam")
            start_webcam_agent
        ;;
        "stop-webcam")
            stop_webcam_agent
        ;;
        *)
            print_header "🎥 Sistema de Streaming con Webcam"
            echo
            echo "Uso: $0 <comando> [opciones]"
            echo
            echo "Comandos principales:"
            echo "  start           - Iniciar todo el sistema (MediaMTX + Webcam Agent)"
            echo "  stop            - Detener todo el sistema"
            echo "  restart         - Reiniciar todo el sistema"
            echo "  status          - Ver estado del sistema"
            echo
            echo "Comandos individuales:"
            echo "  start-mediamtx  - Iniciar solo MediaMTX"
            echo "  stop-mediamtx   - Detener solo MediaMTX"
            echo "  start-webcam    - Iniciar solo el agente de webcam"
            echo "  stop-webcam     - Detener solo el agente de webcam"
            echo
            echo "Utilidades:"
            echo "  check           - Verificar prerequisitos"
            echo "  install         - Instalar dependencias"
            echo "  logs <servicio> - Ver logs (mediamtx|webcam)"
            echo "  test-devices    - Probar dispositivos de video"
            echo "  test-gstreamer [device] - Probar GStreamer"
            echo
            echo "Ejemplos:"
            echo "  $0 start                    # Iniciar todo"
            echo "  $0 logs webcam             # Ver logs del agente"
            echo "  $0 test-gstreamer /dev/video1  # Probar otra webcam"
        ;;
    esac
}

# Ejecutar función principal con todos los argumentos
main "$@"