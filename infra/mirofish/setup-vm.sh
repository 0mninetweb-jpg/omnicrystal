#!/usr/bin/env bash
set -euo pipefail

MIROFISH_USER="${MIROFISH_USER:-mirofish}"
MIROFISH_GROUP="${MIROFISH_GROUP:-mirofish}"
MIROFISH_HOME="${MIROFISH_HOME:-/opt/mirofish}"
MIROFISH_REPO_URL="${MIROFISH_REPO_URL:-https://github.com/666ghj/MiroFish.git}"
MIROFISH_BRANCH="${MIROFISH_BRANCH:-main}"
MIROFISH_PORT="${MIROFISH_PORT:-5001}"
PYTHON_BIN="${PYTHON_BIN:-python3.11}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y software-properties-common curl git build-essential
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update
apt-get install -y python3.11 python3.11-venv

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

if ! getent group "${MIROFISH_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${MIROFISH_GROUP}"
fi

if ! id -u "${MIROFISH_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${MIROFISH_HOME}" --gid "${MIROFISH_GROUP}" --shell /bin/bash "${MIROFISH_USER}"
fi

mkdir -p "${MIROFISH_HOME}"
chown -R "${MIROFISH_USER}:${MIROFISH_GROUP}" "${MIROFISH_HOME}"

if [[ ! -d "${MIROFISH_HOME}/.git" ]]; then
  runuser -u "${MIROFISH_USER}" -- git clone --branch "${MIROFISH_BRANCH}" "${MIROFISH_REPO_URL}" "${MIROFISH_HOME}"
else
  runuser -u "${MIROFISH_USER}" -- git -C "${MIROFISH_HOME}" fetch origin
  runuser -u "${MIROFISH_USER}" -- git -C "${MIROFISH_HOME}" checkout "${MIROFISH_BRANCH}"
  runuser -u "${MIROFISH_USER}" -- git -C "${MIROFISH_HOME}" pull --ff-only origin "${MIROFISH_BRANCH}"
fi

"${PYTHON_BIN}" -m venv "${MIROFISH_HOME}/backend/.venv"
"${MIROFISH_HOME}/backend/.venv/bin/pip" install --upgrade pip
"${MIROFISH_HOME}/backend/.venv/bin/pip" install -r "${MIROFISH_HOME}/backend/requirements.txt"

mkdir -p "${MIROFISH_HOME}/backend/app/uploads"
chown -R "${MIROFISH_USER}:${MIROFISH_GROUP}" "${MIROFISH_HOME}"

if [[ ! -f "${MIROFISH_HOME}/.env" ]]; then
  cp "${SCRIPT_DIR}/mirofish.vm.env.example" "${MIROFISH_HOME}/.env"
  chown "${MIROFISH_USER}:${MIROFISH_GROUP}" "${MIROFISH_HOME}/.env"
  echo "Created ${MIROFISH_HOME}/.env from template. Fill the real LLM and Zep secrets before starting production traffic."
fi

install -m 0644 "${SCRIPT_DIR}/mirofish.service" /etc/systemd/system/mirofish.service
sed -i "s|/opt/mirofish|${MIROFISH_HOME}|g" /etc/systemd/system/mirofish.service
sed -i "s|FLASK_PORT=5001|FLASK_PORT=${MIROFISH_PORT}|g" /etc/systemd/system/mirofish.service
sed -i "s|User=mirofish|User=${MIROFISH_USER}|g" /etc/systemd/system/mirofish.service
sed -i "s|Group=mirofish|Group=${MIROFISH_GROUP}|g" /etc/systemd/system/mirofish.service

systemctl daemon-reload
systemctl enable mirofish.service
systemctl restart mirofish.service

echo ""
echo "MiroFish runtime installed."
echo "Service status:"
systemctl --no-pager --full status mirofish.service || true
echo ""
echo "Next step:"
echo "  curl http://127.0.0.1:${MIROFISH_PORT}/api/graph/project/list"
