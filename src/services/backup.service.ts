import type { Bindings } from '../types';

/**
 * Daily D1 → R2 backup.
 * Exports the core content tables as SQL inserts and stores them in R2
 * under backups/YYYY-MM-DD/. Keeps the last 30 days; older files are removed.
 */

const TABLES = [
  'users',
  'categories',
  'news',
  'tags',
  'news_tags',
  'comments',
  'subscriptions',
  'notification_log',
  'settings',
];

function escapeValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

export async function runDailyBackup(env: Bindings): Promise<{ ok: boolean; file?: string; error?: string }> {
  try {
    const parts: string[] = [
      `-- NewsPlatform D1 backup`,
      `-- Generated: ${new Date().toISOString()}`,
      '',
    ];

    for (const table of TABLES) {
      const result = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      const rows = (result.results || []) as Record<string, unknown>[];
      if (rows.length === 0) continue;

      const cols = Object.keys(rows[0]);
      parts.push(`-- Table: ${table} (${rows.length} rows)`);
      for (const row of rows) {
        const values = cols.map((c) => escapeValue(row[c])).join(', ');
        parts.push(
          `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${values});`
        );
      }
      parts.push('');
    }

    const sql = parts.join('\n');
    const date = new Date().toISOString().slice(0, 10);
    const key = `backups/${date}/news-platform-db.sql`;

    await env.R2.put(key, sql, {
      httpMetadata: { contentType: 'application/sql' },
      customMetadata: { generatedAt: new Date().toISOString(), rows: String(sql.split('\n').length) },
    });

    // Retention: delete backups older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const listing = await env.R2.list({ prefix: 'backups/' });
    let deleted = 0;
    for (const obj of listing.objects) {
      if (obj.uploaded && obj.uploaded.getTime() < cutoff) {
        await env.R2.delete(obj.key);
        deleted++;
      }
    }

    console.log(`Backup OK: ${key} (${sql.length} bytes, cleaned ${deleted} old)`);
    return { ok: true, file: key };
  } catch (err) {
    console.error('Backup failed:', err);
    return { ok: false, error: String(err) };
  }
}
