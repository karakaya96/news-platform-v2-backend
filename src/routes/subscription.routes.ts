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

  // Check if email already exists (any status) before creating
  let existingStatus: 'active' | 'inactive' | 'none' = 'none';
  if (data.type === 'email' && data.email) {
    const existing = await c.env.DB
      .prepare('SELECT is_active FROM subscriptions WHERE type = ? AND email = ? ORDER BY id DESC LIMIT 1')
      .bind('email', data.email.toLowerCase())
      .first<{ is_active: number }>();
    if (existing) {
      existingStatus = existing.is_active === 1 ? 'active' : 'inactive';
    }
  }

  const subscription = await service.createSubscription(data as any);

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
    message = data.type === 'browser'
      ? 'Bildirim aboneliği başarıyla oluşturuldu!'
      : 'E-posta aboneliği başarıyla oluşturuldu!';
    sendConfirmationEmail = true;
  }

  // Send confirmation email for new or reactivated subscriptions
  if (data.type === 'email' && data.email && sendConfirmationEmail) {
    const siteUrl = 'https://newshaberglobal.vercel.app';
    const relayUrl = c.env.SMTP_RELAY_URL || '';
    const relaySecret = c.env.SMTP_RELAY_SECRET || '';
    const unsubscribeUrl = `${siteUrl}/subscribe?action=unsubscribe&email=${encodeURIComponent(data.email)}`;

    if (relayUrl) {
      try {
        await fetch(relayUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: relaySecret,
            to: data.email,
            subject: '✅ NewsHaberGlobal Aboneliğiniz Onaylandı',
            html: `
              <!DOCTYPE html>
              <html lang="tr">
              <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
              <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                <table role="presentation" width="100%" style="border-collapse:collapse">
                  <tr><td align="center" style="padding:20px 0">
                    <table role="presentation" width="600" style="border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)">
                      <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;text-align:center">
                        <h1 style="color:#fff;margin:0;font-size:22px">📰 NewsHaberGlobal</h1>
                        <p style="color:rgba(255,255,255,.8);margin:5px 0 0;font-size:13px">Güvenilir Haber Kaynağınız</p>
                      </td></tr>
                      <tr><td style="padding:30px">
                        <h2 style="color:#1e293b;margin:0 0 16px;font-size:20px">Aboneliğiniz Onaylandı! ✅</h2>
                        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">Merhaba,</p>
                        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px">NewsHaberGlobal e-posta bildirim aboneliğiniz başarıyla oluşturuldu. Artık yeni haberler yayınlandığında sizi bilgilendireceğiz.</p>
                        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin-bottom:16px">
                          <p style="color:#475569;font-size:14px;margin:0 0 8px"><strong>📬 E-posta:</strong> ${data.email}</p>
                          <p style="color:#475569;font-size:14px;margin:0"><strong>📂 Kategoriler:</strong> ${data.categories && data.categories.length > 0 ? data.categories.join(', ') : 'Tümü'}</p>
                        </div>
                        <a href="${siteUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:500;margin-bottom:16px">Siteyi Ziyaret Et →</a>
                        <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0">Aboneliğinizi iptal etmek isterseniz aşağıdaki bağlantıyı kullanabilirsiniz.</p>
                      </td></tr>
                      <tr><td style="background:#f8fafc;padding:20px 30px;border-top:1px solid #e2e8f0;text-align:center">
                        <a href="${unsubscribeUrl}" style="color:#ef4444;text-decoration:none;font-size:13px;font-weight:500">✖ Aboneliği İptal Et</a>
                        <p style="color:#94a3b8;font-size:12px;margin:8px 0 0"><a href="${siteUrl}" style="color:#6366f1;text-decoration:none">NewsHaberGlobal</a> © 2026</p>
                      </td></tr>
                    </table>
                  </td></tr>
                </table>
              </body>
              </html>
            `,
          }),
        });
      } catch (err) {
        console.error('Confirmation email error:', err);
      }
    }
  }

  return success({
    message,
    subscription: {
      id: subscription.id,
      type: subscription.type,
      categories: JSON.parse(subscription.categories || '[]'),
    },
  }, existingStatus === 'active' ? 200 : 201);
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
    // Check if subscription exists (any status)
    const existing = await c.env.DB
      .prepare('SELECT is_active FROM subscriptions WHERE type = ? AND email = ? ORDER BY id DESC LIMIT 1')
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

  let subscriptions;
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

  const id = parseInt(c.req.param('id'));
  const result = await c.env.DB
    .prepare('UPDATE subscriptions SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(id)
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

  const id = parseInt(c.req.param('id'));
  const result = await c.env.DB
    .prepare('UPDATE subscriptions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(id)
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

  const id = parseInt(c.req.param('id'));
  const result = await c.env.DB
    .prepare('DELETE FROM subscriptions WHERE id = ?')
    .bind(id)
    .run();

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

// DELETE /api/subscribe/admin/notifications/:id - Delete a notification log entry
subscriptionRoutes.delete('/admin/notifications/:id', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return error('Yetkisiz erişim', 403);
  }

  const id = parseInt(c.req.param('id'));
  const service = new SubscriptionService(c.env.DB);
  const result = await service.deleteNotification(id);

  if (result) {
    return success({ message: 'Bildirim silindi' });
  }
  return error('Bildirim bulunamadı', 404);
});

export default subscriptionRoutes;
