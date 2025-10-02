#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$ROOT_DIR/infra-streaming-local"
WEBCAM_AGENT_DIR="$ROOT_DIR/webcam-agent"
VUE_DIR="$ROOT_DIR/streaming-client"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }
hdr()  { echo -e "${BLUE}$*${NC}"; }

detect_compose_cmd() {
  if command -v docker-compose >/dev/null 2>&1; then
    echo docker-compose
  else
    echo docker compose
  fi
}

COMPOSE_CMD=$(detect_compose_cmd)

host_ip() {
  # Try default route detection first
  local ip
  if command -v ip >/dev/null 2>&1; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++){if($i=="src"){print $(i+1); exit}}}')
  fi
  if [[ -z "${ip:-}" ]]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  if [[ -z "${ip:-}" ]]; then
    ip=127.0.0.1
  fi
  echo "$ip"
}

check_prereqs() {
  hdr "🔍 Verificando prerequisitos..."
  command -v docker >/dev/null 2>&1 || { err "Docker no está instalado"; exit 1; }
  if ! $COMPOSE_CMD version >/dev/null 2>&1; then
    err "Docker Compose no disponible"; exit 1
  fi
  if [[ ! -d "$INFRA_DIR" ]]; then
    err "No se encontró infraestructura en: $INFRA_DIR"; exit 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js no está instalado (necesario para webcam-agent y cliente Vue)"
  fi
  info "✅ Prerequisitos OK"
}

compose_up() {
  local scope=${1:-all} # all | mediamtx
  hdr "🚀 Desplegando infraestructura (scope: $scope)"
  pushd "$INFRA_DIR" >/dev/null
  info "Descargando imágenes..."
  $COMPOSE_CMD pull || true
  if [[ "$scope" == "mediamtx" ]]; then
    $COMPOSE_CMD up -d mediamtx
  else
    $COMPOSE_CMD up -d
  fi
  popd >/dev/null
  info "✅ Infra desplegada"
}

compose_down() {
  hdr "⏹️ Deteniendo infraestructura"
  pushd "$INFRA_DIR" >/dev/null
  $COMPOSE_CMD down
  popd >/dev/null
  info "✅ Servicios detenidos"
}

show_status() {
  hdr "📊 Estado de servicios"
  pushd "$INFRA_DIR" >/dev/null
  $COMPOSE_CMD ps || true
  popd >/dev/null

  local ip; ip=$(host_ip)
  echo
  hdr "🌐 Endpoints (LAN: $ip)"
  echo "  🎥 WebRTC (WHEP):   http://$ip:8889/whep/webcam"
  echo "  📺 HLS (webcam):    http://$ip:8888/webcam/index.m3u8"
  echo "  📡 RTSP (opcional): rtsp://$ip:8554/webcam"
  echo "  📤 RTMP (si habil.): rtmp://$ip:1935/webcam"
  echo
  warn "Para clientes en la misma máquina, también podés usar http://localhost:PUERTO"

  echo
  hdr "🧩 Procesos locales"
  local webcam_pidfile="$WEBCAM_AGENT_DIR/logs/webcam-agent.pid"
  local vue_pidfile="$VUE_DIR/logs/dev.pid"
  
  if is_running_pidfile "$webcam_pidfile" || pgrep -f "node.*index.js" >/dev/null 2>&1; then
    info "webcam-agent: ejecutándose"
  else
    warn "webcam-agent: no está ejecutándose"
  fi
  
  if is_running_pidfile "$vue_pidfile" || pgrep -f "vite.*dev|npm.*run.*dev" >/dev/null 2>&1; then
    info "Vue dev server: ejecutándose (http://localhost:5173)"
  else
    warn "Vue dev server: no está ejecutándose"
  fi
}

show_logs() {
  local service=${1:-mediamtx}
  hdr "📋 Logs ($service)"
  case "$service" in
    mediamtx|web)
      pushd "$INFRA_DIR" >/dev/null
      $COMPOSE_CMD logs -f "$service"
      popd >/dev/null
      ;;
    webcam|webcam-agent)
      if [[ -f "$WEBCAM_AGENT_DIR/logs/webcam-agent.log" ]]; then
        tail -f "$WEBCAM_AGENT_DIR/logs/webcam-agent.log"
      else
        err "No se encontraron logs del webcam-agent en $WEBCAM_AGENT_DIR/logs"
      fi
      ;;
    vue|ui)
      if [[ -f "$VUE_DIR/logs/dev.log" ]]; then
        tail -f "$VUE_DIR/logs/dev.log"
      else
        err "No se encontraron logs del cliente Vue en $VUE_DIR/logs"
      fi
      ;;
    *)
      err "Servicio no reconocido para logs: $service"
      ;;
  esac
}

# ------- Helpers de procesos locales (pidfiles) -------
is_running_pidfile() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] || return 1
  local pid
  pid=$(cat "$pidfile" 2>/dev/null || true)
  [[ -n "${pid:-}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

print_running_from_pidfile() {
  local name="$1"; local pidfile="$2"
  if is_running_pidfile "$pidfile"; then
    echo "running (PID: $(cat "$pidfile"))"
  else
    echo "stopped"
  fi
}

# ------- Webcam Agent -------
start_webcam_agent() {
  hdr "📹 Iniciando webcam-agent..."
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js no está instalado; no se puede iniciar webcam-agent"
    return 1
  fi
  mkdir -p "$WEBCAM_AGENT_DIR/logs"
  pushd "$WEBCAM_AGENT_DIR" >/dev/null
  if [[ ! -d node_modules ]]; then
    info "Instalando dependencias webcam-agent..."
    npm install
  fi
  local pidfile="$WEBCAM_AGENT_DIR/logs/webcam-agent.pid"
  if is_running_pidfile "$pidfile" || pgrep -f "node.*index.js" >/dev/null 2>&1; then
    warn "webcam-agent ya está ejecutándose"
  else
    info "Iniciando con: node index.js"
    nohup node index.js > "$WEBCAM_AGENT_DIR/logs/webcam-agent.log" 2>&1 &
    local ag_pid=$!
    echo "$ag_pid" > "$pidfile"
    sleep 2
    if kill -0 "$ag_pid" 2>/dev/null; then
      info "✅ webcam-agent iniciado (PID: $ag_pid)"
    else
      err "❌ Error iniciando webcam-agent. Ver logs: tail -f $WEBCAM_AGENT_DIR/logs/webcam-agent.log"
    fi
  fi
  popd >/dev/null
}

stop_webcam_agent() {
  hdr "⏹️  Deteniendo webcam-agent..."
  local pidfile="$WEBCAM_AGENT_DIR/logs/webcam-agent.pid"
  local stopped=false
  
  # Intentar con pidfile primero
  if is_running_pidfile "$pidfile"; then
    local pid
    pid=$(cat "$pidfile")
    kill -TERM "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      warn "Forzando cierre..."
      kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
    stopped=true
  fi
  
  # Buscar y matar cualquier proceso node index.js en el directorio
  local pids
  pids=$(pgrep -f "node.*index.js" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done
    stopped=true
  fi
  
  if $stopped; then
    info "✅ webcam-agent detenido"
  else
    warn "webcam-agent no estaba ejecutándose"
  fi
  rm -f "$pidfile" 2>/dev/null || true
}

# ------- Vue Dev Server -------
start_vue() {
  hdr "🟢 Iniciando cliente Vue..."
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js no está instalado; no se puede iniciar el cliente Vue"
    return 1
  fi
  mkdir -p "$VUE_DIR/logs"
  pushd "$VUE_DIR" >/dev/null
  if [[ ! -d node_modules ]]; then
    info "Instalando dependencias del cliente..."
    npm install
  fi
  local pidfile="$VUE_DIR/logs/dev.pid"
  if is_running_pidfile "$pidfile" || pgrep -f "npm.*run.*dev" >/dev/null 2>&1; then
    warn "Vue dev server ya está ejecutándose"
  else
    info "Iniciando con: npm run dev --host 0.0.0.0"
    nohup npm run dev -- --host 0.0.0.0 > "$VUE_DIR/logs/dev.log" 2>&1 &
    local v_pid=$!
    echo "$v_pid" > "$pidfile"
    sleep 3
    if kill -0 "$v_pid" 2>/dev/null; then
      info "✅ Vue dev server iniciado"
      info "   📱 Local:    http://localhost:5173"
      info "   🌐 Network:  http://$(host_ip):5173"
    else
      err "❌ Error iniciando Vue dev server. Ver logs: tail -f $VUE_DIR/logs/dev.log"
    fi
  fi
  popd >/dev/null
}

stop_vue() {
  hdr "⏹️  Deteniendo cliente Vue..."
  local pidfile="$VUE_DIR/logs/dev.pid"
  local stopped=false
  
  # Intentar con pidfile primero
  if is_running_pidfile "$pidfile"; then
    local pid
    pid=$(cat "$pidfile")
    kill -TERM "$pid" 2>/dev/null || true
    sleep 2
    if kill -0 "$pid" 2>/dev/null; then
      warn "Forzando cierre..."
      kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
    stopped=true
  fi
  
  # Buscar y matar cualquier proceso npm run dev
  local pids
  pids=$(pgrep -f "npm.*run.*dev" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -KILL "$pid" 2>/dev/null || true
      fi
    done
    stopped=true
  fi
  
  # También matar procesos vite
  pids=$(pgrep -f "vite.*dev" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    stopped=true
  fi
  
  if $stopped; then
    info "✅ Cliente Vue detenido"
  else
    warn "Cliente Vue no estaba ejecutándose"
  fi
  rm -f "$pidfile" 2>/dev/null || true
}

usage() {
  cat <<EOF
🎥 Deploy de tpfinal (MediaMTX local)

Uso: $0 <comando> [opciones]

Comandos:
  deploy [--mediamtx-only]   Desplegar servicios (default: all) + iniciar webcam-agent + Vue
  up [--mediamtx-only]       Alias de deploy
  down                       Detener todos los servicios
  restart                    Reiniciar servicios
  status                     Mostrar estado y endpoints
  logs [servicio]            Ver logs (mediamtx | webcam | vue)
  start-webcam               Iniciar webcam-agent
  stop-webcam                Detener webcam-agent
  start-ui                   Iniciar cliente Vue (Vite dev server)
  stop-ui                    Detener cliente Vue
  ip                         Mostrar IP LAN detectada
  debug                      Mostrar información de debug

Ejemplos:
  $0 deploy --mediamtx-only
  $0 status
  $0 logs mediamtx
  $0 debug
EOF
}

main() {
  local cmd=${1:-}
  shift || true
  case "$cmd" in
    deploy|up)
      local scope=all
      if [[ "${1:-}" == "--mediamtx-only" ]]; then scope=mediamtx; shift; fi
      check_prereqs
      compose_up "$scope"
      start_webcam_agent || true
      start_vue || true
      show_status
      ;;
    down)
      check_prereqs
      stop_vue || true
      stop_webcam_agent || true
      compose_down
      ;;
    restart)
      check_prereqs
      stop_vue || true
      stop_webcam_agent || true
      compose_down
      sleep 1
      compose_up all
      start_webcam_agent || true
      start_vue || true
      show_status
      ;;
    status)
      check_prereqs
      show_status
      ;;
    logs)
      check_prereqs
      show_logs "${1:-mediamtx}"
      ;;
    start-webcam)
      check_prereqs
      start_webcam_agent
      ;;
    stop-webcam)
      check_prereqs
      stop_webcam_agent
      ;;
    start-ui)
      check_prereqs
      start_vue
      ;;
    stop-ui)
      check_prereqs
      stop_vue
      ;;
    ip)
      echo "$(host_ip)"
      ;;
    debug)
      check_prereqs
      hdr "🔍 Información de debug"
      echo "Host IP: $(host_ip)"
      echo "Docker Compose: $COMPOSE_CMD"
      echo "Checking GStreamer..."
      if command -v gst-launch-1.0 >/dev/null 2>&1; then
        info "✅ GStreamer instalado: $(gst-launch-1.0 --version 2>&1 | head -1)"
      else
        warn "❌ GStreamer no encontrado"
        echo "   Instalar con: sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-*"
      fi
      echo "Checking video devices..."
      if ls /dev/video* >/dev/null 2>&1; then
        info "✅ Dispositivos de video:"
        ls -la /dev/video* | sed 's/^/   /'
      else
        warn "❌ No se encontraron dispositivos de video"
      fi
      ;;
    ""|-h|--help|help)
      usage
      ;;
    *)
      err "Comando no reconocido: $cmd"
      usage
      exit 1
      ;;
  esac
}

main "$@"
