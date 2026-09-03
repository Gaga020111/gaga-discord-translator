#!/usr/bin/env bash
set -euo pipefail

BOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="gaga-discord-translator:latest"
CONTAINER_NAME="gaga-discord-translator"

echo "安裝 Docker（可能需要輸入 Oracle 主機的管理密碼）..."
sudo apt-get update
sudo apt-get install -y docker.io ca-certificates
sudo systemctl enable --now docker

echo
echo "請輸入密鑰。輸入時畫面不會顯示文字，這是正常的。"
read -r -s -p "Discord Bot Token: " DISCORD_BOT_TOKEN
echo
read -r -s -p "Groq API Key: " GROQ_SECRET_KEY
echo
read -r -p "Discord 伺服器 ID（可留白）: " DISCORD_GUILD_ID

if [[ -z "${DISCORD_BOT_TOKEN}" || -z "${GROQ_SECRET_KEY}" ]]; then
  echo "Discord Token 和 Groq API Key 都不能留白。" >&2
  exit 1
fi

umask 077
ENV_FILE="$(mktemp "${BOT_DIR}/.env.XXXXXX")"
printf 'DISCORD_TOKEN=%s\n' "${DISCORD_BOT_TOKEN}" > "${ENV_FILE}"
printf 'GROQ_API_KEY=%s\n' "${GROQ_SECRET_KEY}" >> "${ENV_FILE}"
printf 'TEST_GUILD_ID=%s\n' "${DISCORD_GUILD_ID}" >> "${ENV_FILE}"
printf 'GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo\n' >> "${ENV_FILE}"
printf 'GROQ_TRANSLATION_MODEL=openai/gpt-oss-20b\n' >> "${ENV_FILE}"
printf 'MAX_CONCURRENT_TRANSLATIONS=2\n' >> "${ENV_FILE}"
mv "${ENV_FILE}" "${BOT_DIR}/.env"
chmod 600 "${BOT_DIR}/.env"
unset DISCORD_BOT_TOKEN GROQ_SECRET_KEY

echo "建立 Bot 容器..."
sudo docker build -t "${IMAGE_NAME}" "${BOT_DIR}"
sudo docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
sudo docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  --env-file "${BOT_DIR}/.env" \
  "${IMAGE_NAME}"

echo
echo "✅ 嘎嘎 Bot 已啟動。"
echo "查看記錄：sudo docker logs -f ${CONTAINER_NAME}"
