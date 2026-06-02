import type { Subscription, SubscriptionWithCategories, CreateSubscriptionDto, NotificationLog } from '../types';

export class SubscriptionService {
  constructor(private db: D1Database) {}

  // Create a new subscription
  async createSubscription(data: CreateSubscriptionDto): Promise<Subscription> {
    const categories = JSON.stringify(data.categories || []);

    // Check for duplicate
    if (data.type === 'browser' && data.endpoint) {
      const existing = await this.db
        .prepare('SELECT id FROM subscriptions WHERE type = ? AND endpoint = ? AND is_active = 1')
        .bind('browser', data.endpoint)
        .first();
      if (existing) {
        // Update categories instead of creating new
        await this.db
          .prepare('UPDATE subscriptions SET categories = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(categories, existing.id)
          .run();
        return this.getSubscriptionById(existing.id) as Promise<Subscription>;
      }
    }

    if (data.type === 'email' && data.email) {
      // Check for ANY existing subscription (active or inactive)
      const existing = await this.db
        .prepare('SELECT id, is_active FROM subscriptions WHERE type = ? AND email = ? ORDER BY id DESC LIMIT 1')
        .bind('email', data.email.toLowerCase())
        .first<{ id: number; is_active: number }>();
      if (existing) {
        // Reactivate if inactive, update categories
        await this.db
          .prepare('UPDATE subscriptions SET categories = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(categories, existing.id)
          .run();
        return this.getSubscriptionById(existing.id) as Promise<Subscription>;
      }
    }

    const result = await this.db
      .prepare(`
        INSERT INTO subscriptions (type, endpoint, p256dh, auth, email, categories)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        data.type,
        data.endpoint || null,
        data.p256dh || null,
        data.auth || null,
        data.type === 'email' && data.email ? data.email.toLowerCase() : null,
        categories
      )
      .run();

    return this.getSubscriptionById(result.meta.last_row_id) as Promise<Subscription>;
  }

  async getSubscriptionById(id: number): Promise<Subscription | null> {
    return this.db
      .prepare('SELECT * FROM subscriptions WHERE id = ?')
      .bind(id)
      .first<Subscription>();
  }

  // Get active subscriptions for a specific category
  async getActiveSubscriptionsByCategory(categorySlug: string): Promise<SubscriptionWithCategories[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM subscriptions 
        WHERE is_active = 1 
        AND (categories = '[]' OR categories LIKE ?)
      `)
      .bind(`%${categorySlug}%`)
      .all<Subscription>();

    return (result.results || []).map((s) => ({
      ...s,
      categories: JSON.parse(s.categories || '[]'),
    }));
  }

  // Get all active subscriptions
  async getAllActiveSubscriptions(): Promise<SubscriptionWithCategories[]> {
    const result = await this.db
      .prepare('SELECT * FROM subscriptions WHERE is_active = 1 ORDER BY created_at DESC')
      .all<Subscription>();

    return (result.results || []).map((s) => ({
      ...s,
      categories: JSON.parse(s.categories || '[]'),
    }));
  }

  // Unsubscribe (deactivate)
  async unsubscribe(id: number): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE subscriptions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(id)
      .run();
    return result.meta.changes > 0;
  }

  // Unsubscribe by email (for email unsubscribe link)
  // Also reactivates if already inactive (idempotent)
  async unsubscribeByEmail(email: string): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE subscriptions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE type = ? AND email = ? AND is_active = 1')
      .bind('email', email.toLowerCase())
      .run();
    return result.meta.changes > 0;
  }

  // Deactivate browser subscription by endpoint
  async deactivateBrowserSubscription(endpoint: string): Promise<boolean> {
    const result = await this.db
      .prepare('UPDATE subscriptions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE type = ? AND endpoint = ?')
      .bind('browser', endpoint)
      .run();
    return result.meta.changes > 0;
  }

  // Get subscription stats (admin)
  async getStats(): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    browserSubscriptions: number;
    emailSubscriptions: number;
    notificationsSent: number;
  }> {
    const total = await this.db.prepare('SELECT COUNT(*) as count FROM subscriptions').first<{ count: number }>();
    const active = await this.db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE is_active = 1').first<{ count: number }>();
    const browser = await this.db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE type = 'browser' AND is_active = 1").first<{ count: number }>();
    const email = await this.db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE type = 'email' AND is_active = 1").first<{ count: number }>();
    const sent = await this.db.prepare("SELECT COUNT(*) as count FROM notification_log WHERE status = 'sent'").first<{ count: number }>();

    return {
      totalSubscriptions: total?.count || 0,
      activeSubscriptions: active?.count || 0,
      browserSubscriptions: browser?.count || 0,
      emailSubscriptions: email?.count || 0,
      notificationsSent: sent?.count || 0,
    };
  }

  // Notification log methods
  async createNotificationLog(data: {
    subscription_id: number | null;
    type: 'browser' | 'email';
    title: string;
    body: string;
    url?: string;
    news_id?: number;
  }): Promise<number> {
    const result = await this.db
      .prepare(`
        INSERT INTO notification_log (subscription_id, type, title, body, url, news_id, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `)
      .bind(
        data.subscription_id,
        data.type,
        data.title,
        data.body,
        data.url || null,
        data.news_id || null
      )
      .run();
    return result.meta.last_row_id;
  }

  async updateNotificationStatus(id: number, status: 'sent' | 'failed', errorMessage?: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE notification_log 
        SET status = ?, error_message = ?, sent_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .bind(status, errorMessage || null, id)
      .run();
  }

  // Get pending notifications
  async getPendingNotifications(): Promise<NotificationLog[]> {
    const result = await this.db
      .prepare('SELECT * FROM notification_log WHERE status = ? ORDER BY created_at ASC LIMIT 100')
      .bind('pending')
      .all<NotificationLog>();
    return result.results || [];
  }

  // Get recently sent notifications (admin)
  async getRecentNotifications(limit: number = 50): Promise<NotificationLog[]> {
    const result = await this.db
      .prepare('SELECT * FROM notification_log ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all<NotificationLog>();
    return result.results || [];
  }
}
