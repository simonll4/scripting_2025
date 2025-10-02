#!/usr/bin/env bash
set -euo pipefail

# Installs Node dependencies, builds TypeScript services, and starts the docker stack.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICES=(
  "services/session-store"
  "services/edge-agent"
)

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Required command '$1' not found" >&2
    exit 1
  fi
}

echo "[setup] Checking required commands"
ensure_command npm
ensure_command docker
echo "[setup] -> npm and docker found"

echo "[setup] Installing and building services"
for service in "${SERVICES[@]}"; do
  service_path="${ROOT_DIR}/${service}"
  if [[ ! -f "${service_path}/package.json" ]]; then
    echo "[setup] Skipping ${service} (no package.json)"
    continue
  fi

  echo "[setup] -> Entering ${service_path}"
  pushd "${service_path}" >/dev/null

  echo "[setup] --> Running: npm install"
  npm install

  echo "[setup] --> Running: npm run build"
  npm run build

  echo "[setup] <- Leaving ${service_path}"
  popd >/dev/null
done

COMPOSE_CMD=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
  else
    echo "[ERROR] docker compose not found" >&2
    exit 1
  fi
fi

echo "[setup] Pruning stale docker builder cache"
docker builder prune -f >/dev/null 2>&1 || true

echo "[setup] Building docker images with: ${COMPOSE_CMD[*]} -f ${ROOT_DIR}/docker-compose.yml build"
"${COMPOSE_CMD[@]}" -f "${ROOT_DIR}/docker-compose.yml" build

echo "[setup] Starting docker services with: ${COMPOSE_CMD[*]} -f ${ROOT_DIR}/docker-compose.yml up -d"
"${COMPOSE_CMD[@]}" -f "${ROOT_DIR}/docker-compose.yml" up -d

echo "[setup] Listing running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo "[setup] Done ✅"



# #!/usr/bin/env bash
# set -euo pipefail

# # Installs Node dependencies, builds TypeScript services, and starts the docker stack.

# ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# SERVICES=(
#   "services/session-store"
#   "services/edge-agent"
# )

# ensure_command() {
#   if ! command -v "$1" >/dev/null 2>&1; then
#     echo "Required command '$1' not found" >&2
#     exit 1
#   fi
# }

# echo "[setup] Checking required commands"
# ensure_command npm
# ensure_command docker

# echo "[setup] Installing and building services"
# for service in "${SERVICES[@]}"; do
#   service_path="${ROOT_DIR}/${service}"
#   if [[ ! -f "${service_path}/package.json" ]]; then
#     echo "Skipping ${service} (no package.json)" >&2
#     continue
#   fi
#   echo "[setup] -> ${service}"
#   pushd "${service_path}" >/dev/null
#   npm install
#   npm run build
#   popd >/dev/null
# done

# COMPOSE_CMD=(docker compose)
# if ! docker compose version >/dev/null 2>&1; then
#   if command -v docker-compose >/dev/null 2>&1; then
#     COMPOSE_CMD=(docker-compose)
#   else
#     echo "docker compose not found" >&2
#     exit 1
#   fi
# fi

# echo "[setup] Starting docker services"
# "${COMPOSE_CMD[@]}" -f "${ROOT_DIR}/docker-compose.yml" up -d

# echo "[setup] Done"
