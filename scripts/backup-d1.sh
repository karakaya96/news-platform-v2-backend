#!/usr/bin/env bash
# D1 Database Backup Script
# Usage: ./backup-d1.sh [local|remote] [backup-name]

set -e

MODE="${1:-local}"
BACKUP_NAME="${2:-backup-$(date +%Y%m%d-%H%M%S)}"
DB_NAME="news-platform-db"
BACKUP_DIR="./backups"

mkdir -p "$BACKUP_DIR"

echo "🗄️  D1 Database Backup"
echo "====================="
echo "Mode: $MODE"
echo "Backup name: $BACKUP_NAME"
echo "Database: $DB_NAME"
echo ""

if [ "$MODE" = "remote" ]; then
    echo "📡 Creating remote backup..."
    wrangler d1 backup create "$DB_NAME" --remote --output "$BACKUP_DIR/$BACKUP_NAME.sql"
    echo "✅ Remote backup saved to $BACKUP_DIR/$BACKUP_NAME.sql"
elif [ "$MODE" = "local" ]; then
    echo "💾 Creating local backup..."
    wrangler d1 backup create "$DB_NAME" --local --output "$BACKUP_DIR/$BACKUP_NAME.sql"
    echo "✅ Local backup saved to $BACKUP_DIR/$BACKUP_NAME.sql"
else
    echo "❌ Invalid mode. Use 'local' or 'remote'"
    exit 1
fi

# Also export schema for reference
echo "📋 Exporting schema..."
wrangler d1 execute "$DB_NAME" --local --command=".schema" > "$BACKUP_DIR/${BACKUP_NAME}-schema.sql" 2>/dev/null || true

# Count records in each table
echo "📊 Table row counts:"
wrangler d1 execute "$DB_NAME" --local --command="
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'news', COUNT(*) FROM news
UNION ALL SELECT 'tags', COUNT(*) FROM tags
UNION ALL SELECT 'news_tags', COUNT(*) FROM news_tags
UNION ALL SELECT 'comments', COUNT(*) FROM comments
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'notification_log', COUNT(*) FROM notification_log;
" 2>/dev/null || echo "Could not get row counts"

echo ""
echo "✅ Backup completed: $BACKUP_DIR/$BACKUP_NAME.sql"
ls -lh "$BACKUP_DIR/$BACKUP_NAME.sql"