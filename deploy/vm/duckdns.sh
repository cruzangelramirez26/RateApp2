#!/bin/bash
# Le dice a DuckDNS la IP actual de la VM. La IP externa es efimera: cambia
# si la VM se detiene y vuelve a arrancar (no si solo se reinicia).
# El token NO vive en el repo: /opt/rated/.env.duckdns (root, 600), con
#   DUCKDNS_DOMAIN=rated
#   DUCKDNS_TOKEN=...
# Con ip= vacio, DuckDNS toma la IP de donde llega la peticion.
set -euo pipefail
ARCHIVO=/opt/rated/.env.duckdns
[ -f "$ARCHIVO" ] || exit 0
# shellcheck disable=SC1090
. "$ARCHIVO"
r=$(curl -fsS --max-time 30 "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")
[ "$r" = "OK" ] || { echo "$(date -u +%FT%TZ) duckdns: $r"; exit 1; }
