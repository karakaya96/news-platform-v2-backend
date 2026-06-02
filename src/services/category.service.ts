import type { Category, Bindings } from '../types';
import { generateSlug } from '../utils/validation';

export class CategoryService {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  async getAllCategories(): Promise<Category[]> {
    const result = await this.db
      .prepare('SELECT * FROM categories ORDER BY sort_order ASC, name ASC')
      .all<Category>();
    return result.results || [];
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    return this.db
      .prepare('SELECT * FROM categories WHERE slug = ?')
      .bind(slug)
      .first<Category>();
  }

  async getCategoryById(id: number): Promise<Category | null> {
    return this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();
  }

  async createCategory(data: {
    name: string;
    slug?: string;
    description?: string;
    color?: string;
    sort_order?: number;
  }): Promise<Category> {
    const slug = data.slug || generateSlug(data.name);

    const result = await this.db
      .prepare(`
        INSERT INTO categories (name, slug, description, color, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        data.name,
        slug,
        data.description || null,
        data.color || '#6366f1',
        data.sort_order || 0
      )
      .run();

    const created = await this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(result.meta.last_row_id)
      .first<Category>();
    return created!;
  }

  async updateCategory(id: number, data: Partial<{
    name: string;
    slug: string;
    description: string;
    color: string;
    sort_order: number;
  }>): Promise<Category | null> {
    const existing = await this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.slug !== undefined) { updates.push('slug = ?'); params.push(data.slug); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.color !== undefined) { updates.push('color = ?'); params.push(data.color); }
    if (data.sort_order !== undefined) { updates.push('sort_order = ?'); params.push(data.sort_order); }

    if (updates.length === 0) return existing;

    await this.db
      .prepare(`UPDATE categories SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...params, id)
      .run();

    return this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .bind(id)
      .first<Category>();
  }

  async deleteCategory(id: number): Promise<{ success: boolean; error?: string }> {
    const articleCount = await this.db
      .prepare('SELECT COUNT(*) as count FROM news WHERE category_id = ?')
      .bind(id)
      .first<{ count: number }>();

    if (articleCount && articleCount.count > 0) {
      return { success: false, error: `Cannot delete category with ${articleCount.count} existing articles` };
    }

    const result = await this.db
      .prepare('DELETE FROM categories WHERE id = ?')
      .bind(id)
      .run();

    return { success: result.meta.changes > 0 };
  }
}
