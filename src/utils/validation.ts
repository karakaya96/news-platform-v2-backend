import { z } from 'zod';

function generateSlug(title: string): string {
  const turkishMap: Record<string, string> = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
  };
  return title
    .toLowerCase()
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => turkishMap[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const createNewsSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  slug: z.string().optional().transform((val) => val || undefined),
  excerpt: z.string().max(1000).optional(),
  content: z.string().min(1, 'Content is required'),
  image_url: z.string().url().optional().or(z.literal('')).or(z.null()).transform((val) => val || null),
  image_alt: z.string().max(255).optional(),
  category_id: z.number().int().positive('Category is required'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  is_featured: z.boolean().default(false),
  is_breaking: z.boolean().default(false),
  seo_title: z.string().max(255).optional(),
  seo_description: z.string().max(500).optional(),
  seo_keywords: z.string().max(500).optional(),
  published_at: z.string().optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

export const updateNewsSchema = createNewsSchema.partial();

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  slug: z.string().optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color').default('#6366f1'),
  sort_order: z.number().int().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

export { generateSlug };
