import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import { errorMiddleware } from './middleware/error';
import newsRoutes from './routes/news.routes';
import categoryRoutes from './routes/category.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import dashboardRoutes from './routes/dashboard.routes';
import commentRoutes from './routes/comment.routes';
import subscriptionRoutes from './routes/subscription.routes';
import searchRoutes from './routes/search.routes';

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware - must explicitly set origin when credentials: true
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || c.env.CORS_ORIGIN || '*';
  const corsMiddleware = cors({
    origin: origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Error handling middleware
app.use('*', errorMiddleware);

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} (${duration}ms)`);
});

// Health check
app.get('/api/health', (c) => {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.route('/api/news', newsRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/comments', commentRoutes);
app.route('/api/subscribe', subscriptionRoutes);
app.route('/api/search', searchRoutes);

// Test endpoint for cron (secured)
app.get('/api/admin/trigger-cron', async (c) => {
  // Simple secret check
  const authHeader = c.req.header('Authorization') || '';
  if (authHeader.indexOf('news-haber-global-2026-secret') === -1) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = c.env.DB;
  const siteUrl = 'https://newshaberglobal.vercel.app';
  const relayUrl = c.env.SMTP_RELAY_URL || '';
  const relaySecret = c.env.SMTP_RELAY_SECRET || '';
  const results: string[] = [];

  // 1. Find recently published news
  const recentlyPublished = await db.prepare(`
    SELECT n.id, n.title, n.slug, n.excerpt, n.category_id, n.published_at, c.slug as category_slug
    FROM news n
    LEFT JOIN categories c ON n.category_id = c.id
    WHERE n.status = 'published'
    AND n.published_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')
    AND n.published_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    AND NOT EXISTS (SELECT 1 FROM notification_log nl WHERE nl.news_id = n.id)
    ORDER BY n.published_at DESC LIMIT 5
  `).all();

  const newsItems = recentlyPublished.results || [];
  results.push(`Found ${newsItems.length} news in window`);

  for (const news of newsItems as any[]) {
    results.push(`→ News #${news.id}: "${news.title}" (cat: ${news.category_slug})`);

    const subs = await db.prepare(`
      SELECT * FROM subscriptions WHERE is_active = 1 AND (categories = '[]' OR categories LIKE ?)
    `).bind(`%${news.category_slug}%`).all();

    for (const sub of (subs.results || []) as any[]) {
      if (sub.type === 'email' && sub.email) {
        const notifResult = await db.prepare(`
          INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
          VALUES (?, 'email', ?, ?, ?, ?, 'pending')
        `).bind(
          sub.id, `📰 ${news.title}`,
          news.excerpt || 'Yeni haberi okumak için tıklayın',
          `${siteUrl}/news/${news.slug}`, news.id
        ).run();

        const lastId = notifResult.meta?.last_row_id;
        results.push(`  Inserted notif #${lastId} for ${sub.email}, news_id=${news.id}`);

        if (relayUrl) {
          try {
            const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
            const res = await fetch(relayUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                secret: relaySecret, to: sub.email,
                subject: `📰 ${news.title}`,
                html: `<h2>${news.title}</h2><p>${news.excerpt || ''}</p><a href="${siteUrl}/news/${news.slug}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Haberi Oku →</a>`,
                unsubscribeUrl,
              }),
            });

            if (res.ok) {
              if (lastId) await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(lastId).run();
              results.push(`  ✅ Sent to ${sub.email}`);
            } else {
              const errText = await res.text();
              if (lastId) await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(errText, lastId).run();
              results.push(`  ❌ Failed for ${sub.email}: ${errText}`);
            }
          } catch (err: any) {
            if (lastId) await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), lastId).run();
            results.push(`  ❌ Error: ${err.message}`);
          }
        }
      } else if (sub.type === 'browser') {
        // Create browser push notification log (pending)
        const notifResult = await db.prepare(`
          INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
          VALUES (?, 'browser', ?, ?, ?, ?, 'pending')
        `).bind(
          sub.id, news.title,
          news.excerpt || 'Yeni haberi okumak için tıklayın',
          `${siteUrl}/news/${news.slug}`, news.id
        ).run();

        const lastId = notifResult.meta?.last_row_id;
        results.push(`  🔔 Browser notif #${lastId} created for endpoint ${sub.endpoint?.substring(0, 40)}...`);
      }
    }
  }

  return c.json({ success: true, results });
});

// 404 handler
app.notFound((c) => {
  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
});

export default app;

// Cron scheduled handler - runs every 5 minutes
// Primary job: process pending/failed email + browser push notifications
export async function scheduled(event: any, env: any, ctx: any) {
  const db = env.DB;
  const siteUrl = 'https://newshaberglobal.vercel.app';
  const relayUrl = env.SMTP_RELAY_URL || '';
  const relaySecret = env.SMTP_RELAY_SECRET || '';

  // 1. Process pending and failed email notifications (retry)
  const pendingEmails = await db.prepare(`
    SELECT nl.*, s.email FROM notification_log nl
    JOIN subscriptions s ON nl.subscription_id = s.id
    WHERE nl.status IN ('pending', 'failed') AND nl.type = 'email'
    ORDER BY nl.created_at ASC LIMIT 10
  `).all();

  const pendingEmailList = (pendingEmails.results || []) as any[];

  for (const notif of pendingEmailList) {
    try {
      if (!relayUrl || !notif.email) continue;
      const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(notif.email)}`;
      const res = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: relaySecret, to: notif.email,
          subject: notif.title,
          html: `<h2>${notif.title}</h2><p>${notif.body || ''}</p><a href="${notif.url}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Haberi Oku →</a>`,
          unsubscribeUrl,
        }),
      });
      if (res.ok) {
        await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notif.id).run();
      } else {
        const errText = await res.text();
        await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(errText, notif.id).run();
      }
    } catch (err: any) {
      await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), notif.id).run();
    }
  }

  // 2. Process pending browser push notifications
  const pendingBrowser = await db.prepare(`
    SELECT nl.*, s.endpoint, s.p256dh, s.auth
    FROM notification_log nl
    JOIN subscriptions s ON nl.subscription_id = s.id
    WHERE nl.status = 'pending' AND nl.type = 'browser'
    ORDER BY nl.created_at ASC LIMIT 20
  `).all();

  const pendingBrowserList = (pendingBrowser.results || []) as any[];
  const expiredEndpoints: string[] = [];

  if (pendingBrowserList.length > 0) {
    const { PushService } = await import('./services/push.service');
    const pushService = new PushService(env);

    for (const notif of pendingBrowserList) {
      if (!notif.endpoint || !notif.p256dh || !notif.auth) {
        await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = 'Missing subscription keys' WHERE id = ?`).bind(notif.id).run();
        continue;
      }

      const result = await pushService.sendPush(
        {
          endpoint: notif.endpoint,
          keys: { p256dh: notif.p256dh, auth: notif.auth },
        },
        {
          title: notif.title,
          body: notif.body || '',
          url: notif.url || siteUrl,
          tag: `news-${notif.news_id}`,
          requireInteraction: true,
        }
      );

      if (result.success) {
        await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notif.id).run();
      } else if (result.error === 'subscription_expired') {
        expiredEndpoints.push(notif.endpoint);
        await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = 'Subscription expired' WHERE id = ?`).bind(notif.id).run();
      } else {
        await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(result.error || 'Unknown error', notif.id).run();
      }
    }

    // Clean up expired browser subscriptions
    if (expiredEndpoints.length > 0) {
      for (const endpoint of expiredEndpoints) {
        await db.prepare(`DELETE FROM subscriptions WHERE type = 'browser' AND endpoint = ?`).bind(endpoint).run();
      }
      console.log(`Cleaned up ${expiredEndpoints.length} expired browser subscriptions`);
    }
  }

  console.log(`Cron: ${pendingEmailList.length} emails, ${pendingBrowserList.length} browser pushes processed`);
}
