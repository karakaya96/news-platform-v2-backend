import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorMiddleware } from './middleware/error';
import { checkRateLimit } from './middleware/rate-limit';
import { securityHeaders } from './middleware/security-headers';
import { createOpenAPIApp, setupSwagger } from './openapi';
import authRoutes from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import commentRoutes from './routes/comment.routes';
import dashboardRoutes from './routes/dashboard.routes';
import { buildNewsEmailTemplate } from './utils/email-templates';
import newsRoutes from './routes/news.routes';
import rssRoutes from './routes/rss.routes';
import searchRoutes from './routes/search.routes';
import settingsRoutes from './routes/settings.routes';
import subscriptionRoutes from './routes/subscription.routes';
import mediaRoutes from './routes/media.routes';
import userMediaRoutes from './routes/user-media.routes';
import uploadRoutes from './routes/upload.routes';
import userRoutes from './routes/user.routes';
import type {
  Bindings,
  CronEvent,
  NewsRow,
  NotificationLog,
  NotificationLogWithEmail,
  SubscriptionRow,
  VapidConfig,
} from './types';
import { turkeyNowISO } from './utils/time';

// Create main app with regular Hono for now (routes work)
const app = new Hono<{ Bindings: Bindings }>();

// Also create OpenAPI app for documentation
const openApiApp = createOpenAPIApp();
setupSwagger(openApiApp);

// Mount the OpenAPI docs at /api-docs (so /api-docs/doc and /api-docs/docs work)
app.route('/api-docs', openApiApp);

// CORS middleware - strict origin allowlist
const ALLOWED_ORIGINS = [
  'https://newshaberglobal.vercel.app',
  'https://frontend-psi-wheat-67.vercel.app',
  'https://newshaberglobal.com',
  'https://www.newshaberglobal.com',
];

app.use('*', async (c, next) => {
  const requestOrigin = c.req.header('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin);
  const origin = isAllowed ? requestOrigin : ALLOWED_ORIGINS[0];

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

// Security headers middleware
app.use('*', securityHeaders());

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
app.get('/api/health', (_c) => {
  return Response.json({ status: 'ok', timestamp: turkeyNowISO() });
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
app.route('/api/rss', rssRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/users', userRoutes);
app.route('/api/user/media', userMediaRoutes);
app.route('/api/media', mediaRoutes);

// Test endpoint for cron (secured)
app.get('/api/admin/trigger-cron', async (c) => {
  // Rate limit: 10 per minute per IP
  const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const rateLimit = checkRateLimit('trigger', clientIp);
  if (!rateLimit.allowed) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Secret check from env
  const authHeader = c.req.header('Authorization') || '';
  const cronSecret = c.env.CRON_SECRET || '';
  if (!cronSecret || authHeader.indexOf(cronSecret) === -1) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = c.env.DB;
  const siteUrl = 'https://newshaberglobal.vercel.app';
  const gmailConfig = {
    clientId: c.env.GMAIL_CLIENT_ID || '',
    clientSecret: c.env.GMAIL_CLIENT_SECRET || '',
    refreshToken: c.env.GMAIL_REFRESH_TOKEN || '',
    fromEmail: c.env.GMAIL_FROM_EMAIL || 'newshaberglobal@gmail.com',
  };
  const results: string[] = [];

  // 1. Find recently published news
  const recentlyPublished = await db
    .prepare(`
    SELECT n.id, n.title, n.slug, n.excerpt, n.image_url, n.category_id, n.published_at, c.slug as category_slug
    FROM news n
    LEFT JOIN categories c ON n.category_id = c.id
    WHERE n.status = 'published'
    AND n.published_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')
    AND n.published_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    AND NOT EXISTS (SELECT 1 FROM notification_log nl WHERE nl.news_id = n.id)
    ORDER BY n.published_at DESC LIMIT 5
  `)
    .all();

  const newsItems: NewsRow[] = (recentlyPublished.results as unknown as NewsRow[]) || [];
  results.push(`Found ${newsItems.length} news in window`);

  for (const news of newsItems) {
    results.push(`→ News #${news.id}: "${news.title}" (cat: ${news.category_slug})`);

    const subs = await db
      .prepare(`
        SELECT * FROM subscriptions WHERE is_active = 1 AND (categories = '[]' OR categories LIKE ?)
      `)
      .bind(`%${news.category_slug}%`)
      .all();

    for (const sub of (subs.results || []) as unknown as SubscriptionRow[]) {
      if (sub.type === 'email' && sub.email) {
        const notifResult = await db
          .prepare(`
          INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
          VALUES (?, 'email', ?, ?, ?, ?, 'pending')
        `)
          .bind(
            sub.id,
            `📰 ${news.title}`,
            news.excerpt || 'Yeni haberi okumak için tıklayın',
            `${siteUrl}/news/${news.slug}`,
            news.id
          )
          .run();

        const lastId = notifResult.meta?.last_row_id;
        results.push(`  Inserted notif #${lastId} for ${sub.email}, news_id=${news.id}`);

        if (gmailConfig.clientId && gmailConfig.refreshToken) {
          try {
            const { GmailService } = await import('./services/gmail.service');
            const { buildNewsEmailTemplate } = await import('./utils/email-templates');
            const gmailService = new GmailService(gmailConfig);
            const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
            const html = buildNewsEmailTemplate({
              title: news.title,
              excerpt: news.excerpt || undefined,
              imageUrl: news.image_url,
              articleUrl: `${siteUrl}/news/${news.slug}`,
              siteUrl,
              unsubscribeUrl,
            });
            const result = await gmailService.sendEmail({
              to: sub.email,
              subject: `📰 ${news.title}`,
              html,
              fromName: 'NewsHaberGlobal',
              replyTo: gmailConfig.fromEmail,
            });

            if (result.success) {
              if (lastId)
                await db
                  .prepare(
                    `UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`
                  )
                  .bind(lastId)
                  .run();
              results.push(`  ✅ Sent to ${sub.email}`);
            } else {
              if (lastId)
                await db
                  .prepare(
                    `UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`
                  )
                  .bind(result.error || 'Unknown error', lastId)
                  .run();
              results.push(`  ❌ Failed for ${sub.email}: ${result.error}`);
            }
          } catch (err: unknown) {
            if (lastId)
              await db
                .prepare(
                  `UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`
                )
                .bind(String(err), lastId)
                .run();
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            results.push(`  ❌ Error: ${errMsg}`);
          }
        }
      } else if (sub.type === 'browser') {
        // Create browser push notification log (pending)
        const notifResult = await db
          .prepare(`
          INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
          VALUES (?, 'browser', ?, ?, ?, ?, 'pending')
        `)
          .bind(
            sub.id,
            news.title,
            news.excerpt || 'Yeni haberi okumak için tıklayın',
            `${siteUrl}/news/${news.slug}`,
            news.id
          )
          .run();

        const lastId = notifResult.meta?.last_row_id;
        results.push(
          `  🔔 Browser notif #${lastId} created for endpoint ${sub.endpoint?.substring(0, 40)}...`
        );
      }
    }
  }

  return c.json({ success: true, results });
});

// 404 handler
app.notFound((_c) => {
  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
});

// Cron scheduled handler - runs every 5 minutes
// Primary job: process pending/failed email + browser push notifications
export async function scheduled(_event: CronEvent, env: Bindings, _ctx: unknown) {
  const db = env.DB;

  // 0. Daily D1 → R2 backup (runs once per day, checked via marker object)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await env.R2.head(`backups/${today}/news-platform-db.sql`);
    if (!existing) {
      const { runDailyBackup } = await import('./services/backup.service');
      await runDailyBackup(env);
    }
  } catch (err) {
    console.error('Backup step failed (non-fatal):', err);
  }

  // Check if notifications are enabled
  const notifEnabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'")
    .first<{ value: string }>();
  if (notifEnabledRow && notifEnabledRow.value === 'false') {
    console.log('Cron: Notifications disabled via settings');
    return;
  }

  // Check if email notifications are enabled
  const emailEnabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'notifications_email_enabled'")
    .first<{ value: string }>();
  const emailEnabled = !emailEnabledRow || emailEnabledRow.value !== 'false';

  const siteUrl = 'https://newshaberglobal.vercel.app';

  // Gmail OAuth config
  const gmailConfig = {
    clientId: env.GMAIL_CLIENT_ID || '',
    clientSecret: env.GMAIL_CLIENT_SECRET || '',
    refreshToken: env.GMAIL_REFRESH_TOKEN || '',
    fromEmail: env.GMAIL_FROM_EMAIL || 'newshaberglobal@gmail.com',
  };

  // 1. Process pending and failed email notifications (retry)
  let processedEmails = 0;
  if (!emailEnabled) {
    // Mark all pending emails as skipped
    await db.prepare("UPDATE notification_log SET status = 'failed', error_message = 'Email notifications disabled' WHERE status IN ('pending', 'failed') AND type = 'email'")
      .run();
  } else {
    const pendingEmails = await db
    .prepare(`
    SELECT nl.*, s.email, n.published_at, u.name as author_name FROM notification_log nl
    JOIN subscriptions s ON nl.subscription_id = s.id
    LEFT JOIN news n ON nl.news_id = n.id
    LEFT JOIN users u ON n.author_id = u.id
    WHERE nl.status IN ('pending', 'failed') AND nl.type = 'email'
    ORDER BY nl.created_at ASC LIMIT 10
  `)
    .all();

  const pendingEmailList = (pendingEmails.results || []) as unknown as NotificationLogWithEmail[];

  if (pendingEmailList.length > 0 && gmailConfig.clientId && gmailConfig.refreshToken) {
    const { GmailService } = await import('./services/gmail.service');
    const gmailService = new GmailService(gmailConfig);

    const timezoneRow = await db.prepare("SELECT value FROM settings WHERE key = 'site_timezone'")
      .first<{ value: string }>();
    const timezone = timezoneRow?.value || 'Europe/Istanbul';

    for (const notif of pendingEmailList) {
      processedEmails++;
      try {
        if (!notif.email) continue;
        const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(notif.email)}`;
        const html = buildNewsEmailTemplate({
          title: notif.title,
          excerpt: notif.body,
          articleUrl: notif.url || siteUrl,
          siteUrl,
          unsubscribeUrl,
          publishedAt: notif.published_at,
          authorName: notif.author_name,
          timezone,
        });
        const result = await gmailService.sendEmail({
          to: notif.email,
          subject: notif.title,
          html,
          fromName: 'NewsHaberGlobal',
          replyTo: 'newshaberglobal@gmail.com',
        });

        if (result.success) {
          await db
            .prepare(
              `UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`
            )
            .bind(notif.id)
            .run();
        } else {
          await db
            .prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`)
            .bind(result.error || 'Unknown error', notif.id)
            .run();
        }
      } catch (err: unknown) {
        await db
          .prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`)
          .bind(String(err), notif.id)
          .run();
      }
    }
  }
  } // end emailEnabled else block

  // 2. Process pending browser push notifications
  const pendingBrowser = await db
    .prepare(`
    SELECT nl.*, s.endpoint, s.p256dh, s.auth
    FROM notification_log nl
    JOIN subscriptions s ON nl.subscription_id = s.id
    WHERE nl.status = 'pending' AND nl.type = 'browser'
    ORDER BY nl.created_at ASC LIMIT 20
  `)
    .all();

  const pendingBrowserList = (pendingBrowser.results || []) as unknown as (NotificationLog & {
    endpoint: string;
    p256dh: string;
    auth: string;
  })[];
  const expiredEndpoints: string[] = [];

  if (pendingBrowserList.length > 0) {
    const { PushService } = await import('./services/push.service');
    const vapidConfig: VapidConfig = {
      VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY || '',
      VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY || '',
      VAPID_SUBJECT: env.VAPID_SUBJECT,
    };
    const pushService = new PushService(vapidConfig);

    for (const notif of pendingBrowserList) {
      if (!notif.endpoint || !notif.p256dh || !notif.auth) {
        await db
          .prepare(
            `UPDATE notification_log SET status = 'failed', error_message = 'Missing subscription keys' WHERE id = ?`
          )
          .bind(notif.id)
          .run();
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
        await db
          .prepare(
            `UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`
          )
          .bind(notif.id)
          .run();
      } else if (result.error === 'subscription_expired') {
        expiredEndpoints.push(notif.endpoint);
        await db
          .prepare(
            `UPDATE notification_log SET status = 'failed', error_message = 'Subscription expired' WHERE id = ?`
          )
          .bind(notif.id)
          .run();
      } else {
        await db
          .prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`)
          .bind(result.error || 'Unknown error', notif.id)
          .run();
      }
    }

    // Clean up expired browser subscriptions
    if (expiredEndpoints.length > 0) {
      for (const endpoint of expiredEndpoints) {
        await db
          .prepare(`DELETE FROM subscriptions WHERE type = 'browser' AND endpoint = ?`)
          .bind(endpoint)
          .run();
      }
      console.log(`Cleaned up ${expiredEndpoints.length} expired browser subscriptions`);
    }
  }

  console.log(
    `Cron: ${processedEmails} emails, ${pendingBrowserList.length} browser pushes processed`
  );
}

export default {
  fetch: app.fetch,
  scheduled,
};
