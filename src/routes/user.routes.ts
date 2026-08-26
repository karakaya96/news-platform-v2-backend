import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { UserService } from '../services/user.service';
import type { Bindings } from '../types';
import { error, success } from '../utils/response';

const userRoutes = new Hono<{ Bindings: Bindings }>();

// All routes require auth
userRoutes.use('*', authMiddleware);

// Admin-only check helper
function requireAdmin(c: { get: (key: string) => unknown; json: (body: unknown, status?: number) => Response }) {
  const user = c.get('user') as { role?: string } | undefined;
  if (!user || user.role !== 'admin') {
    return error('Admin access required', 403);
  }
  return null;
}

// GET /api/users - List all users (admin only)
userRoutes.get('/', async (c) => {
  const adminErr = requireAdmin(c);
  if (adminErr) return adminErr;

  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search') || undefined;

  const service = new UserService(c.env.DB);
  const result = await service.list(page, limit, search);

  return success({
    users: result.users,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  });
});

// GET /api/users/stats - User stats (admin only)
userRoutes.get('/stats', async (c) => {
  const adminErr = requireAdmin(c);
  if (adminErr) return adminErr;

  const service = new UserService(c.env.DB);
  const stats = await service.getStats();
  return success(stats);
});

// GET /api/users/:id - Get user by ID (admin or self)
userRoutes.get('/:id', async (c) => {
  const user = c.get('user') as { sub?: number; role?: string } | undefined;
  const id = Number(c.req.param('id'));

  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin' && user.sub !== id) {
    return error('Access denied', 403);
  }

  const service = new UserService(c.env.DB);
  const found = await service.getById(id);
  if (!found) return error('User not found', 404);

  return success(found);
});

// POST /api/users - Create user (admin only)
userRoutes.post('/', async (c) => {
  const adminErr = requireAdmin(c);
  if (adminErr) return adminErr;

  const body = await c.req.json();
  const { email, password, name, role, avatar_url } = body;

  if (!email || !password || !name) {
    return error('Email, password, and name are required', 400);
  }
  if (password.length < 6) {
    return error('Password must be at least 6 characters', 400);
  }
  if (role && !['admin', 'editor', 'author', 'viewer'].includes(role)) {
    return error('Invalid role', 400);
  }

  const service = new UserService(c.env.DB);

  const existing = await service.getByEmail(email);
  if (existing) {
    return error('Email already in use', 409);
  }

  try {
    const newUser = await service.create({ email, password, name, role, avatar_url });
    return success(newUser, 201);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Failed to create user', 500);
  }
});

// PUT /api/users/profile/update - Update own profile (any authed user)
// IMPORTANT: This must be before /:id to avoid matching "profile" as an id
userRoutes.put('/profile/update', async (c) => {
  const user = c.get('user') as { sub?: number } | undefined;
  if (!user) return error('Unauthorized', 401);

  const body = await c.req.json();
  const { name, avatar_url, current_password, new_password } = body;

  const service = new UserService(c.env.DB);
  try {
    const updated = await service.updateProfile(user.sub!, { name, avatar_url, current_password, new_password });
    return success(updated);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Failed to update profile', 500);
  }
});

// PUT /api/users/:id - Update user (admin only)
userRoutes.put('/:id', async (c) => {
  const adminErr = requireAdmin(c);
  if (adminErr) return adminErr;

  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const { email, name, role, avatar_url, password } = body;

  if (role && !['admin', 'editor', 'author', 'viewer'].includes(role)) {
    return error('Invalid role', 400);
  }

  const service = new UserService(c.env.DB);

  // Check email uniqueness
  if (email) {
    const existing = await service.getByEmail(email);
    if (existing && existing.id !== id) {
      return error('Email already in use', 409);
    }
  }

  try {
    const updated = await service.update(id, { email, name, role, avatar_url, password });
    return success(updated);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Failed to update user', 500);
  }
});

// DELETE /api/users/:id - Delete user (admin only)
userRoutes.delete('/:id', async (c) => {
  const adminErr = requireAdmin(c);
  if (adminErr) return adminErr;

  const id = Number(c.req.param('id'));
  const currentUser = c.get('user') as { sub?: number } | undefined;

  if (currentUser?.sub === id) {
    return error('Cannot delete yourself', 400);
  }

  const service = new UserService(c.env.DB);
  const deleted = await service.delete(id);
  if (!deleted) return error('User not found', 404);

  return success({ message: 'User deleted' });
});

// PUT /api/users/profile/update - Update own profile (any authed user)
userRoutes.put('/profile/update', async (c) => {
  const user = c.get('user') as { sub?: number } | undefined;
  if (!user) return error('Unauthorized', 401);

  const body = await c.req.json();
  const { name, avatar_url, current_password, new_password } = body;

  const service = new UserService(c.env.DB);
  try {
    const updated = await service.updateProfile(user.sub!, { name, avatar_url, current_password, new_password });
    return success(updated);
  } catch (err) {
    return error(err instanceof Error ? err.message : 'Failed to update profile', 500);
  }
});

export default userRoutes;
