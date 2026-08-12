import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware } from '../middleware/auth';
import { SettingsService } from '../services/settings.service';
import { success, error } from '../utils/response';
import type { Bindings } from '../types';

const settingsRoutes = new Hono<{ Bindings: Bindings }>();

// Get all settings (admin)
settingsRoutes.get('/', authMiddleware, async (c) => {
  try {
    const db = createDb(c.env);
    const service = new SettingsService(db);
    const settings = await service.getAll();
    return c.json(success(settings));
  } catch (e) {
    return c.json(error('Ayarlar alınamadı', 500), 500);
  }
});

// Get settings by category (admin)
settingsRoutes.get('/:category', authMiddleware, async (c) => {
  try {
    const category = c.req.param('category');
    const db = createDb(c.env);
    const service = new SettingsService(db);
    const settings = await service.getByCategory(category);
    return c.json(success(settings));
  } catch (e) {
    return c.json(error('Ayarlar alınamadı', 500), 500);
  }
});

// Update settings (admin)
settingsRoutes.put('/', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const db = createDb(c.env);
    const service = new SettingsService(db);
    await service.setMultiple(body);
    return c.json(success({ message: 'Ayarlar güncellendi' }));
  } catch (e) {
    return c.json(error('Ayarlar güncellenemedi', 500), 500);
  }
});

// Update single setting (admin)
settingsRoutes.put('/:key', authMiddleware, async (c) => {
  try {
    const key = c.req.param('key');
    const body = await c.req.json();
    const db = createDb(c.env);
    const service = new SettingsService(db);
    await service.set(key, body.value);
    return c.json(success({ message: 'Ayar güncellendi' }));
  } catch (e) {
    return c.json(error('Ayar güncellenemedi', 500), 500);
  }
});

// Get public settings (no auth required - for frontend)
settingsRoutes.get('/public/all', async (c) => {
  try {
    const db = createDb(c.env);
    const service = new SettingsService(db);
    const all = await service.getAll();
    // Only return public settings
    const publicKeys = [
      'site_name', 'site_description', 'site_url', 'site_logo', 'site_favicon',
      'site_language', 'seo_title', 'seo_description', 'seo_keywords', 'seo_og_image',
      'social_twitter', 'social_facebook', 'social_instagram', 'social_youtube', 'social_telegram',
      'comments_enabled', 'notifications_enabled',
    ];
    const publicSettings: Record<string, string> = {};
    for (const key of publicKeys) {
      if (key in all) publicSettings[key] = all[key];
    }
    return c.json(success(publicSettings));
  } catch (e) {
    return c.json(error('Ayarlar alınamadı', 500), 500);
  }
});

export default settingsRoutes;
