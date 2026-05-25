import { Context, Next } from 'hono';
import { verifyToken } from '../utils/auth';
import { error } from '../utils/response';
import type { JwtPayload, Bindings } from '../types';

declare module 'hono' {
  interface ContextVariableMap {
    user?: JwtPayload;
  }
}

export async function authMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error('Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return error('Invalid or expired token', 401);
  }

  c.set('user', payload);
  await next();
}

export async function optionalAuthMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    if (payload) {
      c.set('user', payload);
    }
  }
  await next();
}
