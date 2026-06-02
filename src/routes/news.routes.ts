import { Hono } from 'hono';
import type { Bindings } from '../types';
import { NewsService } from '../services/news.service';
import { SubscriptionService } from '../services/subscription.service';
import { authMiddleware } from '../middleware/auth';
import { success, error, paginated } from '../utils/response';
import { createNewsSchema, updateNewsSchema } from '../utils/validation';

const newsRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/news - Public, with pagination, filtering, search
newsRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');
  const category = c.req.query('category');
  const status = c.req.query('status') || 'published'; // Public: default to published only
  const search = c.req.query('search');

  const service = new NewsService(c.env.DB);
  const { news, total } = await service.getAllNews(page, limit, category, status, search);
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

// GET /api/news/id/:id - Admin only, fetch by ID
newsRoutes.get('/id/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }
  
  const id = parseInt(c.req.param('id'));
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

  const related = await service.getRelatedNews(news.id, news.category_id, 4);
  return success({ ...news, view_count: news.view_count + 1, related });
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
  vapidPrivateKey: string,
) {
  const subService = new SubscriptionService(db);
  const subs = await subService.getActiveSubscriptionsByCategory(categorySlug);

  for (const sub of subs) {
    if (sub.type === 'email' && sub.email) {
      // Insert notification log
      const notifResult = await db.prepare(`
        INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
        VALUES (?, 'email', ?, ?, ?, ?, 'pending')
      `).bind(
        sub.id, `📰 ${title}`,
        excerpt || 'Yeni haberi okumak için tıklayın',
        `${siteUrl}/news/${slug}`, newsId
      ).run();

      const notifId = notifResult.meta?.last_row_id;

      // Send email immediately
      if (relayUrl && notifId) {
        try {
          const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(sub.email)}`;
          const res = await fetch(relayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: relaySecret,
              to: sub.email,
              subject: `📰 ${title}`,
              html: `<h2>${title}</h2><p>${excerpt || ''}</p><a href="${siteUrl}/news/${slug}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">Haberi Oku →</a>`,
              unsubscribeUrl,
            }),
          });

          if (res.ok) {
            await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notifId).run();
          } else {
            const errText = await res.text();
            await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(errText, notifId).run();
          }
        } catch (err: any) {
          await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), notifId).run();
        }
      }
    }

    // Browser push notification - send immediately using webcrypto-web-push
    if (sub.type === 'browser' && sub.endpoint && sub.p256dh && sub.auth && vapidPublicKey && vapidPrivateKey) {
      // Insert notification log first
      const notifResult = await db.prepare(`
        INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
        VALUES (?, 'browser', ?, ?, ?, ?, 'pending')
      `).bind(
        sub.id, title,
        excerpt || 'Yeni haberi okumak için tıklayın',
        `${siteUrl}/news/${slug}`, newsId
      ).run();

      const notifId = notifResult.meta?.last_row_id;

      try {
        const { PushService } = await import('../services/push.service');
        const pushService = new PushService({
          VAPID_PUBLIC_KEY: vapidPublicKey,
          VAPID_PRIVATE_KEY: vapidPrivateKey,
          VAPID_SUBJECT: 'mailto:admin@newshaberglobal.com',
        } as any);

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
          await db.prepare(`UPDATE notification_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?`).bind(notifId).run();
        } else if (result.error === 'subscription_expired') {
          // Remove expired subscription
          await db.prepare(`DELETE FROM subscriptions WHERE id = ?`).bind(sub.id).run();
          if (notifId) await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = 'Subscription expired' WHERE id = ?`).bind(notifId).run();
        } else if (notifId) {
          await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(result.error || 'Unknown error', notifId).run();
        }
      } catch (err: any) {
        console.error('Browser push error:', err);
        if (notifId) await db.prepare(`UPDATE notification_log SET status = 'failed', error_message = ? WHERE id = ?`).bind(String(err), notifId).run();
      }
    }
  }
}

// POST /api/news - Admin only
newsRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const body = await c.req.json();
  const parsed = createNewsSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.errors[0].message, 400);
  }

  const service = new NewsService(c.env.DB);
  const news = await service.createNews({ ...parsed.data, author_id: user.sub } as {
    title: string; slug?: string; excerpt?: string; content: string; image_url?: string | null;
    image_alt?: string | null; category_id: number; author_id: number; status?: string;
    is_featured?: boolean; is_breaking?: boolean; seo_title?: string; seo_description?: string;
    seo_keywords?: string; published_at?: string; tag_ids?: number[];
  });

  // If published immediately, trigger notifications
  if (parsed.data.status === 'published') {
    const siteUrl = 'https://newshaberglobal.vercel.app';
    const relayUrl = c.env.SMTP_RELAY_URL || '';
    const relaySecret = c.env.SMTP_RELAY_SECRET || '';

    // Get category slug
    const cat = await c.env.DB.prepare('SELECT slug FROM categories WHERE id = ?').bind(news.category_id).first<{ slug: string }>();
    const categorySlug = cat?.slug || '';

    await triggerNotifications(
      c.env.DB, news.id, news.title, news.slug, news.excerpt,
      categorySlug, siteUrl, relayUrl, relaySecret,
      c.env.VAPID_PUBLIC_KEY, c.env.VAPID_PRIVATE_KEY
    );
  }

  return success(news, 201);
});

// PUT /api/news/:id - Admin only
newsRoutes.put('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const parsed = updateNewsSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.errors[0].message, 400);
  }

  const service = new NewsService(c.env.DB);

  // Check if this is a publish action (status changing to 'published')
  const existing = await service.getNewsById(id);
  if (!existing) {
    return error('Article not found', 404);
  }

  const wasPublished = existing.status === 'published';
  const isPublishingNow = parsed.data.status === 'published' && !wasPublished;

  const news = await service.updateNews(id, parsed.data);
  if (!news) {
    return error('Article not found', 404);
  }

  // If this is a new publish action, trigger notifications
  if (isPublishingNow) {
    const siteUrl = 'https://newshaberglobal.vercel.app';
    const relayUrl = c.env.SMTP_RELAY_URL || '';
    const relaySecret = c.env.SMTP_RELAY_SECRET || '';

    // Get category slug
    const cat = await c.env.DB.prepare('SELECT slug FROM categories WHERE id = ?').bind(news.category_id).first<{ slug: string }>();
    const categorySlug = cat?.slug || '';

    await triggerNotifications(
      c.env.DB, news.id, news.title, news.slug, news.excerpt,
      categorySlug, siteUrl, relayUrl, relaySecret,
      c.env.VAPID_PUBLIC_KEY, c.env.VAPID_PRIVATE_KEY
    );
  }

  return success(news);
});

// DELETE /api/news/:id - Admin only
newsRoutes.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const id = parseInt(c.req.param('id'));
  const service = new NewsService(c.env.DB);
  const deleted = await service.deleteNews(id);
  if (!deleted) {
    return error('Article not found', 404);
  }
  return success({ message: 'Article deleted successfully' });
});

export default newsRoutes;
