#!/bin/bash
# Lee la contrasena de MySQL de Secret Manager (la misma que usaba Cloud Run)
# y la deja en .env.secretos, solo legible por root. Corre en cada arranque,
# asi que rotar la contrasena es: version nueva del secreto + reiniciar la VM
# (o correr este script y `docker compose up -d`).
set -euo pipefail
cd /opt/rated
umask 077
pw=$(gcloud secrets versions access latest --secret mysql-password --project rateapp-506404)
printf 'MYSQL_PASSWORD=%s\n' "$pw" > .env.secretos.tmp
mv .env.secretos.tmp .env.secretos
