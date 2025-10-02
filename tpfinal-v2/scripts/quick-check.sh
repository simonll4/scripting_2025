#!/bin/bash

# Script ultra-simplificado para probar componentes individuales

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/home/simonll4/Desktop/scritping/tpfinal-v2"

echo -e "${BLUE}🔍 Verificación rápida del sistema${NC}"
echo "======================================"

# Test 1: Verificar estructura del proyecto
echo -e "${BLUE}📁 Estructura del proyecto:${NC}"
ls -la "$PROJECT_DIR/services/"

echo ""
echo -e "${BLUE}📦 Archivos de configuración:${NC}"
[ -f "$PROJECT_DIR/package.json" ] && echo "✅ package.json" || echo "❌ package.json"
[ -f "$PROJECT_DIR/docker-compose.yml" ] && echo "✅ docker-compose.yml" || echo "❌ docker-compose.yml"
[ -f "$PROJECT_DIR/.env" ] && echo "✅ .env" || echo "❌ .env"

echo ""
echo -e "${BLUE}🛠️ Scripts disponibles:${NC}"
ls -la "$PROJECT_DIR/scripts/"

echo ""
echo -e "${BLUE}🐳 Estado de Docker:${NC}"
docker --version
if docker compose version > /dev/null 2>&1; then
    echo "✅ Docker Compose disponible"
else
    echo "❌ Docker Compose no disponible"
fi

echo ""
echo -e "${BLUE}🔌 Puertos en uso:${NC}"
netstat -tlnp 2>/dev/null | grep -E ":(808[0-9]|5432)" || echo "No hay servicios ejecutándose en puertos esperados"

echo ""
echo -e "${BLUE}💾 Iniciando solo PostgreSQL...${NC}"
cd "$PROJECT_DIR"

# Intentar iniciar solo PostgreSQL
if docker compose up -d postgres; then
    echo "✅ PostgreSQL iniciado"
    
    echo -e "${YELLOW}Esperando conexión...${NC}"
    sleep 8
    
    # Probar conexión
    if PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "SELECT version();" 2>/dev/null; then
        echo "✅ PostgreSQL conectado exitosamente"
        
        # Mostrar información de la base
        echo -e "${BLUE}📊 Info de PostgreSQL:${NC}"
        PGPASSWORD=postgres psql -h localhost -U postgres -d postgres -c "SELECT version();" 2>/dev/null | head -1
    else
        echo "❌ No se pudo conectar a PostgreSQL"
    fi
else
    echo "❌ No se pudo iniciar PostgreSQL"
fi

echo ""
echo -e "${BLUE}📋 Siguiente pasos sugeridos:${NC}"
echo "1. Si PostgreSQL funciona, ejecutar: $PROJECT_DIR/scripts/test-basic.sh"
echo "2. Para iniciar sistema completo: $PROJECT_DIR/scripts/start-system.sh"
echo "3. Para monitorear: $PROJECT_DIR/scripts/monitor-system.sh"

echo ""
echo -e "${GREEN}✨ Verificación rápida completada${NC}"