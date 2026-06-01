export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'editor';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface News {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  image_url: string | null;
  image_alt: string | null;
  category_id: number;
  author_id: number;
  status: 'draft' | 'published' | 'archived';
  is_featured: number;
  is_breaking: number;
  view_count: number;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsWithRelations extends News {
  category_name?: string;
  category_slug?: string;
  category_color?: string;
  author_name?: string;
  tags?: Tag[];
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface NewsTag {
  news_id: number;
  tag_id: number;
}

export interface Comment {
  id: number;
  news_id: number;
  parent_id: number | null;
  author_name: string;
  author_email: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  reply_count?: number;
}

export interface CommentWithNews extends Comment {
  news_title?: string;
  news_slug?: string;
}

export interface CreateCommentDto {
  news_id: number;
  parent_id?: number | null;
  author_name: string;
  author_email: string;
  content: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface JwtPayload {
  sub: number;
  email: string;
  name?: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface CreateNewsDto {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  image_url?: string;
  image_alt?: string;
  category_id: number;
  status?: 'draft' | 'published' | 'archived';
  is_featured?: boolean;
  is_breaking?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  published_at?: string;
  tag_ids?: number[];
}

export interface UpdateNewsDto extends Partial<CreateNewsDto> {
  id: number;
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  color?: string;
  sort_order?: number;
}

export interface UpdateCategoryDto extends Partial<CreateCategoryDto> {
  id: number;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface Bindings {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

// Subscription types
export interface Subscription {
  id: number;
  type: 'browser' | 'email';
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  email: string | null;
  categories: string; // JSON array
  is_active: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionWithCategories extends Omit<Subscription, 'categories'> {
  categories: string[];
}

export interface CreateSubscriptionDto {
  type: 'browser' | 'email';
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  email?: string;
  categories?: string[];
}

export interface NotificationLog {
  id: number;
  subscription_id: number | null;
  type: 'browser' | 'email';
  title: string;
  body: string;
  url: string | null;
  news_id: number | null;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}
