import { eq } from 'drizzle-orm';
import { settings } from '../db/schema';
import type { Db } from '../db';

export interface SettingsMap {
  [key: string]: string;
}

const DEFAULT_SETTINGS: Record<string, { value: string; category: string }> = {
  // General
  'site_name': { value: 'News Platform', category: 'general' },
  'site_description': { value: 'Haber platformu', category: 'general' },
  'site_url': { value: 'https://newshaberglobal.com', category: 'general' },
  'site_logo': { value: '', category: 'general' },
  'site_favicon': { value: '', category: 'general' },
  'site_language': { value: 'tr', category: 'general' },

  // SEO
  'seo_title': { value: 'News Platform - Gündem, Teknoloji, Ekonomi', category: 'seo' },
  'seo_description': { value: 'Son dakika haberleri, gündem, teknoloji, ekonomi ve daha fazlası.', category: 'seo' },
  'seo_keywords': { value: 'haber, gündem, son dakika, türkiye', category: 'seo' },
  'seo_og_image': { value: '', category: 'seo' },

  // Social Media
  'social_twitter': { value: '', category: 'social' },
  'social_facebook': { value: '', category: 'social' },
  'social_instagram': { value: '', category: 'social' },
  'social_youtube': { value: '', category: 'social' },
  'social_telegram': { value: '', category: 'social' },

  // Email
  'email_from_name': { value: 'News Platform', category: 'email' },
  'email_from_address': { value: 'noreply@newshaberglobal.com', category: 'email' },
  'email_reply_to': { value: '', category: 'email' },

  // Comments
  'comments_enabled': { value: 'true', category: 'comments' },
  'comments_moderation': { value: 'true', category: 'comments' },
  'comments_max_length': { value: '1000', category: 'comments' },

  // Notifications
  'notifications_enabled': { value: 'true', category: 'notifications' },
  'notifications_email_enabled': { value: 'false', category: 'notifications' },
};

export class SettingsService {
  constructor(private db: Db) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.db.select().from(settings);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    // Fill in defaults for missing keys
    for (const [key, config] of Object.entries(DEFAULT_SETTINGS)) {
      if (!(key in result)) {
        result[key] = config.value;
      }
    }
    return result;
  }

  async getByCategory(category: string): Promise<Record<string, string>> {
    const rows = await this.db.select().from(settings).where(eq(settings.category, category));
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    // Fill in defaults
    for (const [key, config] of Object.entries(DEFAULT_SETTINGS)) {
      if (config.category === category && !(key in result)) {
        result[key] = config.value;
      }
    }
    return result;
  }

  async get(key: string): Promise<string | null> {
    const rows = await this.db.select().from(settings).where(eq(settings.key, key));
    if (rows.length > 0) return rows[0].value;
    return DEFAULT_SETTINGS[key]?.value ?? null;
  }

  async set(key: string, value: string, category?: string): Promise<void> {
    const cat = category || DEFAULT_SETTINGS[key]?.category || 'general';
    const now = new Date().toISOString();

    const existing = await this.db.select().from(settings).where(eq(settings.key, key));
    if (existing.length > 0) {
      await this.db.update(settings).set({ value, updatedAt: now }).where(eq(settings.key, key));
    } else {
      await this.db.insert(settings).values({ key, value, category: cat, updatedAt: now });
    }
  }

  async setMultiple(items: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      await this.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(settings).where(eq(settings.key, key));
  }
}
