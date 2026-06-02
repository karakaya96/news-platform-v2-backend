import { Hono } from 'hono';
import type { Bindings } from '../types';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';

const uploadRoutes = new Hono<{ Bindings: Bindings }>();

// POST /api/upload - Admin only, accepts multipart form data
uploadRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return error('Unauthorized', 403);
  }

  if (!c.env.R2) {
    return error('R2 storage not configured. Enable R2 in Cloudflare Dashboard.', 503);
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as unknown as File | null;

  if (!file) {
    return error('No file provided', 400);
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return error('File size exceeds 10MB limit', 400);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    return error('Invalid file type. Allowed: JPEG, PNG, WebP, GIF', 400);
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = `uploads/${fileName}`;

  const arrayBuffer = await file.arrayBuffer();
  await c.env.R2.put(filePath, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  const publicUrl = `https://news-platform-assets.r2.dev/${filePath}`;

  return success({ url: publicUrl, key: filePath }, 201);
});

export default uploadRoutes;
