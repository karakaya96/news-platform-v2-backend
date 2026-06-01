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

// Test cron endpoint (manual trigger)
app.get('/api/test-cron', async (c) => {
  const db = c.env.DB as any;
  const siteUrl = 'https://newshaberglobal.vercel.app';
  const results: string[] = [];

  // 1. Find recently published news
  const recentlyPublished = await db.prepare(`
    SELECT n.id, n.title, n.slug, n.excerpt, n.category_id, n.published_at, c.slug as category_slug
    FROM news n
    LEFT JOIN categories c ON n.category_id = c.id
    WHERE n.status = 'published'
    AND n.published_at > datetime('now', '-60 minutes')
    AND n.published_at <= datetime('now')
    AND NOT EXISTS (
      SELECT 1 FROM notification_log nl WHERE nl.news_id = n.id
    )
    ORDER BY n.published_at DESC
    LIMIT 5
  `).all();

  const newsItems = recentlyPublished.results || [];
  results.push(`Found ${newsItems.length} unnotified news in last 60 min`);

  for (const news of newsItems as any[]) {
    const subs = await db.prepare(`
      SELECT * FROM subscriptions
      WHERE is_active = 1
      AND (categories = '[]' OR categories LIKE ?)
    `).bind(`%${news.category_slug}%`).all();

    const subscriptions = subs.results || [];
    results.push(`News: "${news.title}" (cat: ${news.category_slug}) → ${subscriptions.length} subscribers`);

    for (const sub of subscriptions as any[]) {
      if (sub.type === 'email' && sub.email) {
        const notifId = await db.prepare(`
          INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
          VALUES (?, 'email', ?, ?, ?, ?, 'pending')
        `).bind(
          sub.id,
          `📰 ${news.title}`,
          news.excerpt || 'Yeni haberi okumak için tıklayın',
          `${siteUrl}/news/${news.slug}`,
          news.id
        ).run();

        const relayUrl = (c.env as any).SMTP_RELAY_URL || '';
        const relaySecret = (c.env as any).SMTP_RELAY_SECRET || '';

        if (relayUrl) {
          try {
            const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
            const res = await fetch(relayUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                secret: relaySecret,
                to: sub.email,
                subject: `📰 ${news.title}`,
                html: `<h2>${news.title}</h2><p>${news.excerpt || ''}</p><a href="${siteUrl}/news/${news.slug}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Haberi Oku →</a>`,
                unsubscribeUrl,
              }),
            });

            if (res.ok) {
              await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notifId.meta.last_row_id).run();
              results.push(`✅ Email sent to ${sub.email}`);
            } else {
              const errText = await res.text();
              await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(errText, notifId.meta.last_row_id).run();
              results.push(`❌ Failed for ${sub.email}: ${errText}`);
            }
          } catch (err: any) {
            await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), notifId.meta.last_row_id).run();
            results.push(`❌ Error for ${sub.email}: ${err.message}`);
          }
        } else {
          results.push(`⚠️ No relay URL configured`);
        }
      }
    }
  }

  // 2. Process pending emails
  const pendingEmails = await db.prepare(`
    SELECT nl.*, s.email
    FROM notification_log nl
    JOIN subscriptions s ON nl.subscription_id = s.id
    WHERE nl.status = 'pending' AND nl.type = 'email'
    ORDER BY nl.created_at ASC
    LIMIT 10
  `).all();

  results.push(`Pending emails: ${(pendingEmails.results || []).length}`);

  return c.json({ success: true, results });
});

// 404 handler
app.notFound((c) => {
  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
});

export default app;

// Cron scheduled handler - runs every 5 minutes to send pending notifications
export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
  const db = env.DB;
  console.log('🔔 CRON START');
  
  // Debug: count total published news
  const debugCount = await db.prepare(`SELECT COUNT(*) as cnt FROM news WHERE status = 'published'`).first();
  console.log('📊 Total published news:', debugCount?.cnt);
  // 1. Find recently published news that hasn't been notified yet
  const recentlyPublished = await db.prepare(`
    SELECT n.id, n.title, n.slug, n.excerpt, n.category_id, n.published_at, c.slug as category_slug
    FROM news n
    LEFT JOIN categories c ON n.category_id = c.id
    WHERE n.status = 'published'
    AND n.published_at > datetime('now', '-60 minutes')
    AND n.published_at <= datetime('now')
    AND NOT EXISTS (
      SELECT 1 FROM notification_log nl WHERE nl.news_id = n.id
    )
    ORDER BY n.published_at DESC
    LIMIT 5
  `).all();

  const newsItems = recentlyPublished.results || [];

  for (const news of newsItems as any[]) {
    // Get active subscriptions for this category
    const subs = await db.prepare(`
      SELECT * FROM subscriptions 
      WHERE is_active = 1 
      AND (categories = '[]' OR categories LIKE ?)
    `).bind(`%${news.category_slug}%`).all();

    const subscriptions = subs.results || [];
    const siteUrl = 'https://newshaberglobal.vercel.app';
    const newsUrl = `${siteUrl}/news/${news.slug}`;

    for (const sub of subscriptions as any[]) {
      // Browser push notification
      if (sub.type === 'browser' && sub.endpoint && sub.p256dh && sub.auth) {
        try {
          // For now, log the notification (actual push needs web-push library)
          await db.prepare(`
            INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
            VALUES (?, 'browser', ?, ?, ?, ?, 'sent')
          `).bind(
            sub.id,
            `📰 ${news.title}`,
            news.excerpt || 'Yeni haberi okumak için tıklayın',
            newsUrl,
            news.id
          ).run();
        } catch (err) {
          console.error('Browser notification error:', err);
        }
      }

      // Email notification - create log and send via relay
      if (sub.type === 'email' && sub.email) {
        try {
          const notifId = await db.prepare(`
            INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
            VALUES (?, 'email', ?, ?, ?, ?, 'pending')
          `).bind(
            sub.id,
            `📰 ${news.title}`,
            news.excerpt || 'Yeni haberi okumak için tıklayın',
            newsUrl,
            news.id
          ).run();

          // Send via relay server (fire and forget)
          const relayUrl = env.SMTP_RELAY_URL || '';
          const relaySecret = env.SMTP_RELAY_SECRET || '';
          if (relayUrl) {
            const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
            fetch(relayUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                secret: relaySecret,
                to: sub.email,
                subject: `📰 ${news.title}`,
                html: `
                  <h2 style="color: #1e293b; font-size: 20px; margin-bottom: 10px;">${news.title}</h2>
                  <p style="color: #64748b; font-size: 14px; line-height: 1.6;">${news.excerpt || ''}</p>
                  <a href="${newsUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-top: 15px;">Haberi Oku →</a>
                `,
                unsubscribeUrl,
              }),
            }).then(async (res) => {
              if (res.ok) {
                await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notifId.meta.last_row_id).run();
              } else {
                const errText = await res.text();
                await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(errText, notifId.meta.last_row_id).run();
              }
            }).catch(async (err) => {
              await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), notifId.meta.last_row_id).run();
            });
          }
        } catch (err) {
          console.error('Email notification error:', err);
        }
      }
    }
  }

  // 2. Process pending email notifications (send via relay)
  const pendingEmails = await db.prepare(`
    SELECT nl.*, s.email
    FROM notification_log nl
    JOIN subscriptions s ON nl.subscription_id = s.id
    WHERE nl.status = 'pending' AND nl.type = 'email'
    ORDER BY nl.created_at ASC
    LIMIT 10
  `).all();

  const relayUrl = env.SMTP_RELAY_URL || '';
  const relaySecret = env.SMTP_RELAY_SECRET || '';

  for (const notif of (pendingEmails.results || []) as any[]) {
    try {
      if (!relayUrl) {
        console.log('SMTP_RELAY_URL not configured, skipping');
        continue;
      }

      const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(notif.email)}`;
      const res = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: relaySecret,
          to: notif.email,
          subject: notif.title,
          html: `<h2>${notif.title}</h2><p>${notif.body || ''}</p><a href="${notif.url}">Haberi Oku →</a>`,
          unsubscribeUrl,
        }),
      });

      if (res.ok) {
        await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notif.id).run();
        console.log(`✅ Pending email sent to ${notif.email}: ${notif.title}`);
      } else {
        const errText = await res.text();
        await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(errText, notif.id).run();
        console.error(`❌ Pending email failed for ${notif.email}: ${errText}`);
      }
    } catch (err) {
      await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), notif.id).run();
      console.error(`❌ Pending email error for ${notif.email}:`, err);
    }
  }

  console.log(`Cron: processed ${newsItems.length} new articles, ${(pendingEmails.results || []).length} pending emails`);
}
