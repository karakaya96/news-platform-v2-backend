import { Hono } from 'hono';
import type { Bindings } from '../types';
import { NewsService } from '../services/news.service';
import { authMiddleware } from '../middleware/auth';
import { success, error, paginated } from '../utils/response';
import { createNewsSchema, updateNewsSchema } from '../utils/validation';

const newsRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/news - Public, with pagination, filtering, search
newsRoutes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');
  const category = c.req.query('category');
  const status = c.req.query('status');
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
  const news = await service.createNews({ ...parsed.data, author_id: user.sub });
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
  const news = await service.updateNews(id, parsed.data);
  if (!news) {
    return error('Article not found', 404);
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
