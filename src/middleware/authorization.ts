import type { Context, Next } from 'hono';
import type { Bindings, JwtPayload } from '../types';
import { error } from '../utils/response';

export type UserRole = 'admin' | 'editor' | 'author' | 'viewer';

// Role hierarchy: admin > editor > author > viewer
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  editor: 3,
  author: 2,
  viewer: 1,
};

export function hasRole(userRole: string, required: UserRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as UserRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[required] || 0;
  return userLevel >= requiredLevel;
}

export function requireRole(...roles: UserRole[]) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const user = c.get('user') as JwtPayload | undefined;
    if (!user) {
      return error('Unauthorized', 401);
    }
    if (!roles.includes(user.role as UserRole)) {
      return error('Insufficient permissions', 403);
    }
    await next();
  };
}

// Middleware: require admin only
export const requireAdmin = requireRole('admin');

// Middleware: require editor or above (admin + editor)
export const requireEditor = requireRole('admin', 'editor');

// Middleware: require author or above (admin + editor + author)
export const requireAuthor = requireRole('admin', 'editor', 'author');

// Helper: check if user can manage news
export function canManageNews(role: string): boolean {
  return ['admin', 'editor'].includes(role);
}

// Helper: check if user can create news
export function canCreateNews(role: string): boolean {
  return ['admin', 'editor', 'author'].includes(role);
}

// Helper: check if user can edit a specific news article
export function canEditNews(role: string, authorId: number, userId: number): boolean {
  if (role === 'admin' || role === 'editor') return true;
  if (role === 'author' && authorId === userId) return true;
  return false;
}

// Helper: check if user can delete news
export function canDeleteNews(role: string, authorId?: number, userId?: number): boolean {
  if (role === 'admin' || role === 'editor') return true;
  if (role === 'author' && authorId !== undefined && userId !== undefined && authorId === userId) return true;
  return false;
}

// Helper: check if user can manage categories
export function canManageCategories(role: string): boolean {
  return ['admin', 'editor'].includes(role);
}

// Helper: check if user can moderate comments
export function canModerateComments(role: string): boolean {
  return ['admin', 'editor'].includes(role);
}

// Helper: check if user can manage users
export function canManageUsers(role: string): boolean {
  return role === 'admin';
}

// Helper: check if user can manage settings
export function canManageSettings(role: string): boolean {
  return role === 'admin';
}

// Helper: check if user can view admin panel
export function canAccessAdmin(role: string): boolean {
  return ['admin', 'editor', 'author', 'viewer'].includes(role);
}
