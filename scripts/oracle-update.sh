#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="gaga-discord-translator:latest"
CONTAINER_NAME="gaga-discord-translator"

cd "${BOT_DIR}"
git pull --ff-only
sudo docker build -t "${IMAGE_NAME}" "${BOT_DIR}"
sudo docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
sudo docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --env-file "${BOT_DIR}/.env" \
  "${IMAGE_NAME}"

echo "✅ 嘎嘎 Bot 已更新並重新啟動。"
