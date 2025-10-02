#!/bin/bash

# Script de monitoreo simple

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/home/simonll4/Desktop/scritping/tpfinal-v2"
LOG_DIR="$PROJECT_DIR/logs"

echo -e "${BLUE}🔍 Estado del Sistema de Computer Vision${NC}"
echo "════════════════════════════════════════════"

# PostgreSQL
echo -n "🐘 PostgreSQL: "
if docker compose ps | grep -q "postgres.*Up"; then
    echo -e "${GREEN}FUNCIONANDO${NC}"
else
    echo -e "${RED}DETENIDO${NC}"
fi

# Session Store
echo -n "📊 Session Store: "
if [ -f "$LOG_DIR/session-store.pid" ]; then
    pid=$(cat "$LOG_DIR/session-store.pid")
    if kill -0 $pid 2>/dev/null; then
        if curl -s -f "http://localhost:8080/health" > /dev/null 2>&1; then
            echo -e "${GREEN}FUNCIONANDO${NC} (PID: $pid)"
        else
            echo -e "${YELLOW}INICIANDO${NC} (PID: $pid)"
        fi
    else
        echo -e "${RED}DETENIDO${NC}"
    fi
else
    echo -e "${YELLOW}NO INICIADO${NC}"
fi

# Object Storage
echo -n "💾 Object Storage: "
if [ -f "$LOG_DIR/object-storage.pid" ]; then
    pid=$(cat "$LOG_DIR/object-storage.pid")
    if kill -0 $pid 2>/dev/null; then
        if curl -s -f "http://localhost:8090/health" > /dev/null 2>&1; then
            echo -e "${GREEN}FUNCIONANDO${NC} (PID: $pid)"
        else
            echo -e "${YELLOW}INICIANDO${NC} (PID: $pid)"
        fi
    else
        echo -e "${RED}DETENIDO${NC}"
    fi
else
    echo -e "${YELLOW}NO INICIADO${NC}"
fi

echo ""
echo -e "${BLUE}🌐 URLs:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📊 Session Store: http://localhost:8080"
echo "  💾 Object Storage: http://localhost:8090"

echo ""
echo -e "${BLUE}🧪 Tests rápidos:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  curl http://localhost:8080/health"
echo "  curl http://localhost:8080/api/sessions"

if [ -d "$LOG_DIR" ] && [ "$(ls -A $LOG_DIR)" ]; then
    echo ""
    echo -e "${BLUE}📝 Logs recientes:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    find "$LOG_DIR" -name "*.log" -type f -exec tail -1 {} \; 2>/dev/null | head -3
fi