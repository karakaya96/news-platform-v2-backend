import { Hono } from 'hono';
import type { Bindings } from '../types';
import { SubscriptionService } from '../services/subscription.service';
import { authMiddleware } from '../middleware/auth';
import { success, error, paginated } from '../utils/response';
import { z } from 'zod';

const subscriptionRoutes = new Hono<{ Bindings: Bindings }>();

const subscribeSchema = z.object({
  type: z.enum(['browser', 'email']),
  endpoint: z.string().url().optional(),
  p256dh: z.string().optional(),
  auth: z.string().optional(),
  email: z.string().email().optional(),
  categories: z.array(z.string()).optional(),
});

const emailUnsubscribeSchema = z.object({
  email: z.string().email(),
  token: z.string().optional(),
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// POST /api/subscribe - Subscribe to notifications
subscriptionRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.errors[0].message, 400);
  }

  const data = parsed.data;

  // Validate based on type
  if (data.type === 'browser') {
    if (!data.endpoint || !data.p256dh || !data.auth) {
      return error('Bildirim aboneliği için endpoint, p256dh ve auth gerekli', 400);
    }
  } else if (data.type === 'email') {
    if (!data.email) {
      return error('E-posta aboneliği için e-posta adresi gerekli', 400);
    }
  }

  const service = new SubscriptionService(c.env.DB);
  const subscription = await service.createSubscription(data as any);

  return success({
    message: data.type === 'browser' 
      ? 'Bildirim aboneliği başarıyla oluşturuldu!' 
      : 'E-posta aboneliği başarıyla oluşturuldu!',
    subscription: {
      id: subscription.id,
      type: subscription.type,
      categories: JSON.parse(subscription.categories || '[]'),
    },
  }, 201);
});

// POST /api/subscribe/unsubscribe - Unsubscribe
subscriptionRoutes.post('/unsubscribe', async (c) => {
  const body = await c.req.json();

  const service = new SubscriptionService(c.env.DB);

  // Browser unsubscribe
  if (body.endpoint) {
    const result = await service.deactivateBrowserSubscription(body.endpoint);
    if (result) {
      return success({ message: 'Bildirim aboneliği iptal edildi' });
    }
    return error('Abonelik bulunamadı', 404);
  }

  // Email unsubscribe
  if (body.email) {
    const result = await service.unsubscribeByEmail(body.email);
    if (result) {
      return success({ message: 'E-posta aboneliği iptal edildi' });
    }
    return error('Abonelik bulunamadı', 404);
  }

  return error('Endpoint veya e-posta gerekli', 400);
});

// GET /api/subscribe/vapid-public-key - Get VAPID public key for browser push
subscriptionRoutes.get('/vapid-public-key', async (c) => {
  const publicKey = c.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return error('B bildirim sistemi yapılandırılmamış', 503);
  }
  return success({ publicKey });
});

// ============================================
// ADMIN ENDPOINTS (protected)
// ============================================

// GET /api/subscribe/admin/stats - Get subscription stats
subscriptionRoutes.get('/admin/stats', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const service = new SubscriptionService(c.env.DB);
  const stats = await service.getStats();
  return success(stats);
});

// GET /api/subscribe/admin/all - Get all subscriptions
subscriptionRoutes.get('/admin/all', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const type = c.req.query('type');
  const service = new SubscriptionService(c.env.DB);

  let subscriptions;
  if (type === 'browser' || type === 'email') {
    const all = await service.getAllActiveSubscriptions();
    subscriptions = all.filter((s) => s.type === type);
  } else {
    subscriptions = await service.getAllActiveSubscriptions();
  }

  return success(subscriptions);
});

// GET /api/subscribe/admin/notifications - Get notification log
subscriptionRoutes.get('/admin/notifications', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const limit = parseInt(c.req.query('limit') || '50');
  const service = new SubscriptionService(c.env.DB);
  const notifications = await service.getRecentNotifications(limit);

  return success(notifications);
});

// DELETE /api/subscribe/admin/:id - Delete a subscription
subscriptionRoutes.delete('/admin/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = parseInt(c.req.param('id'));
  const service = new SubscriptionService(c.env.DB);
  const result = await service.unsubscribe(id);

  if (result) {
    return success({ message: 'Abonelik silindi' });
  }
  return error('Abonelik bulunamadı', 404);
});

export default subscriptionRoutes;
