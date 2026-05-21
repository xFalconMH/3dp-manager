#!/usr/bin/env bash
set -euo pipefail

#################################
# TRAP
#################################
trap 'echo -e "\033[1;31m[ERROR]\033[0m Ошибка в строке $LINENO"; exit 1' ERR

#################################
# HELPERS
#################################
log()  { echo -e "\033[1;32m[INFO]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $1"; }
die()  { echo -e "\033[1;31m[ERROR]\033[0m $1"; exit 1; }

need_root() {
  [[ $EUID -eq 0 ]] || die "Запускать только от root"
}

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=("docker" "compose")
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=("docker-compose")
    return 0
  fi

  return 1
}

echo "Перед удалением самостоятельно удалите подписки в 3DP-MANAGER, чтобы инбунды удалились в панели 3x-ui"
read -r -p "Вы уверены, что хотите удалить? (y/n): " answer

case "$answer" in
  y|Y)
    echo "Начинаю удаление..."
    ;;
  *)
    echo "Удаление отменено"
    exit 1
    ;;
esac

#################################
# START
#################################
need_root

PROJECT_DIR="/opt/3dp-manager"

log "Начинаем удаление 3dp-manager"

if [[ -d "$PROJECT_DIR" ]]; then
  cd "$PROJECT_DIR"
else
  warn "Директория $PROJECT_DIR не найдена — проверяем Docker-ресурсы по известным именам"
fi

#################################
# DOCKER COMPOSE DOWN
#################################
if command -v docker >/dev/null 2>&1; then
  if [[ -d "$PROJECT_DIR" && -f docker-compose.yml ]] && resolve_compose_cmd; then
    log "Останавливаем контейнеры 3dp-manager"
    "${COMPOSE_CMD[@]}" down --volumes --remove-orphans || warn "Ошибка при docker compose down"
  else
    warn "docker-compose.yml или Docker Compose не найден — удаляем контейнеры и volumes по известным именам"
  fi

  docker rm -f 3dp-postgres 3dp-backend 3dp-frontend >/dev/null 2>&1 || true

  for volume in 3dp-manager_pg_data 3dpmanager_pg_data; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
      log "Удаляем volume $volume"
      docker volume rm "$volume" >/dev/null 2>&1 || warn "Не удалось удалить volume $volume"
    fi
  done
else
  warn "Docker не установлен — пропуск удаления Docker-ресурсов"
fi

#################################
# CLEAN IMAGES
#################################
if command -v docker >/dev/null 2>&1; then
  log "Удаляем образы 3dp-manager (если есть)"

  docker images --format '{{.Repository}} {{.ID}}' \
    | grep 3dp-manager \
    | awk '{print $2}' \
    | xargs -r docker rmi -f || true
fi

#################################
# REMOVE DIRECTORY
#################################
if [[ -d "$PROJECT_DIR" ]]; then
  log "Удаляем $PROJECT_DIR"
  rm -rf "$PROJECT_DIR"
fi

#################################
# DONE
#################################
log "✔ 3dp-manager полностью удалён"
