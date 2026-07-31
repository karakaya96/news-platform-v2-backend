#!/usr/bin/env bash
# D1 Database Restore Script
# Usage: ./restore-d1.sh [local|remote] <backup-file.sql>

set -e

MODE="${1:-local}"
BACKUP_FILE="${2}"
DB_NAME="news-platform-db"

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Usage: $0 [local|remote] <backup-file.sql>"
    echo ""
    echo "Available backups:"
    ls -lh ./backups/*.sql 2>/dev/null | grep -v schema || echo "  No backups found"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔄 D1 Database Restore"
echo "======================"
echo "Mode: $MODE"
echo "Backup file: $BACKUP_FILE"
echo "Database: $DB_NAME"
echo ""

read -p "⚠️  This will OVERWRITE the database. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo "📥 Restoring database..."

if [ "$MODE" = "remote" ]; then
    wrangler d1 execute "$DB_NAME" --remote --file="$BACKUP_FILE"
elif [ "$MODE" = "local" ]; then
    wrangler d1 execute "$DB_NAME" --local --file="$BACKUP_FILE"
else
    echo "❌ Invalid mode. Use 'local' or 'remote'"
    exit 1
fi

echo ""
echo "✅ Restore completed successfully!"

# Verify restore
echo "📊 Verifying restore..."
wrangler d1 execute "$DB_NAME" --local --command="
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'categories', COUNT(*) FROM categories
UNION ALL SELECT 'news', COUNT(*) FROM news
UNION ALL SELECT 'tags', COUNT(*) FROM tags
UNION ALL SELECT 'comments', COUNT(*) FROM comments
UNION ALL SELECT 'subscriptions', COUNT(*) FROM subscriptions
UNION ALL SELECT 'notification_log', COUNT(*) FROM notification_log;
" 2>/dev/null || echo "Could not verify row counts"