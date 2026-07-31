import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rate-limit';
import { AuthService } from '../services/auth.service';
import type { Bindings } from '../types';
import { error, success } from '../utils/response';
import { loginSchema } from '../utils/validation';

const authRoutes = new Hono<{ Bindings: Bindings }>();

// POST /api/auth/login
authRoutes.post('/login', createRateLimiter('login'), async (c) => {
  const body = await c.req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
  }

  const service = new AuthService(c.env.DB);
  const result = await service.login(parsed.data.email, parsed.data.password, c.env.JWT_SECRET);

  if (!result) {
    return error('Invalid email or password', 401);
  }

  return success(result);
});

// GET /api/auth/profile - Protected
authRoutes.get('/profile', authMiddleware, async (c) => {
  const user = c.get('user');
  if (!user) {
    return error('Unauthorized', 401);
  }

  const service = new AuthService(c.env.DB);
  const profile = await service.getProfile(user.sub);

  if (!profile) {
    return error('User not found', 404);
  }

  return success(profile);
});

export default authRoutes;
