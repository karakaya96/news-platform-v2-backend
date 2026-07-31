#!/usr/bin/env bash
# Automated D1 Backup Cron Job
# Runs daily via Cloudflare Workers Cron Triggers or external cron

set -e

DB_NAME="news-platform-db"
BACKUP_DIR="/tmp/d1-backups"
RETENTION_DAYS=30
R2_BUCKET="news-platform-backups"  # Optional: R2 bucket for remote storage
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="auto-backup-$DATE"

mkdir -p "$BACKUP_DIR"

echo "🕐 Automated D1 Backup - $(date)"
echo "=============================="

# Create backup
echo "📦 Creating backup..."
wrangler d1 backup create "$DB_NAME" --remote --output "$BACKUP_DIR/$BACKUP_NAME.sql"

# Compress
gzip "$BACKUP_DIR/$BACKUP_NAME.sql"
echo "🗜️  Compressed to $BACKUP_DIR/$BACKUP_NAME.sql.gz"

# Optional: Upload to R2
if [ -n "$R2_BUCKET" ] && command -v rclone &> /dev/null; then
    echo "☁️  Uploading to R2..."
    rclone copy "$BACKUP_DIR/$BACKUP_NAME.sql.gz" "r2:$R2_BUCKET/d1-backups/"
    echo "✅ Uploaded to R2"
fi

# Cleanup old local backups
echo "🧹 Cleaning up old backups (older than $RETENTION_DAYS days)..."
find "$BACKUP_DIR" -name "auto-backup-*.sql.gz" -mtime +$RETENTION_DAYS -delete

# Cleanup old R2 backups (if configured)
if [ -n "$R2_BUCKET" ] && command -v rclone &> /dev/null; then
    echo "🧹 Cleaning up old R2 backups..."
    rclone delete "r2:$R2_BUCKET/d1-backups/" --min-age ${RETENTION_DAYS}d
fi

echo ""
echo "✅ Automated backup completed: $BACKUP_NAME.sql.gz"
ls -lh "$BACKUP_DIR/$BACKUP_NAME.sql.gz"