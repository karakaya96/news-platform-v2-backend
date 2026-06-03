import type { News, NewsWithRelations, Bindings } from '../types';
import { generateSlug } from '../utils/validation';
import { turkeyNowISO, turkeyNowSQL } from '../utils/time';

export class NewsService {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  async getAllNews(
    page: number = 1,
    limit: number = 10,
    category?: string,
    status?: string,
    search?: string,
    featured?: string,
    breaking?: string,
    dateFrom?: string,
    dateTo?: string,
    sortBy?: string
  ): Promise<{ news: NewsWithRelations[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Status filter: 'all' or undefined = no filter (show all statuses)
    if (status && status !== 'all') {
      conditions.push('n.status = ?');
      params.push(status);
    }

    if (category) {
      conditions.push('c.slug = ?');
      params.push(category);
    }

    if (search) {
      conditions.push(
        '(n.title LIKE ? OR n.excerpt LIKE ? OR n.content LIKE ?)'
      );
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Featured filter
    if (featured === '1' || featured === 'true') {
      conditions.push('n.is_featured = 1');
    } else if (featured === '0') {
      conditions.push('n.is_featured = 0');
    }

    // Breaking filter
    if (breaking === '1' || breaking === 'true') {
      conditions.push('n.is_breaking = 1');
    } else if (breaking === '0') {
      conditions.push('n.is_breaking = 0');
    }

    // Date range filter
    if (dateFrom) {
      conditions.push("strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(n.published_at, n.created_at)) >= ?");
      params.push(dateFrom);
    }
    if (dateTo) {
      // dateTo is inclusive: add 23:59:59 to include the entire day
      conditions.push("strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(n.published_at, n.created_at)) <= ?");
      params.push(dateTo + 'T23:59:59Z');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    // Sort order
    let orderBy: string;
    switch (sortBy) {
      case 'oldest':
        orderBy = 'n.published_at ASC, n.created_at ASC';
        break;
      case 'views':
        orderBy = 'n.view_count DESC';
        break;
      case 'title_asc':
        orderBy = 'n.title ASC';
        break;
      case 'title_desc':
        orderBy = 'n.title DESC';
        break;
      case 'newest':
      default:
        orderBy = 'n.published_at DESC, n.created_at DESC';
        break;
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      ${whereClause}
    `;

    const dataQuery = `
      SELECT n.*, 
        c.name as category_name, c.slug as category_slug, c.color as category_color,
        u.name as author_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.id
      LEFT JOIN users u ON n.author_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const countResult = await this.db.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = countResult?.total || 0;

    const news = await this.db
      .prepare(dataQuery)
      .bind(...params, limit, offset)
      .all<NewsWithRelations>();

    return { news: news.results || [], total };
  }

  async getNewsById(id: number): Promise<NewsWithRelations | null> {
    const news = await this.db.prepare(`
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.id = ?
    `).bind(id).first<NewsWithRelations>();
    
    if (!news) return null;
    
    const tags = await this.db.prepare(`
        SELECT t.id, t.name, t.slug
        FROM tags t
        JOIN news_tags nt ON t.id = nt.tag_id
        WHERE nt.news_id = ?
    `).bind(news.id).all<{ id: number; name: string; slug: string }>();
    
    return { ...news, tags: tags.results || [] };
  }

  async getNewsBySlug(slug: string): Promise<NewsWithRelations | null> {
    const news = await this.db
      .prepare(`
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.slug = ?
      `)
      .bind(slug)
      .first<NewsWithRelations>();

    if (!news) return null;

    const tags = await this.db
      .prepare(`
        SELECT t.id, t.name, t.slug
        FROM tags t
        JOIN news_tags nt ON t.id = nt.tag_id
        WHERE nt.news_id = ?
      `)
      .bind(news.id)
      .all<{ id: number; name: string; slug: string }>();

    return { ...news, tags: tags.results || [] };
  }

  async getFeaturedNews(): Promise<NewsWithRelations[]> {
    const result = await this.db
      .prepare(`
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.is_featured = 1 AND n.status = 'published'
        ORDER BY n.published_at DESC
        LIMIT 50
      `)
      .all<NewsWithRelations>();
    return result.results || [];
  }

  async getBreakingNews(): Promise<NewsWithRelations[]> {
    const result = await this.db
      .prepare(`
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.is_breaking = 1 AND n.status = 'published'
        ORDER BY n.published_at DESC
        LIMIT 50
      `)
      .all<NewsWithRelations>();
    return result.results || [];
  }

  async getRelatedNews(id: number, categoryId: number, limit: number = 4): Promise<NewsWithRelations[]> {
    const result = await this.db
      .prepare(`
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.category_id = ? AND n.id != ? AND n.status = 'published'
        ORDER BY n.published_at DESC
        LIMIT ?
      `)
      .bind(categoryId, id, limit)
      .all<NewsWithRelations>();
    return result.results || [];
  }

  async createNews(data: {
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
  }): Promise<News> {
    const slug = data.slug || generateSlug(data.title);
    const isFeatured = data.is_featured ? 1 : 0;
    const isBreaking = data.is_breaking ? 1 : 0;
    // Turkey is UTC+3
    const now = turkeyNowISO();
    const nowSQL = turkeyNowSQL();
    const publishedAt = data.status === 'published' && !data.published_at
      ? now
      : data.published_at;

    const result = await this.db
      .prepare(`
        INSERT INTO news (title, slug, excerpt, content, image_url, image_alt, category_id, author_id, status, is_featured, is_breaking, seo_title, seo_description, seo_keywords, published_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        data.title, slug, data.excerpt || null, data.content,
        data.image_url || null, data.image_alt || null,
        data.category_id, data.author_id, data.status || 'draft',
        isFeatured, isBreaking,
        data.seo_title || null, data.seo_description || null, data.seo_keywords || null,
        publishedAt || null, nowSQL, nowSQL
      )
      .run();

    const newsId = result.meta.last_row_id;

    if (data.tag_ids && data.tag_ids.length > 0) {
      const stmt = this.db.prepare('INSERT INTO news_tags (news_id, tag_id) VALUES (?, ?)');
      await this.db.batch(data.tag_ids.map((tagId) => stmt.bind(newsId, tagId)));
    }

    const created = await this.db.prepare('SELECT * FROM news WHERE id = ?').bind(newsId).first<News>();
    return created!;
  }

  async updateNews(id: number, data: Partial<{
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    image_url: string | null;
    image_alt: string | null;
    category_id: number;
    status: string;
    is_featured: boolean;
    is_breaking: boolean;
    seo_title: string;
    seo_description: string;
    seo_keywords: string;
    published_at: string;
    tag_ids: number[];
  }>): Promise<News | null> {
    const existing = await this.db.prepare('SELECT * FROM news WHERE id = ?').bind(id).first<News>();
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title); }
    if (data.slug !== undefined) { updates.push('slug = ?'); params.push(data.slug); }
    if (data.excerpt !== undefined) { updates.push('excerpt = ?'); params.push(data.excerpt); }
    if (data.content !== undefined) { updates.push('content = ?'); params.push(data.content); }
    if (data.image_url !== undefined) { updates.push('image_url = ?'); params.push(data.image_url); }
    if (data.image_alt !== undefined) { updates.push('image_alt = ?'); params.push(data.image_alt); }
    if (data.category_id !== undefined) { updates.push('category_id = ?'); params.push(data.category_id); }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
      if (data.status === 'published' && !existing.published_at) {
        updates.push('published_at = ?');
        params.push(turkeyNowISO());
      }
    }
    if (data.is_featured !== undefined) { updates.push('is_featured = ?'); params.push(data.is_featured ? 1 : 0); }
    if (data.is_breaking !== undefined) { updates.push('is_breaking = ?'); params.push(data.is_breaking ? 1 : 0); }
    if (data.seo_title !== undefined) { updates.push('seo_title = ?'); params.push(data.seo_title); }
    if (data.seo_description !== undefined) { updates.push('seo_description = ?'); params.push(data.seo_description); }
    if (data.seo_keywords !== undefined) { updates.push('seo_keywords = ?'); params.push(data.seo_keywords); }
    if (data.published_at !== undefined) { updates.push('published_at = ?'); params.push(data.published_at); }

    updates.push('updated_at = ?');
    params.push(turkeyNowSQL());

    if (updates.length > 1) {
      await this.db
        .prepare(`UPDATE news SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params, id)
        .run();
    }

    if (data.tag_ids !== undefined) {
      await this.db.prepare('DELETE FROM news_tags WHERE news_id = ?').bind(id).run();
      if (data.tag_ids.length > 0) {
        const stmt = this.db.prepare('INSERT INTO news_tags (news_id, tag_id) VALUES (?, ?)');
        await this.db.batch(data.tag_ids.map((tagId) => stmt.bind(id, tagId)));
      }
    }

    return this.db.prepare('SELECT * FROM news WHERE id = ?').bind(id).first<News>();
  }

  async deleteNews(id: number): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
    return result.meta.changes > 0;
  }

  async incrementViewCount(id: number): Promise<void> {
    await this.db
      .prepare('UPDATE news SET view_count = view_count + 1 WHERE id = ?')
      .bind(id)
      .run();
  }

  async searchNews(query: string, page: number = 1, limit: number = 10): Promise<{ news: NewsWithRelations[]; total: number }> {
    const offset = (page - 1) * limit;
    const searchTerm = `%${query}%`;

    const countResult = await this.db
      .prepare(`
        SELECT COUNT(*) as total FROM news n
        WHERE n.status = 'published' AND (n.title LIKE ? OR n.excerpt LIKE ?)
      `)
      .bind(searchTerm, searchTerm)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    const result = await this.db
      .prepare(`
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE n.status = 'published' AND (n.title LIKE ? OR n.excerpt LIKE ?)
        ORDER BY n.published_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(searchTerm, searchTerm, limit, offset)
      .all<NewsWithRelations>();

    return { news: result.results || [], total };
  }

  // ============================================
  // Full-Text Search (FTS5)
  // ============================================

  async advancedSearch(params: {
    query: string;
    page?: number;
    limit?: number;
    category?: string;
    author?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: 'relevance' | 'date' | 'views';
  }): Promise<{ news: NewsWithRelations[]; total: number }> {
    const {
      query,
      page = 1,
      limit = 10,
      category,
      author,
      dateFrom,
      dateTo,
      sortBy = 'relevance',
    } = params;

    const offset = (page - 1) * limit;
    const conditions: string[] = ["n.status = 'published'"];
    const countParams: unknown[] = [];
    const joinParams: unknown[] = [];

    // FTS5 query
    let ftsQuery = query.trim();
    if (!ftsQuery) {
      // No query — return all published news with filters
    } else {
      // Sanitize and build FTS5 query (support phrase + AND/OR)
      ftsQuery = ftsQuery.replace(/['"]/g, '');
    }

    // Category filter
    if (category) {
      conditions.push('c.slug = ?');
      countParams.push(category);
      joinParams.push(category);
    }

    // Author filter
    if (author) {
      conditions.push('u.name LIKE ?');
      countParams.push(`%${author}%`);
      joinParams.push(`%${author}%`);
    }

    // Date range filter
    if (dateFrom) {
      conditions.push("strftime('%Y-%m-%dT%H:%M:%SZ', n.published_at) >= ?");
      countParams.push(dateFrom);
      joinParams.push(dateFrom);
    }
    if (dateTo) {
      // dateTo is inclusive: add 23:59:59 to include the entire day
      conditions.push("strftime('%Y-%m-%dT%H:%M:%SZ', n.published_at) <= ?");
      countParams.push(dateTo + 'T23:59:59Z');
      joinParams.push(dateTo + 'T23:59:59Z');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let news: NewsWithRelations[] = [];
    let total = 0;

    if (ftsQuery) {
      // FTS5 search with ranking
      const rankExpr = sortBy === 'relevance' ? ', rank' : '';

      // Count
      const countSql = `
        SELECT COUNT(*) as total FROM news_fts fts
        JOIN news n ON n.id = fts.rowid
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE news_fts MATCH ? AND ${conditions.join(' AND ')}
      `;
      const countResult = await this.db.prepare(countSql).bind(ftsQuery, ...countParams).first<{ total: number }>();
      total = countResult?.total || 0;

      // Data query
      let orderClause: string;
      switch (sortBy) {
        case 'views':
          orderClause = 'n.view_count DESC';
          break;
        case 'date':
          orderClause = 'n.published_at DESC';
          break;
        case 'relevance':
        default:
          orderClause = 'rank';
          break;
      }

      const dataSql = `
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name${rankExpr}
        FROM news_fts fts
        JOIN news n ON n.id = fts.rowid
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        WHERE news_fts MATCH ? AND ${conditions.join(' AND ')}
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `;

      const result = await this.db
        .prepare(dataSql)
        .bind(ftsQuery, ...joinParams, limit, offset)
        .all<NewsWithRelations>();

      news = result.results || [];
    } else {
      // No search query — use regular filtered listing
      const countSql = `
        SELECT COUNT(*) as total
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        ${whereClause}
      `;
      const countResult = await this.db.prepare(countSql).bind(...countParams).first<{ total: number }>();
      total = countResult?.total || 0;

      let orderClause = 'n.published_at DESC';
      if (sortBy === 'views') orderClause = 'n.view_count DESC';

      const dataSql = `
        SELECT n.*, 
          c.name as category_name, c.slug as category_slug, c.color as category_color,
          u.name as author_name
        FROM news n
        LEFT JOIN categories c ON n.category_id = c.id
        LEFT JOIN users u ON n.author_id = u.id
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT ? OFFSET ?
      `;

      const result = await this.db
        .prepare(dataSql)
        .bind(...joinParams, limit, offset)
        .all<NewsWithRelations>();

      news = result.results || [];
    }

    return { news, total };
  }

  // Autocomplete suggestions
  async searchSuggest(query: string, limit: number = 5): Promise<{ id: number; title: string; slug: string }[]> {
    if (!query || query.trim().length < 2) return [];

    const safeQuery = query.trim().replace(/['"]/g, '');
    // FTS5 prefix search
    const ftsQuery = `${safeQuery}*`;

    const result = await this.db
      .prepare(`
        SELECT n.id, n.title, n.slug
        FROM news_fts fts
        JOIN news n ON n.id = fts.rowid
        WHERE news_fts MATCH ? AND n.status = 'published'
        ORDER BY rank
        LIMIT ?
      `)
      .bind(ftsQuery, limit)
      .all<{ id: number; title: string; slug: string }>();

    return result.results || [];
  }
}
