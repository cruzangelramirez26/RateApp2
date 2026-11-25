#!/bin/bash
# Script de arranque de la VM de Rated (e2-micro, us-east1).
# Google lo corre en CADA arranque, asi que todo es idempotente:
# solo instala lo que falte y luego levanta los contenedores.
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  curl -fsSL https://get.docker.com | sh
fi

# 1 GB de RAM: sin swap, un pico de pandas puede matar el proceso.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
fi
swapon /swapfile 2>/dev/null || true

# La app vive en /opt/rated (docker-compose.yml + .env los pone el deploy).
if [ -f /opt/rated/docker-compose.yml ]; then
  cd /opt/rated
  /opt/rated/cargar-secretos.sh || true
  docker compose up -d
fi
