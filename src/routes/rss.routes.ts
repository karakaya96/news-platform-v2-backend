import { Hono } from 'hono';
import type { Bindings } from '../types';

const rssRoutes = new Hono<{ Bindings: Bindings }>();

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// GET /api/rss — RSS 2.0 feed of latest published news
rssRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const limit = Math.min(Number.parseInt(c.req.query('limit') || '30', 10), 100);

  try {
    const result = await db
      .prepare(
        `SELECT n.id, n.title, n.slug, n.excerpt, n.image_url, n.published_at, c.name AS category_name
         FROM news n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE n.status = 'published'
         ORDER BY n.published_at DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<{
        id: number;
        title: string;
        slug: string;
        excerpt: string | null;
        image_url: string | null;
        published_at: string;
        category_name: string | null;
      }>();

    // Site URL: prefer the configured setting, fall back to the request origin
    let siteUrl = 'https://newshaberglobal.com';
    try {
      const setting = await db
        .prepare(`SELECT value FROM settings WHERE key = 'site_url' LIMIT 1`)
        .first<{ value: string }>();
      if (setting?.value) siteUrl = setting.value.replace(/\/$/, '');
    } catch {
      // settings table may not exist yet in dev — keep fallback
    }

    const items = (result.results || [])
      .map(
        (n) => `    <item>
      <title>${escapeXml(n.title)}</title>
      <link>${siteUrl}/news/${n.slug}</link>
      <guid isPermaLink="true">${siteUrl}/news/${n.slug}</guid>
      <description>${escapeXml(n.excerpt || '')}</description>
      ${n.category_name ? `<category>${escapeXml(n.category_name)}</category>` : ''}
      ${n.image_url ? `<enclosure url="${escapeXml(n.image_url)}" type="image/jpeg" />` : ''}
      <pubDate>${new Date(n.published_at).toUTCString()}</pubDate>
    </item>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NewsHaber Global</title>
    <link>${siteUrl}</link>
    <description>Son dakika haberleri ve güncel gelişmeler</description>
    <language>tr</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/api/rss" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // 5 min edge cache
      },
    });
  } catch (err) {
    return new Response('RSS error', { status: 500 });
  }
});

export default rssRoutes;
