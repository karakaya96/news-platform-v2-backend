import { Hono } from 'hono';
import type { Bindings } from '../types';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';

const dashboardRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/dashboard/stats - Admin only
dashboardRoutes.get('/stats', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const db = c.env.DB;

  const totalNews = await db
    .prepare('SELECT COUNT(*) as count FROM news')
    .first<{ count: number }>();

  const totalCategories = await db
    .prepare('SELECT COUNT(*) as count FROM categories')
    .first<{ count: number }>();

  const recentNews = await db
    .prepare(`
      SELECT n.id, n.title, n.slug, n.status, n.view_count, n.image_url, n.published_at, n.created_at,
        c.name as category_name, c.color as category_color,
        u.name as author_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      LEFT JOIN users u ON n.author_id = u.id
      ORDER BY n.created_at DESC
      LIMIT 10
    `)
    .all();

  const categoryDistribution = await db
    .prepare(`
      SELECT c.id, c.name, c.slug, c.color, COUNT(n.id) as article_count
      FROM categories c
      LEFT JOIN news n ON c.id = n.category_id
      GROUP BY c.id
      ORDER BY article_count DESC
    `)
    .all();

  const publishedCount = await db
    .prepare("SELECT COUNT(*) as count FROM news WHERE status = 'published'")
    .first<{ count: number }>();

  const draftCount = await db
    .prepare("SELECT COUNT(*) as count FROM news WHERE status = 'draft'")
    .first<{ count: number }>();

  const archivedCount = await db
    .prepare("SELECT COUNT(*) as count FROM news WHERE status = 'archived'")
    .first<{ count: number }>();

  const pendingComments = await db
    .prepare("SELECT COUNT(*) as count FROM comments WHERE status = 'pending'")
    .first<{ count: number }>();

  // Subscription stats
  const activeSubscriptions = await db
    .prepare("SELECT COUNT(*) as count FROM subscriptions WHERE is_active = 1")
    .first<{ count: number }>();

  const browserSubscriptions = await db
    .prepare("SELECT COUNT(*) as count FROM subscriptions WHERE is_active = 1 AND type = 'browser'")
    .first<{ count: number }>();

  const emailSubscriptions = await db
    .prepare("SELECT COUNT(*) as count FROM subscriptions WHERE is_active = 1 AND type = 'email'")
    .first<{ count: number }>();

  return success({
    totalNews: totalNews?.count || 0,
    totalCategories: totalCategories?.count || 0,
    publishedCount: publishedCount?.count || 0,
    draftCount: draftCount?.count || 0,
    archivedCount: archivedCount?.count || 0,
    pendingComments: pendingComments?.count || 0,
    activeSubscriptions: activeSubscriptions?.count || 0,
    browserSubscriptions: browserSubscriptions?.count || 0,
    emailSubscriptions: emailSubscriptions?.count || 0,
    recentNews: recentNews.results || [],
    categoryDistribution: categoryDistribution.results || [],
  });
});

export default dashboardRoutes;
