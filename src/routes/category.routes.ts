import { Hono } from 'hono';
import type { Bindings } from '../types';
import { CategoryService } from '../services/category.service';
import { NewsService } from '../services/news.service';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { createCategorySchema, updateCategorySchema } from '../utils/validation';

const categoryRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/categories - Public
categoryRoutes.get('/', async (c) => {
  const service = new CategoryService(c.env.DB);
  const categories = await service.getAllCategories();
  return success(categories);
});

// GET /api/categories/:slug - Public, with news
categoryRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');

  const categoryService = new CategoryService(c.env.DB);
  const category = await categoryService.getCategoryBySlug(slug);
  if (!category) {
    return error('Category not found', 404);
  }

  const newsService = new NewsService(c.env.DB);
  const { news, total } = await newsService.getAllNews(page, limit, slug);

  return success({ ...category, news, total, page, limit });
});

// POST /api/categories - Admin only
categoryRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.errors[0].message, 400);
  }

  const service = new CategoryService(c.env.DB);
  const category = await service.createCategory(parsed.data);
  return success(category, 201);
});

// PUT /api/categories/:id - Admin only
categoryRoutes.put('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.errors[0].message, 400);
  }

  const service = new CategoryService(c.env.DB);
  const category = await service.updateCategory(id, parsed.data);
  if (!category) {
    return error('Category not found', 404);
  }
  return success(category);
});

// DELETE /api/categories/:id - Admin only
categoryRoutes.delete('/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  const id = parseInt(c.req.param('id'));
  const service = new CategoryService(c.env.DB);
  const result = await service.deleteCategory(id);

  if (!result.success) {
    return error(result.error || 'Failed to delete category', 400);
  }

  return success({ message: 'Category deleted successfully' });
});

export default categoryRoutes;
