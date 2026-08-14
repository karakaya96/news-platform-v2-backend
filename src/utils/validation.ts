import { z } from 'zod';

/**
 * Turkish character to ASCII mapping for slug generation
 */
const turkishMap: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  Ç: 'c',
  Ğ: 'g',
  İ: 'i',
  Ö: 'o',
  Ş: 's',
  Ü: 'u',
};

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => turkishMap[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Authentication validation schemas
 */
export const loginSchema = z.object({
  email: z.string().email('Geçersiz e-posta adresi'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
});

export const registerSchema = z.object({
  email: z.string().email('Geçersiz e-posta adresi'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
  name: z.string().min(2, 'İsim en az 2 karakter olmalıdır').max(100),
});

/**
 * News validation schemas
 */
export const createNewsSchema = z.object({
  title: z.string().min(1, 'Başlık zorunludur').max(500),
  slug: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  excerpt: z.string().max(1000).optional(),
  content: z.string().min(1, 'İçerik zorunludur'),
  image_url: z
    .string()
    .url('Geçersiz URL formatı')
    .optional()
    .or(z.literal(''))
    .or(z.null())
    .transform((val) => val || null),
  image_alt: z.string().max(255).optional(),
  category_id: z.number().int().positive('Kategori seçilmelidir'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  is_featured: z.boolean().default(false),
  is_breaking: z.boolean().default(false),
  seo_title: z.string().max(255).optional(),
  seo_description: z.string().max(500).optional(),
  seo_keywords: z.string().max(500).optional(),
  published_at: z.string().datetime().optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

export const updateNewsSchema = createNewsSchema.partial();

/**
 * Preview news validation schema (for scraped/previewed news)
 */
export const previewNewsSchema = z.object({
  title: z.string().min(1, 'Başlık zorunludur').max(500),
  slug: z
    .string()
    .optional()
    .transform((val) => val || undefined),
  excerpt: z.string().max(1000).optional(),
  content: z.string().min(1, 'İçerik zorunludur'),
  image_url: z
    .string()
    .url('Geçersiz URL formatı')
    .optional()
    .or(z.literal(''))
    .or(z.null())
    .transform((val) => val || null),
  image_alt: z.string().max(255).optional(),
  category_id: z.number().int().positive('Kategori seçilmelidir'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  is_featured: z.boolean().default(false),
  is_breaking: z.boolean().default(false),
  seo_title: z.string().max(255).optional(),
  seo_description: z.string().max(500).optional(),
  seo_keywords: z.string().max(500).optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

/**
 * Category validation schemas
 */
export const createCategorySchema = z.object({
  name: z.string().min(1, 'İsim zorunludur').max(100),
  slug: z.string().optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Geçersiz hex renk kodu')
    .default('#6366f1'),
  sort_order: z.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

/**
 * Tag validation schemas
 */
export const createTagSchema = z.object({
  name: z.string().min(1, 'İsim zorunludur').max(50),
  slug: z.string().optional(),
});

export const updateTagSchema = createTagSchema.partial();

/**
 * Comment validation schemas
 */
export const createCommentSchema = z.object({
  news_id: z.number().int().positive('Haber ID zorunludur'),
  parent_id: z.number().int().positive().optional().nullable(),
  author_name: z.string().min(1, 'İsim zorunludur').max(100),
  author_email: z.string().email('Geçersiz e-posta adresi'),
  content: z.string().min(1, 'Yorum içeriği zorunludur').max(5000),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
});

export const updateCommentSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
});

/**
 * Subscription validation schemas
 */
export const subscribeSchema = z
  .object({
    type: z.enum(['browser', 'email']),
    endpoint: z.string().url('Geçersiz endpoint URL').optional(),
    p256dh: z.string().optional(),
    auth: z.string().optional(),
    email: z.string().email('Geçersiz e-posta adresi').optional(),
    categories: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'browser') {
        return !!data.endpoint && !!data.p256dh && !!data.auth;
      }
      if (data.type === 'email') {
        return !!data.email;
      }
      return false;
    },
    {
      message:
        'Browser aboneliği için endpoint, p256dh, auth; email aboneliği için email zorunludur',
      path: ['type'],
    }
  );

export const unsubscribeSchema = z.object({
  email: z.string().email('Geçersiz e-posta adresi'),
  token: z.string().optional(),
});

/**
 * Search validation schemas
 */
export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  sortBy: z.enum(['relevance', 'date', 'views']).default('relevance'),
});

export const suggestQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().positive().max(20).default(5),
});

/**
 * Dashboard/Admin validation schemas
 */
export const dashboardQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

/**
 * Cron trigger validation
 */
export const cronTriggerSchema = z.object({
  secret: z.string().min(1),
});
