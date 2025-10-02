#!/bin/bash

# Script de monitoreo en tiempo real para el Sistema de Computer Vision

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
REFRESH_INTERVAL=3

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

# Función para obtener el estado de un servicio
get_service_status() {
    local service=$1
    local port=$2
    local pid_file="$LOG_DIR/$service.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        
        if kill -0 $pid 2>/dev/null; then
            # Proceso existe, verificar si responde
            if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
                echo -e "${GREEN}FUNCIONANDO${NC}"
            else
                echo -e "${YELLOW}INICIANDO${NC}"
            fi
            echo " (PID: $pid)"
        else
            echo -e "${RED}DETENIDO${NC} (PID obsoleto: $pid)"
        fi
    else
        echo -e "${YELLOW}NO INICIADO${NC}"
    fi
}

# Función para obtener estadísticas de memoria y CPU
get_process_stats() {
    local pid=$1
    
    if kill -0 $pid 2>/dev/null; then
        local stats=$(ps -p $pid -o %cpu,%mem --no-headers 2>/dev/null)
        if [ -n "$stats" ]; then
            echo "$stats"
        else
            echo "N/A N/A"
        fi
    else
        echo "N/A N/A"
    fi
}

# Función para mostrar el dashboard
show_dashboard() {
    clear
    
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║              🖥️  COMPUTER VISION SYSTEM MONITOR              ║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}📊 Estado de los Servicios (Actualización cada ${REFRESH_INTERVAL}s)${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Servicios Docker
    echo -e "${BLUE}🐳 Servicios Docker:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    local docker_status=""
    if command -v docker-compose > /dev/null; then
        docker_status=$(docker-compose ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}" 2>/dev/null)
    else
        docker_status=$(docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Ports}}" 2>/dev/null)
    fi
    if [ -n "$docker_status" ]; then
        echo "$docker_status"
    else
        echo -e "${YELLOW}No hay servicios Docker corriendo${NC}"
    fi
    
    echo ""
    
    # Servicios Node.js
    echo -e "${BLUE}🟢 Servicios Node.js:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    printf "%-20s %-15s %-10s %-8s %-8s\n" "SERVICIO" "ESTADO" "PUERTO" "CPU%" "MEM%"
    echo "────────────────────────────────────────────────────────────────"
    
    local services=("session-store:8080" "object-storage:8090" "attribute-enricher:8091" "web-ui:8092" "edge-agent:N/A")
    
    for service_port in "${services[@]}"; do
        local service=$(echo $service_port | cut -d':' -f1)
        local port=$(echo $service_port | cut -d':' -f2)
        
        local status_info=""
        local cpu_mem="N/A N/A"
        
        if [ -f "$LOG_DIR/$service.pid" ]; then
            local pid=$(cat "$LOG_DIR/$service.pid")
            
            if kill -0 $pid 2>/dev/null; then
                cpu_mem=$(get_process_stats $pid)
                
                if [ "$port" != "N/A" ] && curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
                    status_info="${GREEN}FUNCIONANDO${NC}"
                elif [ "$port" == "N/A" ]; then
                    status_info="${GREEN}CORRIENDO${NC}"
                else
                    status_info="${YELLOW}INICIANDO${NC}"
                fi
            else
                status_info="${RED}DETENIDO${NC}"
            fi
        else
            status_info="${YELLOW}NO INICIADO${NC}"
        fi
        
        local cpu=$(echo $cpu_mem | cut -d' ' -f1)
        local mem=$(echo $cpu_mem | cut -d' ' -f2)
        
        printf "%-20s %-25s %-10s %-8s %-8s\n" "$service" "$status_info" "$port" "$cpu" "$mem"
    done
    
    echo ""
    
    # URLs de acceso
    echo -e "${BLUE}🌐 URLs de Acceso:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    echo -e "  🖥️  Web UI:              ${GREEN}http://localhost:8092${NC}"
    echo -e "  📊 Session Store API:   ${GREEN}http://localhost:8080${NC}"
    echo -e "  💾 Object Storage:      ${GREEN}http://localhost:8090${NC}"
    echo -e "  🎨 Attribute Enricher:  ${GREEN}http://localhost:8091${NC}"
    echo -e "  📺 MediaMTX HLS:        ${GREEN}http://localhost:8888${NC}"
    echo ""
    
    # Estadísticas del sistema
    echo -e "${BLUE}💻 Estadísticas del Sistema:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    # Uso de CPU y memoria del sistema
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    local mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    local disk_usage=$(df -h "$PROJECT_DIR" | awk 'NR==2{print $5}')
    
    echo -e "  CPU del Sistema:      ${YELLOW}${cpu_usage}%${NC}"
    echo -e "  Memoria del Sistema:  ${YELLOW}${mem_usage}%${NC}"
    echo -e "  Uso de Disco:         ${YELLOW}${disk_usage}${NC}"
    
    # Estadísticas de la base de datos
    if PGPASSWORD=postgres psql -h localhost -U postgres -d session_store -c "SELECT COUNT(*) FROM sessions;" > /dev/null 2>&1; then
        local session_count=$(PGPASSWORD=postgres psql -h localhost -U postgres -d session_store -t -c "SELECT COUNT(*) FROM sessions;" 2>/dev/null | tr -d ' ')
        local detection_count=$(PGPASSWORD=postgres psql -h localhost -U postgres -d session_store -t -c "SELECT COUNT(*) FROM detections;" 2>/dev/null | tr -d ' ')
        echo -e "  Sesiones en DB:       ${CYAN}${session_count}${NC}"
        echo -e "  Detecciones en DB:    ${CYAN}${detection_count}${NC}"
    else
        echo -e "  Base de Datos:        ${RED}No conectada${NC}"
    fi
    
    # Estadísticas de almacenamiento
    if [ -d "$PROJECT_DIR/data/storage" ]; then
        local storage_size=$(du -sh "$PROJECT_DIR/data/storage" 2>/dev/null | cut -f1)
        local storage_files=$(find "$PROJECT_DIR/data/storage" -type f 2>/dev/null | wc -l)
        echo -e "  Almacenamiento:       ${CYAN}${storage_size} (${storage_files} archivos)${NC}"
    else
        echo -e "  Almacenamiento:       ${YELLOW}No disponible${NC}"
    fi
    
    echo ""
    
    # Logs recientes
    echo -e "${BLUE}📝 Logs Recientes:${NC}"
    echo "────────────────────────────────────────────────────────────────"
    
    if [ -d "$LOG_DIR" ]; then
        local recent_logs=$(find "$LOG_DIR" -name "*.log" -type f -exec tail -1 {} \; 2>/dev/null | head -3)
        if [ -n "$recent_logs" ]; then
            echo "$recent_logs" | while read line; do
                echo -e "  ${YELLOW}→${NC} $line"
            done
        else
            echo -e "  ${YELLOW}No hay logs recientes${NC}"
        fi
    else
        echo -e "  ${YELLOW}Directorio de logs no encontrado${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}Presiona Ctrl+C para salir del monitor${NC}"
    echo ""
}

# Función principal
main() {
    echo -e "${BLUE}🔍 Iniciando monitor del sistema...${NC}"
    sleep 2
    
    # Loop principal
    while true; do
        show_dashboard
        sleep $REFRESH_INTERVAL
    done
}

# Función de limpieza al salir
cleanup() {
    clear
    echo -e "${BLUE}📊 Monitor detenido${NC}"
    echo ""
    exit 0
}

# Manejar señales para limpieza
trap cleanup INT TERM

# Verificar que estamos en el directorio correcto
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    log_error "No se encontró el proyecto en $PROJECT_DIR"
    exit 1
fi

# Ejecutar función principal
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi