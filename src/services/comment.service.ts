import type { Comment, CommentWithNews } from '../types';

export class CommentService {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  // Create a new comment (public)
  async createComment(data: {
    news_id: number;
    parent_id?: number | null;
    author_name: string;
    author_email: string;
    content: string;
    ip_address?: string | null;
    user_agent?: string | null;
  }): Promise<Comment> {
    const result = await this.db
      .prepare(`
        INSERT INTO comments (news_id, parent_id, author_name, author_email, content, ip_address, user_agent, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `)
      .bind(
        data.news_id,
        data.parent_id || null,
        data.author_name,
        data.author_email,
        data.content,
        data.ip_address || null,
        data.user_agent || null
      )
      .run();

    const commentId = result.meta.last_row_id;
    const comment = await this.db
      .prepare('SELECT * FROM comments WHERE id = ?')
      .bind(commentId)
      .first<Comment>();

    return comment!;
  }

  // Get approved comments for a news article (public)
  async getCommentsByNewsId(newsId: number): Promise<Comment[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM comments
        WHERE news_id = ? AND status = 'approved'
        ORDER BY created_at ASC
      `)
      .bind(newsId)
      .all<Comment>();

    return result.results || [];
  }

  // Get approved comments with nested replies (public)
  async getCommentsWithReplies(newsId: number): Promise<Comment[]> {
    const result = await this.db
      .prepare(`
        SELECT c.*, 
          COALESCE(reply_counts.count, 0) as reply_count
        FROM comments c
        LEFT JOIN (
          SELECT parent_id, COUNT(*) as count 
          FROM comments 
          WHERE news_id = ? AND status = 'approved' AND parent_id IS NOT NULL
          GROUP BY parent_id
        ) reply_counts ON c.id = reply_counts.parent_id
        WHERE c.news_id = ? AND c.status = 'approved'
        ORDER BY 
          CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END,
          c.parent_id ASC NULLS LAST,
          c.created_at ASC
      `)
      .bind(newsId, newsId)
      .all<Comment>();

    return result.results || [];
  }

  // Get comment count for a news article (public)
  async getCommentCount(newsId: number): Promise<number> {
    const result = await this.db
      .prepare(`
        SELECT COUNT(*) as count FROM comments
        WHERE news_id = ? AND status = 'approved'
      `)
      .bind(newsId)
      .first<{ count: number }>();

    return result?.count || 0;
  }

  // Get all comments (admin)
  async getAllComments(
    page: number = 1,
    limit: number = 20,
    status?: string,
    newsId?: number
  ): Promise<{ comments: CommentWithNews[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      conditions.push('c.status = ?');
      params.push(status);
    }

    if (newsId) {
      conditions.push('c.news_id = ?');
      params.push(newsId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as total FROM comments c ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    const result = await this.db
      .prepare(`
        SELECT c.*, n.title as news_title, n.slug as news_slug
        FROM comments c
        LEFT JOIN news n ON c.news_id = n.id
        ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .bind(...params, limit, offset)
      .all<CommentWithNews>();

    return { comments: result.results || [], total };
  }

  // Update comment status (admin)
  async updateCommentStatus(id: number, status: 'pending' | 'approved' | 'rejected' | 'spam'): Promise<Comment | null> {
    const existing = await this.db
      .prepare('SELECT * FROM comments WHERE id = ?')
      .bind(id)
      .first<Comment>();

    if (!existing) return null;

    await this.db
      .prepare('UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(status, id)
      .run();

    return this.db
      .prepare('SELECT * FROM comments WHERE id = ?')
      .bind(id)
      .first<Comment>();
  }

  // Reply to a comment (admin)
  async replyToComment(
    parentId: number,
    newsId: number,
    content: string,
    authorName: string = 'Admin',
    authorEmail: string = 'admin@newsplatform.com'
  ): Promise<Comment> {
    const result = await this.db
      .prepare(`
        INSERT INTO comments (news_id, parent_id, author_name, author_email, content, status)
        VALUES (?, ?, ?, ?, ?, 'approved')
      `)
      .bind(newsId, parentId, authorName, authorEmail, content)
      .run();

    const commentId = result.meta.last_row_id;
    const comment = await this.db
      .prepare('SELECT * FROM comments WHERE id = ?')
      .bind(commentId)
      .first<Comment>();

    return comment!;
  }

  // Delete a comment (admin)
  async deleteComment(id: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM comments WHERE id = ?')
      .bind(id)
      .run();

    return result.meta.changes > 0;
  }

  // Bulk update status (admin)
  async bulkUpdateStatus(ids: number[], status: string): Promise<number> {
    if (ids.length === 0) return 0;

    const placeholders = ids.map(() => '?').join(',');
    const result = await this.db
      .prepare(`UPDATE comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`)
      .bind(status, ...ids)
      .run();

    return result.meta.changes;
  }

  // Get pending comment count (admin dashboard)
  async getPendingCount(): Promise<number> {
    const result = await this.db
      .prepare("SELECT COUNT(*) as count FROM comments WHERE status = 'pending'")
      .first<{ count: number }>();

    return result?.count || 0;
  }
}
