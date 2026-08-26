import { Hono } from 'hono';
import { createDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { SettingsService } from '../services/settings.service';
import { success, error } from '../utils/response';
import type { Bindings } from '../types';

const settingsRoutes = new Hono<{ Bindings: Bindings }>();

// Get public settings (no auth required - for frontend)
// IMPORTANT: This must be before /:category to avoid matching "public" as a category
settingsRoutes.get('/public/all', async (c) => {
  try {
    const db = createDb(c.env.DB);
    const service = new SettingsService(db);
    const all = await service.getAll();
    const publicKeys = [
      'site_name', 'site_description', 'site_url', 'site_logo', 'site_favicon',
      'site_language', 'site_timezone', 'seo_title', 'seo_description', 'seo_keywords', 'seo_og_image',
      'social_twitter', 'social_facebook', 'social_instagram', 'social_youtube', 'social_telegram',
      'email_from_name', 'email_from_address', 'email_reply_to',
      'comments_enabled', 'comments_max_length', 'notifications_enabled', 'notifications_email_enabled',
    ];
    const publicSettings: Record<string, string> = {};
    for (const key of publicKeys) {
      if (key in all) publicSettings[key] = all[key];
    }
    return success(publicSettings);
  } catch (e: any) {
    return error(e?.message || 'Ayarlar alınamadı', 500);
  }
});

// Get all settings (admin only)
settingsRoutes.get('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { role?: string } | undefined;
    if (!user || user.role !== 'admin') {
      return error('Admin access required', 403);
    }
    const db = createDb(c.env.DB);
    const service = new SettingsService(db);
    const settings = await service.getAll();
    return success(settings);
  } catch (e: any) {
    return error(e?.message || 'Ayarlar alınamadı', 500);
  }
});

// Get settings by category (admin)
settingsRoutes.get('/:category', authMiddleware, async (c) => {
  try {
    const category = c.req.param('category');
    const db = createDb(c.env.DB);
    const service = new SettingsService(db);
    const settings = await service.getByCategory(category);
    return success(settings);
  } catch (e) {
    return error('Ayarlar alınamadı', 500);
  }
});

// Update settings (admin only)
settingsRoutes.put('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { role?: string } | undefined;
    if (!user || user.role !== 'admin') {
      return error('Admin access required', 403);
    }
    const body = await c.req.json();
    const db = createDb(c.env.DB);
    const service = new SettingsService(db);
    await service.setMultiple(body);
    return success({ message: 'Ayarlar güncellendi' });
  } catch (e: any) {
    return error(e?.message || 'Ayarlar güncellenemedi', 500);
  }
});

// Update single setting (admin only)
settingsRoutes.put('/:key', authMiddleware, async (c) => {
  try {
    const user = c.get('user') as { role?: string } | undefined;
    if (!user || user.role !== 'admin') {
      return error('Admin access required', 403);
    }
    const key = c.req.param('key');
    const body = await c.req.json();
    const db = createDb(c.env.DB);
    const service = new SettingsService(db);
    await service.set(key, body.value);
    return success({ message: 'Ayar güncellendi' });
  } catch (e) {
    return error('Ayar güncellenemedi', 500);
  }
});

export default settingsRoutes;
