import { asc, count, eq } from 'drizzle-orm';
import { createDb, type Db } from '../db';
import { categories, news } from '../db/schema';
import { turkeyNowSQL } from '../utils/time';
import { generateSlug } from '../utils/validation';

export class CategoryService {
  private db: Db;

  constructor(d1Database: import('@cloudflare/workers-types').D1Database) {
    this.db = createDb(d1Database);
  }

  async getAllCategories() {
    return this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async getCategoryBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    return result[0] || null;
  }

  async getCategoryById(id: number) {
    const result = await this.db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0] || null;
  }

  async createCategory(data: {
    name: string;
    slug?: string;
    description?: string;
    color?: string;
    sort_order?: number;
  }) {
    const slug = data.slug || generateSlug(data.name);
    const now = turkeyNowSQL();

    const [result] = await this.db
      .insert(categories)
      .values({
        name: data.name,
        slug,
        description: data.description || null,
        color: data.color || '#6366f1',
        sortOrder: data.sort_order ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return result;
  }

  async updateCategory(
    id: number,
    data: Partial<{
      name: string;
      slug: string;
      description: string;
      color: string;
      sort_order: number;
    }>
  ) {
    const existing = await this.getCategoryById(id);
    if (!existing) return null;

    const updates: Record<string, unknown> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.description !== undefined) updates.description = data.description;
    if (data.color !== undefined) updates.color = data.color;
    if (data.sort_order !== undefined) updates.sortOrder = data.sort_order;

    if (Object.keys(updates).length === 0) return existing;

    updates.updatedAt = turkeyNowSQL();

    const [result] = await this.db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();

    return result;
  }

  async deleteCategory(id: number): Promise<{ success: boolean; error?: string }> {
    const existing = await this.getCategoryById(id);
    if (!existing) {
      return { success: false, error: 'Category not found' };
    }

    const articleCount = await this.db
      .select({ count: count() })
      .from(news)
      .where(eq(news.categoryId, id));

    if (articleCount[0]?.count > 0) {
      return {
        success: false,
        error: `Cannot delete category with ${articleCount[0].count} existing articles`,
      };
    }

    const result = await this.db.delete(categories).where(eq(categories.id, id)).returning();

    return { success: result.length > 0 };
  }
}
