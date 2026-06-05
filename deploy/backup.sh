#!/usr/bin/env bash
# ─── PoliticOS — Backup automático de bases de datos ──────────────────────────
# Instalar en cron (como root o www-data):
#   0 3 * * * /var/www/politicos/deploy/backup.sh >> /var/log/politicos-backup.log 2>&1
#
# Qué hace:
#   1. Dump de la BD central (tenants, planes, config global)
#   2. Dump de cada BD de tenant activo (leyéndolos desde la tabla tenants)
#   3. Comprime con gzip
#   4. Retiene últimos 30 días, borra el resto
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

APP_DIR="/var/www/politicos"
BACKUP_DIR="/var/backups/politicos"
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d_%H%M%S)
LOG_PREFIX="[${DATE}]"

mkdir -p "$BACKUP_DIR"

# Leer credenciales del .env del servidor
DB_HOST=$(grep '^DB_HOST='     "${APP_DIR}/.env" | cut -d= -f2 | tr -d '"')
DB_PORT=$(grep '^DB_PORT='     "${APP_DIR}/.env" | cut -d= -f2 | tr -d '"')
DB_USER=$(grep '^DB_USERNAME=' "${APP_DIR}/.env" | cut -d= -f2 | tr -d '"')
DB_PASS=$(grep '^DB_PASSWORD=' "${APP_DIR}/.env" | cut -d= -f2 | tr -d '"')
DB_NAME=$(grep '^DB_DATABASE=' "${APP_DIR}/.env" | cut -d= -f2 | tr -d '"')
DB_PORT=${DB_PORT:-3306}

MYSQL_OPTS="-h${DB_HOST} -P${DB_PORT} -u${DB_USER}"
[ -n "$DB_PASS" ] && MYSQL_OPTS="${MYSQL_OPTS} -p${DB_PASS}"

# ── 1. Backup BD central ──────────────────────────────────────────────────────
echo "${LOG_PREFIX} Backup BD central: ${DB_NAME}..."
CENTRAL_FILE="${BACKUP_DIR}/central_${DATE}.sql.gz"

mysqldump $MYSQL_OPTS \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    "${DB_NAME}" 2>/dev/null | gzip > "$CENTRAL_FILE"

echo "${LOG_PREFIX} ✓ Central: $(du -sh "$CENTRAL_FILE" | cut -f1)"

# ── 2. Backup de cada tenant activo ──────────────────────────────────────────
echo "${LOG_PREFIX} Buscando tenants activos..."

# Obtener lista: db_name|db_host|db_port|db_user|db_password|slug
TENANTS=$(mysql $MYSQL_OPTS -s -N -e \
    "SELECT db_name, COALESCE(db_host,'${DB_HOST}'), COALESCE(db_port,${DB_PORT}), \
            COALESCE(db_user,'${DB_USER}'), COALESCE(db_password,'${DB_PASS}'), slug \
     FROM ${DB_NAME}.tenants WHERE is_active = 1;" 2>/dev/null || echo "")

if [[ -z "$TENANTS" ]]; then
    echo "${LOG_PREFIX} No se encontraron tenants activos (o BD central sin tabla tenants)"
else
    while IFS=$'\t' read -r t_db t_host t_port t_user t_pass t_slug; do
        echo "${LOG_PREFIX} Backup tenant: ${t_slug} (${t_db})..."
        TENANT_FILE="${BACKUP_DIR}/tenant_${t_slug}_${DATE}.sql.gz"

        T_OPTS="-h${t_host} -P${t_port} -u${t_user}"
        [ -n "$t_pass" ] && T_OPTS="${T_OPTS} -p${t_pass}"

        mysqldump $T_OPTS \
            --single-transaction \
            --quick \
            --routines \
            --triggers \
            "${t_db}" 2>/dev/null | gzip > "$TENANT_FILE" || {
            echo "${LOG_PREFIX} ⚠ Fallo backup de tenant ${t_slug} — continúa"
            rm -f "$TENANT_FILE"
            continue
        }

        echo "${LOG_PREFIX} ✓ ${t_slug}: $(du -sh "$TENANT_FILE" | cut -f1)"
    done <<< "$TENANTS"
fi

# ── 3. Rotación: borrar backups más antiguos de N días ────────────────────────
echo "${LOG_PREFIX} Rotando backups (reteniendo ${RETENTION_DAYS} días)..."
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
echo "${LOG_PREFIX} ✓ ${DELETED} archivos eliminados"

# ── 4. Resumen ────────────────────────────────────────────────────────────────
TOTAL=$(du -sh "$BACKUP_DIR" | cut -f1)
COUNT=$(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l)
echo "${LOG_PREFIX} ══ Backup completado — ${COUNT} archivos, ${TOTAL} totales en ${BACKUP_DIR}"
