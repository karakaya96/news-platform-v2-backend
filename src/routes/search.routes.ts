import { Hono } from 'hono';
import type { Bindings } from '../types';
import { NewsService } from '../services/news.service';
import { success, error, paginated } from '../utils/response';

const searchRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/search - Advanced full-text search with filters
searchRoutes.get('/', async (c) => {
  const query = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');
  const category = c.req.query('category');
  const author = c.req.query('author') || c.req.query('yazar');
  const dateFrom = c.req.query('from') || c.req.query('from_date');
  const dateTo = c.req.query('to') || c.req.query('to_date');
  const sortBy = (c.req.query('sort') || 'relevance') as 'relevance' | 'date' | 'views';

  const service = new NewsService(c.env.DB);

  try {
    const { news, total } = await service.advancedSearch({
      query,
      page,
      limit,
      category,
      author,
      dateFrom,
      dateTo,
      sortBy,
    });

    return paginated(news, total, page, limit);
  } catch (err: any) {
    return error(`Arama hatası: ${err.message}`, 500);
  }
});

// GET /api/search/suggest - Autocomplete suggestions
searchRoutes.get('/suggest', async (c) => {
  const query = c.req.query('q') || '';
  const limit = parseInt(c.req.query('limit') || '5');

  if (query.length < 2) {
    return success([]);
  }

  const service = new NewsService(c.env.DB);

  try {
    const suggestions = await service.searchSuggest(query, limit);
    return success(suggestions);
  } catch (err: any) {
    return error(`Öneri hatası: ${err.message}`, 500);
  }
});

export default searchRoutes;
