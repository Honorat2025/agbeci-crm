#!/bin/sh
# Sauvegarde quotidienne de la base. À lancer chaque nuit par cron :
#   0 3 * * * cd /opt/agbeci-crm && sh deploy/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/crm-$(date +%Y-%m-%d).sql.gz"
docker compose exec -T db pg_dump -U crm -d crm | gzip > "$file"
# On garde 30 jours de sauvegardes.
find backups -name 'crm-*.sql.gz' -mtime +30 -delete
echo "$(date '+%F %T') sauvegarde OK : $file"
