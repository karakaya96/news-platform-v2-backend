import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { canCreateNews, canDeleteNews, canEditNews, canManageNews } from '../middleware/authorization';
import { createRateLimiter } from '../middleware/rate-limit';
import { NewsService } from '../services/news.service';
import type { VapidConfig } from '../services/push.service';
import { ScraperService } from '../services/scraper.service';
import { SubscriptionService } from '../services/subscription.service';
import type { Bindings } from '../types';
import { error, paginated, success } from '../utils/response';
import { createNewsSchema, previewNewsSchema, updateNewsSchema } from '../utils/validation';

const newsRoutes = new Hono<{ Bindings: Bindings }>();

// POST /api/news/preview - Admin/Editor, scrape and preview news from URL
newsRoutes.post('/preview', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user || !canManageNews(user.role)) {
      return error('Unauthorized', 403);
    }

    const body = await c.req.json();
    const { url } = body as { url?: string };

    if (!url) {
      return error('URL zorunludur', 400);
    }

    try {
      new URL(url);
    } catch {
      return error('Geçersiz URL formatı', 400);
    }

    const scraper = new ScraperService(30000);
    const scraped = await scraper.fetchAndParse(url);

    if (!scraped.title || !scraped.content) {
      return error('Bu URL\'den içerik çıkarılamadı', 422);
    }

    return success(scraped);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    if (message.includes('aborted')) {
      return error('İstek zaman aşımına uğradı', 408);
    }
    return error(`Scraping hatası: ${message}`, 500);
  }
});

// POST /api/news/from-preview - Admin/Editor, create news from preview data
newsRoutes.post('/from-preview', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    if (!user || !canManageNews(user.role)) {
      return error('Unauthorized', 403);
    }

    const body = await c.req.json();
    const result = previewNewsSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.errors[0];
      return error(firstError.message, 400);
    }

    const newsData = result.data;
    const service = new NewsService(c.env.DB);
    const newNews = await service.createNews({
      ...newsData,
      author_id: user.sub,
    });

    return success(newNews, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen hata';
    return error(message, 500);
  }
});

// GET /api/news - Public, with pagination, filtering, search
newsRoutes.get('/', createRateLimiter('api:news:list'), async (c) => {
  const page = Number.parseInt(c.req.query('page') || '1', 10);
  const limit = Number.parseInt(c.req.query('limit') || '10', 10);
  const category = c.req.query('category');
  const status = c.req.query('status') || 'published';
  const search = c.req.query('search');
  const featured = c.req.query('featured');
  const breaking = c.req.query('breaking');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const sortBy = c.req.query('sortBy');

  const service = new NewsService(c.env.DB);
  const { news, total } = await service.getAllNews(
    page,
    limit,
    category,
    status,
    search,
    featured,
    breaking,
    dateFrom,
    dateTo,
    sortBy
  );
  return paginated(news, total, page, limit);
});

// GET /api/news/featured - Public
newsRoutes.get('/featured', async (c) => {
  const service = new NewsService(c.env.DB);
  const news = await service.getFeaturedNews();
  return success(news);
});

// GET /api/news/breaking - Public
newsRoutes.get('/breaking', async (c) => {
  const service = new NewsService(c.env.DB);
  const news = await service.getBreakingNews();
  return success(news);
});

// GET /api/news/id/:id - Auth required (any role), fetch by ID for editing
newsRoutes.get('/id/:id', authMiddleware, async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const service = new NewsService(c.env.DB);
  const news = await service.getNewsById(id);

  if (!news) {
    return error('Article not found', 404);
  }

  return success(news);
});

// GET /api/news/:slug - Public, increments view count
newsRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const service = new NewsService(c.env.DB);
  const news = await service.getNewsBySlug(slug);

  if (!news) {
    return error('Article not found', 404);
  }

  await service.incrementViewCount(news.id);

  const related = await service.getRelatedNews(news.id, news.categoryId, 4);
  return success({ ...news, viewCount: news.viewCount + 1, related });
});

// Helper: trigger notifications for a published news article
async function triggerNotifications(
  db: import('@cloudflare/workers-types').D1Database,
  newsId: number,
  title: string,
  slug: string,
  excerpt: string | null,
  categorySlug: string,
  siteUrl: string,
  relayUrl: string,
  relaySecret: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
) {
  const notifEnabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'")
    .first<{ value: string }>();
  if (notifEnabledRow && notifEnabledRow.value === 'false') {
    return;
  }

  const emailEnabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'notifications_email_enabled'")
    .first<{ value: string }>();
  const emailEnabled = !emailEnabledRow || emailEnabledRow.value !== 'false';

  const emailFromNameRow = await db.prepare("SELECT value FROM settings WHERE key = 'email_from_name'")
    .first<{ value: string }>();
  const emailFromAddrRow = await db.prepare("SELECT value FROM settings WHERE key = 'email_from_address'")
    .first<{ value: string }>();
  const emailReplyToRow = await db.prepare("SELECT value FROM settings WHERE key = 'email_reply_to'")
    .first<{ value: string }>();
  const fromName = emailFromNameRow?.value || 'NewsHaberGlobal';
  const fromAddress = emailFromAddrRow?.value || 'noreply@newshaberglobal.com';
  const replyTo = emailReplyToRow?.value || '';

  const subService = new SubscriptionService(db);
  const subs = await subService.getActiveSubscriptionsByCategory(categorySlug);

  for (const sub of subs) {
    if (sub.type === 'email' && sub.email) {
      if (!emailEnabled) continue;
      const notifResult = await db
        .prepare(`
        INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
        VALUES (?, 'email', ?, ?, ?, ?, 'pending')
      `)
        .bind(
          sub.id,
          `📰 ${title}`,
          excerpt || 'Yeni haberi okumak için tıklayın',
          `${siteUrl}/news/${slug}`,
          newsId
        )
        .run();

      const notifId = notifResult.meta?.last_row_id;

      if (relayUrl && notifId) {
        try {
          const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
          const res = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: relaySecret,
              to: sub.email,
              from: fromAddress,
              fromName,
              replyTo: replyTo || undefined,
              subject: `📰 ${title}`,
              html: `<h2>${title}</h2><p>${excerpt || ''}</p><a href="${siteUrl}/news/${slug}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Haberi Oku →</a>`,
              unsubscribeUrl,
            }),
          });

          if (res.ok) {
            await db
              .prepare(
                `UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`
              )
              .bind(notifId)
              .run();
          } else {
            const errText = await res.text();
            await db
              .prepare(
                `UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`
              )
              .bind(errText, notifId)
              .run();
          }
        } catch (err: unknown) {
          await db
            .prepare(
              `UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`
            )
            .bind(String(err), notifId)
            .run();
        }
      }
    }

    if (
      sub.type === 'browser' &&
      sub.endpoint &&
      sub.p256dh &&
      sub.auth &&
      vapidPublicKey &&
      vapidPrivateKey
    ) {
      const notifResult = await db
        .prepare(`
        INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
        VALUES (?, 'browser', ?, ?, ?, ?, 'pending')
      `)
        .bind(
          sub.id,
          title,
          excerpt || 'Yeni haberi okumak için tıklayın',
          `${siteUrl}/news/${slug}`,
          newsId
        )
        .run();

      const notifId = notifResult.meta?.last_row_id;

      try {
        const { PushService } = await import('../services/push.service');
        const pushService = new PushService({
          VAPID_PUBLIC_KEY: vapidPublicKey,
          VAPID_PRIVATE_KEY: vapidPrivateKey,
          VAPID_SUBJECT: 'mailto:admin@newshaberglobal.com',
        } as VapidConfig);

        const result = await pushService.sendPush(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          {
            title,
            body: excerpt || 'Yeni haberi okumak için tıklayın',
            url: `${siteUrl}/news/${slug}`,
            tag: `news-${newsId}`,
            requireInteraction: true,
          }
        );

        if (result.success && notifId) {
          await db
            .prepare(
              `UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`
            )
            .bind(notifId)
            .run();
        } else if (result.error === 'subscription_expired') {
          await db.prepare('DELETE FROM subscriptions WHERE id = ?').bind(sub.id).run();
          if (notifId)
            await db
              .prepare(
                `UPDATE notification_log SET status = 'failed', error_message = 'Subscription expired' WHERE id = ?`
              )
              .bind(notifId)
              .run();
        } else if (notifId) {
          await db
            .prepare(
              `UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`
            )
            .bind(result.error || 'Unknown error', notifId)
            .run();
        }
      } catch (err: unknown) {
        console.error('Browser push error:', err);
        if (notifId)
          await db
            .prepare(
              `UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`
            )
            .bind(String(err), notifId)
            .run();
      }
    }
  }
}

// POST /api/news - Admin/Editor/Author
newsRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || !canCreateNews(user.role)) {
    return error('Unauthorized', 403);
  }

  const body = await c.req.json();
  const parsed = createNewsSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
  }

  const service = new NewsService(c.env.DB);
  const news = await service.createNews({ ...parsed.data, author_id: user.sub } as {
    title: string;
    slug?: string;
    excerpt?: string;
    content: string;
    image_url?: string | null;
    image_alt?: string | null;
    category_id: number;
    author_id: number;
    status?: string;
    is_featured?: boolean;
    is_breaking?: boolean;
    seo_title?: string;
    seo_description?: string;
    seo_keywords?: string;
    published_at?: string;
    tag_ids?: number[];
  });

  if (parsed.data.status === 'published') {
    const siteUrl = 'https://newshaberglobal.vercel.app';
    const relayUrl = c.env.SMTP_RELAY_URL || '';
    const relaySecret = c.env.SMTP_RELAY_SECRET || '';

    const cat = await c.env.DB.prepare('SELECT slug FROM categories WHERE id = ?')
      .bind(news.categoryId)
      .first<{ slug: string }>();
    const categorySlug = cat?.slug || '';

    await triggerNotifications(
      c.env.DB,
      news.id,
      news.title,
      news.slug,
      news.excerpt,
      categorySlug,
      siteUrl,
      relayUrl,
      relaySecret,
      c.env.VAPID_PUBLIC_KEY,
      c.env.VAPID_PRIVATE_KEY
    );
  }

  return success(news, 201);
});

// PUT /api/news/:id - Admin/Editor (all news) or Author (own news only)
newsRoutes.put('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return error('Unauthorized', 401);

  const id = Number.parseInt(c.req.param('id'), 10);
  const service = new NewsService(c.env.DB);

  const existing = await service.getNewsById(id);
  if (!existing) {
    return error('Article not found', 404);
  }

  // Authors can only edit their own news
  if (!canEditNews(user.role, existing.authorId, user.sub)) {
    return error('Unauthorized', 403);
  }

  const body = await c.req.json();
  const parsed = updateNewsSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
  }

  const wasPublished = existing.status === 'published';
  const isPublishingNow = parsed.data.status === 'published' && !wasPublished;

  const news = await service.updateNews(id, parsed.data);
  if (!news) {
    return error('Article not found', 404);
  }

  if (isPublishingNow) {
    const siteUrl = 'https://newshaberglobal.vercel.app';
    const relayUrl = c.env.SMTP_RELAY_URL || '';
    const relaySecret = c.env.SMTP_RELAY_SECRET || '';

    const cat = await c.env.DB.prepare('SELECT slug FROM categories WHERE id = ?')
      .bind(news.categoryId)
      .first<{ slug: string }>();
    const categorySlug = cat?.slug || '';

    await triggerNotifications(
      c.env.DB,
      news.id,
      news.title,
      news.slug,
      news.excerpt,
      categorySlug,
      siteUrl,
      relayUrl,
      relaySecret,
      c.env.VAPID_PUBLIC_KEY,
      c.env.VAPID_PRIVATE_KEY
    );
  }

  return success(news);
});

// DELETE /api/news/:id - Admin/Editor (all news) or Author (own news only)
newsRoutes.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) return error('Unauthorized', 401);

  const id = Number.parseInt(c.req.param('id'), 10);
  const service = new NewsService(c.env.DB);
  const existing = await service.getNewsById(id);

  if (!existing) {
    return error('Article not found', 404);
  }

  if (!canDeleteNews(user.role, existing.authorId, user.sub)) {
    return error('Unauthorized', 403);
  }

  const deleted = await service.deleteNews(id);
  if (!deleted) {
    return error('Article not found', 404);
  }
  return success({ message: 'Article deleted successfully' });
});

export default newsRoutes;
