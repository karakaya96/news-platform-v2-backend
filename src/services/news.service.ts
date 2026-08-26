import { and, asc, count, desc, eq, inArray, like, not, or, sql } from 'drizzle-orm';
import { createDb, type Db } from '../db';
import { categories, news, newsTags, tags, users } from '../db/schema';
import { turkeyNowISO, turkeyNowSQL } from '../utils/time';
import { generateSlug } from '../utils/validation';

// Escape LIKE wildcard characters to prevent LIKE injection
function escapeLike(str: string): string {
  return str.replace(/[%_]/g, '\\$&');
}

// Type for news with relations
interface NewsWithRelations {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  imageUrl: string | null;
  imageAlt: string | null;
  categoryId: number;
  authorId: number;
  status: 'draft' | 'published' | 'archived';
  isFeatured: boolean;
  isBreaking: boolean;
  viewCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  categoryName?: string;
  categorySlug?: string;
  categoryColor?: string;
  authorName?: string;
  tags?: Array<{ id: number; name: string; slug: string }>;
}

export class NewsService {
  private db: Db;

  constructor(d1Database: import('@cloudflare/workers-types').D1Database) {
    this.db = createDb(d1Database);
  }

  // Helper to build base query with relations
  private async getNewsWithRelations(
    whereClause: import('drizzle-orm').SQL<unknown>,
    orderBy: import('drizzle-orm').SQL<unknown>[],
    limit: number,
    offset: number
  ): Promise<NewsWithRelations[]> {
    // First get base news data with category join for filtering
    const baseNews = await this.db
      .select({
        id: news.id,
        title: news.title,
        slug: news.slug,
        excerpt: news.excerpt,
        content: news.content,
        imageUrl: news.imageUrl,
        imageAlt: news.imageAlt,
        categoryId: news.categoryId,
        authorId: news.authorId,
        status: news.status,
        isFeatured: news.isFeatured,
        isBreaking: news.isBreaking,
        viewCount: news.viewCount,
        seoTitle: news.seoTitle,
        seoDescription: news.seoDescription,
        seoKeywords: news.seoKeywords,
        publishedAt: news.publishedAt,
        createdAt: news.createdAt,
        updatedAt: news.updatedAt,
      })
      .from(news)
      .leftJoin(categories, eq(news.categoryId, categories.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset);

    if (baseNews.length === 0) return [];

    // Get category and author info for these news items
    const newsIds = baseNews.map((n) => n.id);
    const categoryIds = [...new Set(baseNews.map((n) => n.categoryId).filter(Boolean))];
    const authorIds = [...new Set(baseNews.map((n) => n.authorId).filter(Boolean))];

    const [categoriesData, authorsData, tagsData] = await Promise.all([
      categoryIds.length > 0
        ? this.db.select().from(categories).where(inArray(categories.id, categoryIds))
        : Promise.resolve([]),
      authorIds.length > 0
        ? this.db.select().from(users).where(inArray(users.id, authorIds))
        : Promise.resolve([]),
      newsIds.length > 0
        ? this.db
            .select({
              newsId: newsTags.newsId,
              tagId: tags.id,
              tagName: tags.name,
              tagSlug: tags.slug,
            })
            .from(newsTags)
            .innerJoin(tags, eq(newsTags.tagId, tags.id))
            .where(inArray(newsTags.newsId, newsIds))
        : Promise.resolve([]),
    ]);

    // Build maps for quick lookup
    const categoryMap = new Map(categoriesData.map((c) => [c.id, c]));
    const authorMap = new Map(authorsData.map((a) => [a.id, a]));
    const tagsMap = new Map<number, Array<{ id: number; name: string; slug: string }>>();
    for (const t of tagsData) {
      const arr = tagsMap.get(t.newsId) || [];
      arr.push({ id: t.tagId, name: t.tagName, slug: t.tagSlug });
      tagsMap.set(t.newsId, arr);
    }

    // Combine all data
    return baseNews.map((n) => {
      const author = authorMap.get(n.authorId);
      return {
        ...n,
        categoryName: categoryMap.get(n.categoryId)?.name || '',
        categorySlug: categoryMap.get(n.categoryId)?.slug || '',
        categoryColor: categoryMap.get(n.categoryId)?.color || '#6366f1',
        authorName: author?.name || '',
        authorAvatarUrl: author?.avatarUrl || author?.avatar_url || null,
        tags: tagsMap.get(n.id) || [],
      };
    });
  }

  async getAllNews(
    page = 1,
    limit = 10,
    category?: string,
    status?: string,
    search?: string,
    featured?: string,
    breaking?: string,
    dateFrom?: string,
    dateTo?: string,
    sortBy?: string
  ): Promise<{ news: NewsWithRelations[]; total: number }> {
    const conditions = [];

    if (status && status !== 'all') {
      conditions.push(eq(news.status, status as 'draft' | 'published' | 'archived'));
    }

    // Resolve category slug to categoryId for proper filtering
    let categoryId: number | null = null;
    if (category) {
      const cat = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, category))
        .limit(1);
      if (cat.length > 0) {
        categoryId = cat[0].id;
        conditions.push(eq(news.categoryId, categoryId));
      } else {
        // Category not found, return empty result
        return { news: [], total: 0 };
      }
    }

    if (search) {
      const searchTerm = `%${escapeLike(search)}%`;
      conditions.push(
        or(
          like(news.title, searchTerm),
          like(news.excerpt, searchTerm),
          like(news.content, searchTerm)
        )
      );
    }

    if (featured === '1' || featured === 'true') {
      conditions.push(eq(news.isFeatured, true));
    } else if (featured === '0') {
      conditions.push(eq(news.isFeatured, false));
    }

    if (breaking === '1' || breaking === 'true') {
      conditions.push(eq(news.isBreaking, true));
    } else if (breaking === '0') {
      conditions.push(eq(news.isBreaking, false));
    }

    if (dateFrom) {
      conditions.push(
        sql`strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(${news.publishedAt}, ${news.createdAt})) >= ${dateFrom}`
      );
    }
    if (dateTo) {
      conditions.push(
        sql`strftime('%Y-%m-%dT%H:%M:%SZ', COALESCE(${news.publishedAt}, ${news.createdAt})) <= ${`${dateTo}T23:59:59Z`}`
      );
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max((page - 1) * safeLimit, 0);

    let orderBy: import('drizzle-orm').SQL<unknown>[];
    switch (sortBy) {
      case 'oldest':
        orderBy = [asc(news.publishedAt), asc(news.createdAt)];
        break;
      case 'views':
        orderBy = [desc(news.viewCount)];
        break;
      case 'title_asc':
        orderBy = [asc(news.title)];
        break;
      case 'title_desc':
        orderBy = [desc(news.title)];
        break;
      default:
        orderBy = [desc(news.publishedAt), desc(news.createdAt)];
        break;
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count query
    const countResult = await this.db
      .select({ total: count() })
      .from(news)
      .leftJoin(categories, eq(news.categoryId, categories.id))
      .where(whereClause);
    const total = countResult[0]?.total || 0;

    // Data query
    const newsResults = await this.getNewsWithRelations(
      whereClause,
      orderBy,
      safeLimit,
      safeOffset
    );

    return { news: newsResults, total };
  }

  async getNewsById(id: number): Promise<NewsWithRelations | null> {
    const result = await this.getNewsWithRelations(eq(news.id, id), [desc(news.publishedAt)], 1, 0);
    return result[0] || null;
  }

  async getNewsBySlug(slug: string): Promise<NewsWithRelations | null> {
    const result = await this.getNewsWithRelations(
      eq(news.slug, slug),
      [desc(news.publishedAt)],
      1,
      0
    );
    return result[0] || null;
  }

  async getFeaturedNews(): Promise<NewsWithRelations[]> {
    return this.getNewsWithRelations(
      and(eq(news.isFeatured, true), eq(news.status, 'published')),
      [desc(news.publishedAt)],
      50,
      0
    );
  }

  async getBreakingNews(): Promise<NewsWithRelations[]> {
    return this.getNewsWithRelations(
      and(eq(news.isBreaking, true), eq(news.status, 'published')),
      [desc(news.publishedAt)],
      50,
      0
    );
  }

  async getRelatedNews(id: number, categoryId: number, limit = 4): Promise<NewsWithRelations[]> {
    return this.getNewsWithRelations(
      and(eq(news.categoryId, categoryId), eq(news.status, 'published'), not(eq(news.id, id))),
      [desc(news.publishedAt)],
      limit,
      0
    );
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
  }): Promise<NewsWithRelations> {
    const slug = data.slug || generateSlug(data.title);
    const isFeatured = !!data.is_featured;
    const isBreaking = !!data.is_breaking;
    const now = turkeyNowISO();
    const nowSQL = turkeyNowSQL();
    const publishedAt = data.status === 'published' && !data.published_at ? now : data.published_at;

    const [result] = await this.db
      .insert(news)
      .values({
        title: data.title,
        slug,
        excerpt: data.excerpt || null,
        content: data.content,
        imageUrl: data.image_url || null,
        imageAlt: data.image_alt || null,
        categoryId: data.category_id,
        authorId: data.author_id,
        status: (data.status || 'draft') as 'draft' | 'published' | 'archived',
        isFeatured,
        isBreaking,
        seoTitle: data.seo_title || null,
        seoDescription: data.seo_description || null,
        seoKeywords: data.seo_keywords || null,
        publishedAt: publishedAt || null,
        createdAt: nowSQL,
        updatedAt: nowSQL,
        viewCount: 0,
      })
      .returning();

    if (data.tag_ids && data.tag_ids.length > 0) {
      await this.db.insert(newsTags).values(
        data.tag_ids.map((tagId) => ({
          newsId: result.id,
          tagId,
        }))
      );
    }

    return this.getNewsById(result.id) || (result as unknown as NewsWithRelations);
  }

  async updateNews(
    id: number,
    data: Partial<{
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
    }>
  ): Promise<NewsWithRelations | null> {
    const existing = await this.getNewsById(id);
    if (!existing) return null;

    const updates: Record<string, unknown> = {};

    if (data.title !== undefined) updates.title = data.title;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.excerpt !== undefined) updates.excerpt = data.excerpt;
    if (data.content !== undefined) updates.content = data.content;
    if (data.image_url !== undefined) updates.imageUrl = data.image_url;
    if (data.image_alt !== undefined) updates.imageAlt = data.image_alt;
    if (data.category_id !== undefined) updates.categoryId = data.category_id;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === 'published' && !existing.publishedAt) {
        updates.publishedAt = turkeyNowISO();
      }
    }
    if (data.is_featured !== undefined) updates.isFeatured = data.is_featured;
    if (data.is_breaking !== undefined) updates.isBreaking = data.is_breaking;
    if (data.seo_title !== undefined) updates.seoTitle = data.seo_title;
    if (data.seo_description !== undefined) updates.seoDescription = data.seo_description;
    if (data.seo_keywords !== undefined) updates.seoKeywords = data.seo_keywords;
    if (data.published_at !== undefined) updates.publishedAt = data.published_at;

    updates.updatedAt = turkeyNowSQL();

    if (Object.keys(updates).length > 0) {
      await this.db.update(news).set(updates).where(eq(news.id, id));
    }

    if (data.tag_ids !== undefined) {
      await this.db.delete(newsTags).where(eq(newsTags.newsId, id));
      if (data.tag_ids.length > 0) {
        await this.db.insert(newsTags).values(
          data.tag_ids.map((tagId) => ({
            newsId: id,
            tagId,
          }))
        );
      }
    }

    return this.getNewsById(id);
  }

  async deleteNews(id: number): Promise<boolean> {
    const result = await this.db.delete(news).where(eq(news.id, id)).returning();
    return result.length > 0;
  }

  async incrementViewCount(id: number): Promise<void> {
    await this.db
      .update(news)
      .set({ viewCount: sql`${news.viewCount} + 1` })
      .where(eq(news.id, id));
  }

  async searchNews(
    query: string,
    page = 1,
    limit = 10
  ): Promise<{ news: NewsWithRelations[]; total: number }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max((page - 1) * safeLimit, 0);
    const term = query.trim();

    const searchCondition = or(
      sql`instr(lower(${news.title}), lower(${term})) > 0`,
      sql`instr(lower(${news.excerpt}), lower(${term})) > 0`
    );

    const countResult = await this.db
      .select({ total: count() })
      .from(news)
      .where(and(eq(news.status, 'published'), searchCondition));
    const total = countResult[0]?.total || 0;

    const newsResults = await this.getNewsWithRelations(
      and(eq(news.status, 'published'), searchCondition),
      [desc(news.publishedAt)],
      safeLimit,
      safeOffset
    );

    return { news: newsResults, total };
  }

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

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max((page - 1) * safeLimit, 0);

    // Case-insensitive search helper (SQLite LIKE is only ASCII case-insensitive)
    const searchCondition = (term: string) =>
      or(
        sql`instr(lower(${news.title}), lower(${term})) > 0`,
        sql`instr(lower(${news.excerpt}), lower(${term})) > 0`,
        sql`instr(lower(${news.content}), lower(${term})) > 0`
      );

    const conditions = [eq(news.status, 'published')];

    let ftsQuery = query.trim();
    if (ftsQuery) {
      ftsQuery = ftsQuery.replace(/['"]/g, '');
    }

    // Queries shorter than 2 chars would match nearly every article — ignore them
    if (ftsQuery && ftsQuery.length < 2) {
      ftsQuery = '';
    }

    if (ftsQuery) {
      // Support multi-word queries: every word must appear somewhere (AND semantics)
      const words = ftsQuery.split(/\s+/).filter(Boolean);
      for (const word of words) {
        conditions.push(searchCondition(word));
      }
    }

    if (category) {
      conditions.push(eq(categories.slug, category));
    }

    if (author) {
      conditions.push(like(users.name, `%${author}%`));
    }

    if (dateFrom) {
      conditions.push(sql`strftime('%Y-%m-%dT%H:%M:%SZ', ${news.publishedAt}) >= ${dateFrom}`);
    }
    if (dateTo) {
      conditions.push(
        sql`strftime('%Y-%m-%dT%H:%M:%SZ', ${news.publishedAt}) <= ${`${dateTo}T23:59:59Z`}`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let newsResults: NewsWithRelations[] = [];
    let total = 0;

    {
      const countResult = await this.db
        .select({ total: count() })
        .from(news)
        .leftJoin(categories, eq(news.categoryId, categories.id))
        .leftJoin(users, eq(news.authorId, users.id))
        .where(whereClause);
      total = countResult[0]?.total || 0;

      let orderBy: import('drizzle-orm').SQL<unknown>[];
      switch (sortBy) {
        case 'views':
          orderBy = [desc(news.viewCount), desc(news.publishedAt)];
          break;
        case 'relevance':
          if (ftsQuery) {
            // Weighted relevance: title hit ranks highest, then excerpt, then content-only
            const titleHit = sql`CASE WHEN instr(lower(${news.title}), lower(${ftsQuery})) > 0 THEN 3 ELSE 0 END`;
            const excerptHit = sql`CASE WHEN instr(lower(${news.excerpt}), lower(${ftsQuery})) > 0 THEN 2 ELSE 0 END`;
            orderBy = [desc(sql`${titleHit} + ${excerptHit}`), desc(news.publishedAt)];
          } else {
            orderBy = [desc(news.publishedAt)];
          }
          break;
        default:
          orderBy = [desc(news.publishedAt)];
          break;
      }

      newsResults = await this.getNewsWithRelations(whereClause, orderBy, safeLimit, safeOffset);
    }

    return { news: newsResults, total };
  }

  // Autocomplete suggestions
  async searchSuggest(
    query: string,
    limit = 5
  ): Promise<{ id: number; title: string; slug: string }[]> {
    if (!query || query.trim().length < 2) return [];
    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const term = query.trim().replace(/['"]/g, '');

    const searchCondition = or(
      sql`instr(lower(${news.title}), lower(${term})) > 0`,
      sql`instr(lower(${news.excerpt}), lower(${term})) > 0`
    );

    const result = await this.db
      .select({
        id: news.id,
        title: news.title,
        slug: news.slug,
      })
      .from(news)
      .where(and(eq(news.status, 'published'), searchCondition))
      .orderBy(desc(news.publishedAt))
      .limit(safeLimit);

    return result;
  }
}
