import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { SubscriptionService } from '../services/subscription.service';
import type { Bindings, CreateSubscriptionDto, SubscriptionWithCategories } from '../types';
import { error, success } from '../utils/response';
import { sanitizeEmail } from '../utils/sanitize';
import { turkeyNowSQL } from '../utils/time';
import { buildConfirmationEmailTemplate } from '../utils/email-templates';

const subscriptionRoutes = new Hono<{ Bindings: Bindings }>();

const subscribeSchema = z.object({
  type: z.enum(['browser', 'email']),
  endpoint: z.string().url().optional(),
  p256dh: z.string().optional(),
  auth: z.string().optional(),
  email: z.string().email().optional(),
  categories: z.array(z.string()).optional(),
});

const _emailUnsubscribeSchema = z.object({
  email: z.string().email(),
  token: z.string().optional(),
});

// ============================================
// PUBLIC ENDPOINTS
// ============================================

// POST /api/subscribe - Subscribe to notifications
subscriptionRoutes.post('/', async (c) => {
  // Check if notifications are enabled
  const notifEnabledRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'")
    .first<{ value: string }>();
  if (notifEnabledRow && notifEnabledRow.value === 'false') {
    return error('Bildirimler devre dışı', 403);
  }

  const body = await c.req.json();
  const parsed = subscribeSchema.safeParse(body);

  if (!parsed.success) {
    return error(parsed.error.issues[0].message, 400);
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
    // Check if email notifications are enabled
    const emailEnabledRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'notifications_email_enabled'")
      .first<{ value: string }>();
    if (emailEnabledRow && emailEnabledRow.value === 'false') {
      return error('E-posta bildirimleri devre dışı', 403);
    }
    const cleanEmail = sanitizeEmail(data.email);
    if (!cleanEmail) {
      return error('Geçersiz e-posta adresi', 400);
    }
    data.email = cleanEmail;
  }

  const service = new SubscriptionService(c.env.DB);

  // Check if email already exists (any status) before creating
  let existingStatus: 'active' | 'inactive' | 'none' = 'none';
  if (data.type === 'email' && data.email) {
    const existing = await c.env.DB.prepare(
      'SELECT is_active FROM subscriptions WHERE type = ? AND email = ? ORDER BY id DESC LIMIT 1'
    )
      .bind('email', data.email.toLowerCase())
      .first<{ is_active: number }>();
    if (existing) {
      existingStatus = existing.is_active === 1 ? 'active' : 'inactive';
    }
  }

  const subscription = await service.createSubscription(data as CreateSubscriptionDto);

  // Determine message and whether to send confirmation email
  let message: string;
  let sendConfirmationEmail = false;

  if (existingStatus === 'active') {
    // Already active — duplicate subscription attempt
    message = 'Bu e-posta adresi zaten abone.';
  } else if (existingStatus === 'inactive') {
    // Was inactive, now reactivated
    message = 'Aboneliğiniz yeniden aktif edildi!';
    sendConfirmationEmail = true;
  } else {
    // Brand new subscription
    message =
      data.type === 'browser'
        ? 'Bildirim aboneliği başarıyla oluşturuldu!'
        : 'E-posta aboneliği başarıyla oluşturuldu!';
    sendConfirmationEmail = true;
  }

  // Send confirmation email for new or reactivated subscriptions
  if (data.type === 'email' && data.email && sendConfirmationEmail) {
    // Read settings for email
    const siteUrlRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'site_url'")
      .first<{ value: string }>();
    const siteNameRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'site_name'")
      .first<{ value: string }>();
    const emailFromNameRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'email_from_name'")
      .first<{ value: string }>();
    const emailFromAddrRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'email_from_address'")
      .first<{ value: string }>();

    const siteUrl = siteUrlRow?.value || 'https://newshaberglobal.vercel.app';
    const siteName = siteNameRow?.value || 'NewsHaberGlobal';
    const fromName = emailFromNameRow?.value || siteName;
    const fromAddress = emailFromAddrRow?.value || 'noreply@newshaberglobal.com';
    const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(data.email)}`;

    // Send confirmation email via Gmail OAuth
    const gmailConfig = {
      clientId: c.env.GMAIL_CLIENT_ID || '',
      clientSecret: c.env.GMAIL_CLIENT_SECRET || '',
      refreshToken: c.env.GMAIL_REFRESH_TOKEN || '',
      fromEmail: c.env.GMAIL_FROM_EMAIL || 'newshaberglobal@gmail.com',
    };

    if (gmailConfig.clientId && gmailConfig.refreshToken) {
      try {
        const { GmailService } = await import('../services/gmail.service');
        const gmailService = new GmailService(gmailConfig);
        const html = buildConfirmationEmailTemplate({
          email: data.email,
          siteUrl,
          siteName,
          categories: data.categories,
          unsubscribeUrl,
        });
        await gmailService.sendEmail({
          to: data.email,
          subject: `✅ ${siteName} Aboneliğiniz Onaylandı`,
          html,
          fromName: siteName,
          replyTo: gmailConfig.fromEmail,
        });
      } catch (err) {
        console.error('Confirmation email error:', err);
      }
    }
  }

  return success(
    {
      message,
      subscription: {
        id: subscription.id,
        type: subscription.type,
        categories: JSON.parse(subscription.categories || '[]'),
      },
    },
    existingStatus === 'active' ? 200 : 201
  );
});

// POST /api/subscribe/unsubscribe - Unsubscribe
subscriptionRoutes.post('/unsubscribe', async (c) => {
  const body = await c.req.json();

  const service = new SubscriptionService(c.env.DB);

  // Browser unsubscribe — permanent delete
  if (body.endpoint) {
    const result = await service.deleteBrowserSubscription(body.endpoint);
    if (result) {
      return success({ message: 'Bildirim aboneliği iptal edildi' });
    }
    return error('Abonelik bulunamadı', 404);
  }

  // Email unsubscribe
  if (body.email) {
    // Check if subscription exists (any status)
    const existing = await c.env.DB.prepare(
      'SELECT is_active FROM subscriptions WHERE type = ? AND email = ? ORDER BY id DESC LIMIT 1'
    )
      .bind('email', body.email.toLowerCase())
      .first<{ is_active: number }>();

    if (!existing) {
      return error('Bu e-posta adresiyle bir abonelik bulunamadı', 404);
    }

    if (existing.is_active === 0) {
      return success({ message: 'Aboneliğiniz zaten iptal edilmiş' });
    }

    const result = await service.unsubscribeByEmail(body.email);
    if (result) {
      return success({ message: 'E-posta aboneliği iptal edildi' });
    }
    return error('Abonelik iptal edilemedi', 500);
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

// GET /api/subscribe/admin/all - Get all subscriptions (active + inactive)
subscriptionRoutes.get('/admin/all', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const type = c.req.query('type');
  const status = c.req.query('status'); // 'active', 'inactive', or 'all'
  const service = new SubscriptionService(c.env.DB);

  let subscriptions: SubscriptionWithCategories[] = [];
  if (type === 'browser' || type === 'email') {
    const all = await service.getAllSubscriptions();
    subscriptions = all.filter((s) => s.type === type);
  } else {
    subscriptions = await service.getAllSubscriptions();
  }

  // Filter by status if specified
  if (status === 'active') {
    subscriptions = subscriptions.filter((s) => s.is_active === 1);
  } else if (status === 'inactive') {
    subscriptions = subscriptions.filter((s) => s.is_active === 0);
  }

  return success(subscriptions);
});

// POST /api/subscribe/admin/:id/activate - Activate a subscription
subscriptionRoutes.post('/admin/:id/activate', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  const result = await c.env.DB.prepare(
    'UPDATE subscriptions SET is_active = 1, updated_at = ? WHERE id = ?'
  )
    .bind(turkeyNowSQL(), id)
    .run();

  if (result.meta.changes > 0) {
    return success({ message: 'Abonelik aktif edildi' });
  }
  return error('Abonelik bulunamadı', 404);
});

// POST /api/subscribe/admin/:id/deactivate - Deactivate a subscription
subscriptionRoutes.post('/admin/:id/deactivate', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  const result = await c.env.DB.prepare(
    'UPDATE subscriptions SET is_active = 0, updated_at = ? WHERE id = ?'
  )
    .bind(turkeyNowSQL(), id)
    .run();

  if (result.meta.changes > 0) {
    return success({ message: 'Abonelik deaktif edildi' });
  }
  return error('Abonelik bulunamadı', 404);
});

// DELETE /api/subscribe/admin/:id - Permanently delete a subscription from DB
subscriptionRoutes.delete('/admin/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  const result = await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();

  if (result.meta.changes > 0) {
    return success({ message: 'Abonelik kalıcı olarak silindi' });
  }
  return error('Abonelik bulunamadı', 404);
});
subscriptionRoutes.get('/admin/notifications', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const limit = Number.parseInt(c.req.query('limit') || '50', 10);
  const service = new SubscriptionService(c.env.DB);
  const notifications = await service.getRecentNotifications(limit);

  return success(notifications);
});

// PUT /api/subscribe/admin/:id/deactivate - Soft delete (deactivate)
subscriptionRoutes.put('/admin/:id/deactivate', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  const service = new SubscriptionService(c.env.DB);
  const result = await service.unsubscribe(id);

  if (result) {
    return success({ message: 'Abonelik deaktif edildi' });
  }
  return error('Abonelik bulunamadı', 404);
});

// DELETE /api/subscribe/admin/notifications/:id - Delete a notification log entry
subscriptionRoutes.delete('/admin/notifications/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = Number.parseInt(c.req.param('id'), 10);
  const service = new SubscriptionService(c.env.DB);
  const result = await service.deleteNotification(id);

  if (result) {
    return success({ message: 'Bildirim silindi' });
  }
  return error('Bildirim bulunamadı', 404);
});

export default subscriptionRoutes;
