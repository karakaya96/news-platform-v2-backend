import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { CommentService } from '../services/comment.service';
import type { Bindings } from '../types';
import { error, paginated, success } from '../utils/response';
import { sanitizeEmail, sanitizeText } from '../utils/sanitize';

const commentRoutes = new Hono<{ Bindings: Bindings }>();

// Validation schemas
const createCommentSchema = z.object({
  author_name: z.string().min(1, 'İsim gerekli').max(100),
  author_email: z.string().email('Geçerli bir e-posta adresi girin').max(255),
  content: z.string().min(1, 'Yorum içeriği gerekli').max(5000),
  parent_id: z.number().int().positive().optional().nullable(),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// GET /api/comments/:newsId - Get approved comments for a news article
commentRoutes.get('/:newsId', async (c) => {
  const newsId = Number.parseInt(c.req.param('newsId'), 10);

  if (Number.isNaN(newsId)) {
    return error('Geçersiz haber ID', 400);
  }

  const service = new CommentService(c.env.DB);

  // Check if news exists
  const news = await c.env.DB.prepare("SELECT id FROM news WHERE id = ? AND status = 'published'")
    .bind(newsId)
    .first();

  if (!news) {
    return error('Haber bulunamadı', 404);
  }

  const comments = await service.getCommentsWithReplies(newsId);
  return success(comments);
});

// POST /api/comments/:newsId - Create a new comment (public)
commentRoutes.post('/:newsId', async (c) => {
  const newsId = Number.parseInt(c.req.param('newsId'), 10);

  if (Number.isNaN(newsId)) {
    return error('Geçersiz haber ID', 400);
  }

  const body = await c.req.json();
  const parsed = createCommentSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
  }

  // Check if news exists and is published
  const news = await c.env.DB.prepare("SELECT id FROM news WHERE id = ? AND status = 'published'")
    .bind(newsId)
    .first();

  if (!news) {
    return error('Haber bulunamadı', 404);
  }

  // If parent_id is set, verify it exists, is approved, and belongs to same news
  if (parsed.data.parent_id) {
    const parent = await c.env.DB.prepare(
      "SELECT id FROM comments WHERE id = ? AND news_id = ? AND status = 'approved'"
    )
      .bind(parsed.data.parent_id, newsId)
      .first();

    if (!parent) {
      return error('Yanıt verilen yorum bulunamadı', 404);
    }
  }

  const sanitizedName = sanitizeText(parsed.data.author_name, 100);
  const sanitizedEmail = sanitizeEmail(parsed.data.author_email);
  const sanitizedContent = sanitizeText(parsed.data.content, 5000);

  if (!sanitizedName) {
    return error('Geçersiz isim', 400);
  }
  if (!sanitizedEmail) {
    return error('Geçersiz e-posta', 400);
  }
  if (!sanitizedContent) {
    return error('Yorum içeriği gerekli', 400);
  }

  const service = new CommentService(c.env.DB);
  const comment = await service.createComment({
    news_id: newsId,
    parent_id: parsed.data.parent_id || null,
    author_name: sanitizedName,
    author_email: sanitizedEmail,
    content: sanitizedContent,
    ip_address: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || null,
    user_agent: c.req.header('User-Agent') || null,
  });

  return success(comment, 201);
});

// ============================================
// ADMIN ENDPOINTS (protected)
// ============================================

// GET /api/comments/admin/all - Get all comments with filtering
commentRoutes.get('/admin/all', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const page = Number.parseInt(c.req.query('page') || '1', 10);
  const limit = Number.parseInt(c.req.query('limit') || '20', 10);
  const status = c.req.query('status');
  const newsId = c.req.query('news_id')
    ? Number.parseInt(c.req.query('news_id') ?? '', 10)
    : undefined;

  const service = new CommentService(c.env.DB);
  const { comments, total } = await service.getAllComments(page, limit, status, newsId);

  return paginated(comments, total, page, limit);
});

// PUT /api/comments/admin/:id/status - Update comment status
commentRoutes.put('/admin/:id/status', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return error('Geçersiz yorum ID', 400);
  }

  const body = await c.req.json();
  const parsed = updateStatusSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
  }

  const service = new CommentService(c.env.DB);
  const comment = await service.updateCommentStatus(id, parsed.data.status);

  if (!comment) {
    return error('Yorum bulunamadı', 404);
  }

  return success(comment);
});

// POST /api/comments/admin/:id/reply - Reply to a comment
commentRoutes.post('/admin/:id/reply', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const parentId = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(parentId)) {
    return error('Geçersiz yorum ID', 400);
  }

  const body = await c.req.json();
  const content = body.content;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return error('Yanıt içeriği gerekli', 400);
  }

  // Get parent comment to find news_id
  const parent = await c.env.DB.prepare('SELECT * FROM comments WHERE id = ?')
    .bind(parentId)
    .first<{ id: number; news_id: number }>();

  if (!parent) {
    return error('Yorum bulunamadı', 404);
  }

  const sanitizedReply = sanitizeText(content.trim(), 5000);
  if (!sanitizedReply) {
    return error('Yanıt içeriği gerekli', 400);
  }

  const service = new CommentService(c.env.DB);
  const reply = await service.replyToComment(
    parentId,
    parent.news_id,
    sanitizedReply,
    sanitizeText(user.name || 'Admin', 100),
    sanitizeEmail(user.email) || 'noreply@newshaberglobal.com'
  );

  return success(reply, 201);
});

// DELETE /api/comments/admin/:id - Delete a comment
commentRoutes.delete('/admin/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  if (Number.isNaN(id)) {
    return error('Geçersiz yorum ID', 400);
  }

  const service = new CommentService(c.env.DB);
  const deleted = await service.deleteComment(id);

  if (!deleted) {
    return error('Yorum bulunamadı', 404);
  }

  return success({ message: 'Yorum silindi' });
});

// PUT /api/comments/admin/bulk/status - Bulk update comment status
commentRoutes.put('/admin/bulk/status', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const body = await c.req.json();
  const parsed = bulkUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
  }

  const service = new CommentService(c.env.DB);
  const updated = await service.bulkUpdateStatus(parsed.data.ids, parsed.data.status);

  return success({ message: `${updated} yorum güncellendi`, updated });
});

// GET /api/comments/admin/pending/count - Get pending comment count
commentRoutes.get('/admin/pending/count', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const service = new CommentService(c.env.DB);
  const count = await service.getPendingCount();

  return success({ count });
});

export default commentRoutes;
