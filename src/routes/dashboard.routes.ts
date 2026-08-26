import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Bindings } from '../types';
import { error, success } from '../utils/response';

const dashboardRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/dashboard/stats - Any authenticated user can view
dashboardRoutes.get('/stats', authMiddleware, async (c) => {
  const user = c.get('user') as { role?: string } | undefined;
  if (!user) {
    return error('Unauthorized', 401);
  }
  // Only admin, editor can view full dashboard stats
  if (!['admin', 'editor'].includes(user.role || '')) {
    return error('Access denied', 403);
  }

  const db = c.env.DB;

  const totalNews = await db
    .prepare('SELECT COUNT(*) as count FROM news')
    .first<{ count: number }>();

  const totalCategories = await db
    .prepare('SELECT COUNT(*) as count FROM categories')
    .first<{ count: number }>();

  const recentNewsResult = await db
    .prepare(`
      SELECT n.id, n.title, n.slug, n.status, n.view_count, n.image_url, n.published_at, n.created_at,
        c.name as category_name, c.slug as category_slug, c.color as category_color,
        u.name as author_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      LEFT JOIN users u ON n.author_id = u.id
      ORDER BY n.created_at DESC
      LIMIT 10
    `)
    .all();

  // Map snake_case to camelCase for frontend
  const recentNews = (recentNewsResult.results || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    viewCount: row.view_count,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    categoryColor: row.category_color,
    authorName: row.author_name,
  }));

  const categoryDistributionResult = await db
    .prepare(`
      SELECT c.id, c.name, c.slug, c.color, COUNT(n.id) as article_count
      FROM categories c
      LEFT JOIN news n ON c.id = n.category_id
      GROUP BY c.id
      ORDER BY article_count DESC
    `)
    .all();

  // Map snake_case to camelCase for frontend
  const categoryDistribution = (categoryDistributionResult.results || []).map((row: Record<string, unknown>) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    color: row.color,
    articleCount: row.article_count,
  }));

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
    .prepare('SELECT COUNT(*) as count FROM subscriptions WHERE is_active = 1')
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
    recentNews,
    categoryDistribution,
  });
});

export default dashboardRoutes;
