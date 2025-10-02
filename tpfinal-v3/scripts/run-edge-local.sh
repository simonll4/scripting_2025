#!/usr/bin/env bash
set -euo pipefail

# Ejecuta el Edge Agent directamente en el host (sin Docker).
# Usa la cámara local si está disponible y respeta los flags:
#   --with-camera     fuerza usar /dev/video0
#   --no-camera       evita usar la cámara (usa testsrc)
#   --camera-device=/dev/video2  especifica un path distinto
# El resto de los argumentos se pasan al comando `simulate`.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_DIR="$ROOT_DIR/services/edge-agent"
DIST_DIR="$EDGE_DIR/dist"

USE_CAMERA="auto"
CUSTOM_CAMERA=""
NODE_ARGS=()

while (($#)); do
  case "$1" in
    --with-camera)
      USE_CAMERA="yes"
      ;;
    --no-camera)
      USE_CAMERA="no"
      ;;
    --camera-device=*)
      CUSTOM_CAMERA="${1#*=}"
      ;;
    *)
      NODE_ARGS+=("$1")
      ;;
  esac
  shift
done

if [[ ! -d "$DIST_DIR" ]]; then
  echo "[edge-agent] No se encontró la carpeta dist/." >&2
  echo "Generala construyendo las fuentes (npm run build dentro de services/edge-agent) o mantené los archivos precompilados." >&2
  exit 1
fi

pushd "$EDGE_DIR" >/dev/null

ENV_VARS=()

if [[ -n "$CUSTOM_CAMERA" ]]; then
  ENV_VARS+=("CAMERA_DEVICE=$CUSTOM_CAMERA")
else
  case "$USE_CAMERA" in
    yes)
      ENV_VARS+=("CAMERA_DEVICE=/dev/video0")
      ;;
    no)
      ENV_VARS+=("CAMERA_DEVICE=/nonexistent")
      ENV_VARS+=("CAMERA_FALLBACK=testsrc")
      ;;
  esac
fi

NODE_COMMAND=(node dist/index.js simulate "${NODE_ARGS[@]}")

if [[ "${#ENV_VARS[@]}" -gt 0 ]]; then
  env "${ENV_VARS[@]}" "${NODE_COMMAND[@]}"
else
  "${NODE_COMMAND[@]}"
fi

popd >/dev/null
