#!/usr/bin/env bash
set -e

echo "=== Настройка сервера RM OS ==="

# 1. Базовые зависимости
apt-get update
apt-get install -y docker.io docker-compose-plugin git curl ufw fail2ban

# 2. Docker в автозапуске
systemctl enable docker
systemctl start docker

# 3. Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 4. Папки проекта
mkdir -p /opt/rm-os
mkdir -p /opt/rm-os/backups
mkdir -p /opt/rm-os/data

# 5. Клонирование репозитория (пользователь заменит на свой)
if [ ! -d /opt/rm-os/repo ]; then
  echo "Клонируйте репозиторий вручную:"
  echo "  git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /opt/rm-os/repo"
fi

echo "=== Базовая настройка завершена ==="
echo "Следующий шаг: скопируйте deploy/.env.example в deploy/.env, заполните переменные и выполните:"
echo "  cd /opt/rm-os/repo/deploy"
echo "  docker compose up -d"
