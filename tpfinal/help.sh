#!/usr/bin/env bash

# Quick start script para tpfinal
# Uso rápido del sistema de streaming

echo "🎥 TPFinal - Sistema de Streaming"
echo "=================================="
echo

# Obtener directorio del script
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Comandos disponibles:"
echo
echo "  1. 🆙  Iniciar todo          → ./deploy.sh deploy"
echo "  2. 📊  Ver estado           → ./deploy.sh status"
echo "  3. ⏹️   Detener todo         → ./deploy.sh down"
echo "  4. 🔄  Reiniciar            → ./deploy.sh restart"
echo "  5. 📋  Ver logs MediaMTX    → ./deploy.sh logs mediamtx"
echo "  6. 📋  Ver logs webcam      → ./deploy.sh logs webcam"
echo "  7. 📋  Ver logs Vue         → ./deploy.sh logs vue"
echo "  8. 🔍  Debug/Diagnóstico   → ./deploy.sh debug"
echo

echo "🌐 URLs de acceso:"
echo "  • Cliente Web:    http://localhost:5173"
echo "  • HLS Stream:     http://localhost:8888/webcam/index.m3u8"
echo "  • WebRTC WHEP:    http://localhost:8889/whep/webcam"
echo "  • RTSP Stream:    rtsp://localhost:8554/webcam"
echo

echo "🛠️  Comandos individuales:"
echo "  • Solo MediaMTX:       ./deploy.sh deploy --mediamtx-only"
echo "  • Iniciar webcam:      ./deploy.sh start-webcam"
echo "  • Detener webcam:      ./deploy.sh stop-webcam"
echo "  • Iniciar Vue:         ./deploy.sh start-ui"
echo "  • Detener Vue:         ./deploy.sh stop-ui"
echo

echo "📝 Logs en tiempo real:"
echo "  • MediaMTX:   ./deploy.sh logs mediamtx"
echo "  • Webcam:     ./deploy.sh logs webcam"
echo "  • Vue:        ./deploy.sh logs vue"
echo

echo "❓ Para ayuda completa: ./deploy.sh --help"
echo

# Mostrar estado actual si deploy.sh existe
if [[ -f "$ROOT_DIR/deploy.sh" ]]; then
    echo "📊 Estado actual:"
    "$ROOT_DIR/deploy.sh" status 2>/dev/null | grep -E "\[INFO\]|\[WARN\]|🧩|📊" | head -5
fi

echo
echo "🎯 Inicio rápido: ./deploy.sh deploy"
echo "🌟 ¡A streamear!"