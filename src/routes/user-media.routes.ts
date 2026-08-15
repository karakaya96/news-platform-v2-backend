import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { MediaService } from '../services/media.service';
import type { Bindings } from '../types';
import { error, success, paginated } from '../utils/response';

const userMediaRoutes = new Hono<{ Bindings: Bindings }>();

userMediaRoutes.use('*', authMiddleware);

userMediaRoutes.get('/', async (c) => {
  const user = c.get('user') as { sub: number } | undefined;
  if (!user) return error('Unauthorized', 401);

  const page = Number(c.req.query('page') || '1');
  const limit = Math.min(Number(c.req.query('limit') || '20'), 100);

  const service = new MediaService(c.env);
  const result = await service.getByUser(user.sub, page, limit);

  return success({ files: result.files, pagination: result.pagination });
});

userMediaRoutes.delete('/', async (c) => {
  const user = c.get('user') as { sub: number } | undefined;
  if (!user) return error('Unauthorized', 401);

  const key = c.req.query('key');

  if (!key || key.includes('..')) {
    return error('Invalid key', 400);
  }

  const service = new MediaService(c.env);
  const deleted = await service.deleteByKey(user.sub, key);

  if (!deleted) {
    return error('File not found or access denied', 404);
  }

  return success({ message: 'File deleted successfully' });
});

userMediaRoutes.post('/bulk-delete', async (c) => {
  const user = c.get('user') as { sub: number } | undefined;
  if (!user) return error('Unauthorized', 401);

  const body = await c.req.json();
  const { keys } = body as { keys?: string[] };

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return error('Keys array required', 400);
  }

  if (keys.length > 50) {
    return error('Maximum 50 files per request', 400);
  }

  const service = new MediaService(c.env);
  const deletedCount = await service.deleteMultiple(user.sub, keys);

  return success({ deletedCount, message: `${deletedCount} files deleted` });
});

export default userMediaRoutes;