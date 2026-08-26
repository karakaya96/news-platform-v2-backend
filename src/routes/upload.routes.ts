import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { canCreateNews } from '../middleware/authorization';
import { MediaService } from '../services/media.service';
import type { Bindings } from '../types';
import { error, success } from '../utils/response';

const uploadRoutes = new Hono<{ Bindings: Bindings }>();

function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// POST /api/upload - Admin/Editor/Author, accepts multipart form data
uploadRoutes.post('/', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user || !canCreateNews(user.role)) {
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

  // Safe extension: only allow known image extensions (prevent path traversal)
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const ext = allowedExts.includes(rawExt) ? rawExt : 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = `uploads/${fileName}`;

  const arrayBuffer = await file.arrayBuffer();
  await c.env.R2.put(filePath, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  const publicUrl = `${getBaseUrl(c)}/api/media/${filePath}`;

  // Save to database
  const mediaService = new MediaService(c.env);
  await mediaService.create({
    userId: user.sub,
    key: filePath,
    url: publicUrl,
    mimeType: file.type,
    size: file.size,
    alt: file.name,
  });

  return success({ url: publicUrl, key: filePath }, 201);
});

// POST /api/upload/avatar - Any authed user, upload profile avatar
uploadRoutes.post('/avatar', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return error('Unauthorized', 401);
  }

  if (!c.env.R2) {
    return error('R2 storage not configured', 503);
  }

  const formData = await c.req.formData();
  const file = formData.get('file') as unknown as File | null;

  if (!file) {
    return error('No file provided', 400);
  }

  const maxSize = 2 * 1024 * 1024; // 2MB for avatars
  if (file.size > maxSize) {
    return error('Avatar size exceeds 2MB limit', 400);
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return error('Invalid file type. Allowed: JPEG, PNG, WebP', 400);
  }

  // Safe extension: only allow known image extensions (prevent path traversal)
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
  const rawExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const ext = allowedExts.includes(rawExt) ? rawExt : 'jpg';
  const fileName = `avatar-${user.sub}-${Date.now()}.${ext}`;
  const filePath = `avatars/${fileName}`;

  const arrayBuffer = await file.arrayBuffer();
  await c.env.R2.put(filePath, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=31536000',
    },
  });

  const publicUrl = `${getBaseUrl(c)}/api/media/${filePath}`;

  // Save to database
  try {
    const mediaService = new MediaService(c.env);
    await mediaService.create({
      userId: user.sub,
      key: filePath,
      url: publicUrl,
      mimeType: file.type,
      size: file.size,
      alt: file.name,
    });
  } catch (dbErr) {
    console.error('Media DB save error:', dbErr);
    return error('Failed to save media record', 500);
  }

  return success({ url: publicUrl }, 201);
});

export default uploadRoutes;
