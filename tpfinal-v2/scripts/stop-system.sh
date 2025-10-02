#!/bin/bash

# Script para detener todos los servicios del Sistema de Computer Vision

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuración
PROJECT_DIR="/home/simonll4/Desktop/scritping/tpfinal-v2"
LOG_DIR="$PROJECT_DIR/logs"

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
    echo -e "${PURPLE}🛑 $1${NC}"
}

# Función para detener un servicio Node.js
stop_service() {
    local service_name=$1
    local pid_file="$LOG_DIR/$service_name.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        
        if kill -0 $pid 2>/dev/null; then
            log_info "Deteniendo $service_name (PID: $pid)..."
            kill $pid
            
            # Esperar hasta 10 segundos para que termine gracefully
            local attempts=0
            while kill -0 $pid 2>/dev/null && [ $attempts -lt 10 ]; do
                sleep 1
                attempts=$((attempts + 1))
            done
            
            # Si todavía está corriendo, forzar cierre
            if kill -0 $pid 2>/dev/null; then
                log_warning "Forzando cierre de $service_name..."
                kill -9 $pid 2>/dev/null || true
            fi
            
            log_success "$service_name detenido"
        else
            log_info "$service_name ya estaba detenido"
        fi
        
        rm -f "$pid_file"
    else
        log_info "No se encontró PID para $service_name"
    fi
}

# Función para detener servicios Docker
stop_docker_services() {
    log_step "Deteniendo servicios Docker..."
    
    cd "$PROJECT_DIR"
    
    if [ -f "docker-compose.yml" ]; then
        if command -v docker-compose > /dev/null; then
            docker-compose down
        else
            docker compose down
        fi
        log_success "Servicios Docker detenidos"
    else
        log_warning "No se encontró docker-compose.yml"
    fi
}

# Función para limpiar procesos huérfanos
cleanup_processes() {
    log_step "Limpiando procesos huérfanos..."
    
    # Buscar procesos Node.js relacionados con nuestros servicios
    local services=("session-store" "object-storage" "attribute-enricher" "web-ui" "edge-agent")
    
    for service in "${services[@]}"; do
        local pids=$(pgrep -f "$service" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            log_info "Encontrados procesos huérfanos de $service: $pids"
            echo $pids | xargs kill -TERM 2>/dev/null || true
            sleep 2
            echo $pids | xargs kill -9 2>/dev/null || true
        fi
    done
    
    log_success "Limpieza de procesos completada"
}

# Función para mostrar resumen
show_summary() {
    echo ""
    log_step "Resumen de cierre:"
    echo ""
    
    # Verificar que no hay servicios corriendo
    local ports=(8080 8088 8090 8091 8092)
    local running_services=0
    
    for port in "${ports[@]}"; do
        if netstat -tln 2>/dev/null | grep -q ":$port "; then
            log_warning "Puerto $port todavía en uso"
            running_services=$((running_services + 1))
        fi
    done
    
    if [ $running_services -eq 0 ]; then
        log_success "Todos los servicios han sido detenidos correctamente"
    else
        log_warning "$running_services servicios podrían seguir ejecutándose"
    fi
    
    # Verificar Docker
    local docker_containers=$(docker ps -q --filter "name=tpfinal-v2" 2>/dev/null | wc -l)
    if [ $docker_containers -eq 0 ]; then
        log_success "Todos los contenedores Docker han sido detenidos"
    else
        log_warning "$docker_containers contenedores Docker podrían seguir ejecutándose"
    fi
    
    echo ""
    log_info "Logs guardados en: $LOG_DIR"
    echo ""
}

# Función principal
main() {
    echo ""
    echo -e "${PURPLE}🛑 Deteniendo Sistema de Computer Vision${NC}"
    echo -e "${PURPLE}=======================================${NC}"
    echo ""
    
    # Cambiar al directorio del proyecto
    cd "$PROJECT_DIR"
    
    # Crear directorio de logs si no existe
    mkdir -p "$LOG_DIR"
    
    # Detener servicios Node.js
    log_step "Deteniendo servicios Node.js..."
    stop_service "session-store"
    stop_service "object-storage"
    stop_service "attribute-enricher"
    stop_service "web-ui"
    stop_service "edge-agent"
    
    # Detener servicios Docker
    stop_docker_services
    
    # Limpiar procesos huérfanos
    cleanup_processes
    
    # Mostrar resumen
    show_summary
    
    log_success "🎉 Sistema detenido exitosamente!"
    echo ""
    echo -e "${YELLOW}Para iniciar nuevamente el sistema, ejecuta:${NC}"
    echo -e "  ${GREEN}$PROJECT_DIR/scripts/start-system.sh${NC}"
    echo ""
}

# Manejar señales
trap 'log_warning "Script de cierre interrumpido"' INT TERM

# Ejecutar función principal
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi