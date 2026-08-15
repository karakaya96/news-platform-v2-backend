import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'author', 'viewer'] }).notNull().default('editor'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  color: text('color').notNull().default('#6366f1'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const news = sqliteTable('news', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt'),
  content: text('content').notNull(),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  status: text('status', { enum: ['draft', 'published', 'archived'] })
    .notNull()
    .default('draft'),
  isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
  isBreaking: integer('is_breaking', { mode: 'boolean' }).notNull().default(false),
  viewCount: integer('view_count').notNull().default(0),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  seoKeywords: text('seo_keywords'),
  publishedAt: text('published_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  categoryIdx: index('news_category_idx').on(table.categoryId),
  statusIdx: index('news_status_idx').on(table.status),
  publishedAtIdx: index('news_published_at_idx').on(table.publishedAt),
  slugIdx: uniqueIndex('news_slug_idx').on(table.slug),
}));

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  createdAt: text('created_at').notNull(),
});

export const newsTags = sqliteTable('news_tags', {
  newsId: integer('news_id')
    .notNull()
    .references(() => news.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.newsId, table.tagId] }),
}));

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  newsId: integer('news_id')
    .notNull()
    .references(() => news.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => comments.id, { onDelete: 'cascade' }),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull(),
  content: text('content').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'spam'] })
    .notNull()
    .default('pending'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  newsIdx: index('comments_news_idx').on(table.newsId),
  parentIdx: index('comments_parent_idx').on(table.parentId),
  statusIdx: index('comments_status_idx').on(table.status),
}));

export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['browser', 'email'] }).notNull(),
  endpoint: text('endpoint'),
  p256dh: text('p256dh'),
  auth: text('auth'),
  email: text('email'),
  categories: text('categories', { mode: 'json' }).notNull().default('[]'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  endpointIdx: uniqueIndex('subscriptions_endpoint_idx').on(table.endpoint),
  emailIdx: uniqueIndex('subscriptions_email_idx').on(table.email),
}));

export const notificationLog = sqliteTable('notification_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subscriptionId: integer('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['browser', 'email'] }).notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  url: text('url'),
  newsId: integer('news_id').references(() => news.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['pending', 'sent', 'failed'] }).notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
}, (table) => ({
  subscriptionIdx: index('notification_log_subscription_idx').on(table.subscriptionId),
  newsIdx: index('notification_log_news_idx').on(table.newsId),
  statusIdx: index('notification_log_status_idx').on(table.status),
}));

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  category: text('category').notNull().default('general'),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  categoryIdx: index('settings_category_idx').on(table.category),
}));

export const mediaFiles = sqliteTable('media_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull().unique(),
  url: text('url').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  alt: text('alt'),
  createdAt: text('created_at').notNull().default(sql`datetime('now')`),
  updatedAt: text('updated_at').notNull().default(sql`datetime('now')`),
}, (table) => ({
  userIdx: index('media_files_user_idx').on(table.userId),
  createdAtIdx: index('media_files_created_at_idx').on(table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type News = typeof news.$inferSelect;
export type NewNews = typeof news.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type NotificationLog = typeof notificationLog.$inferSelect;
export type NewNotificationLog = typeof notificationLog.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type MediaFile = typeof mediaFiles.$inferSelect;
export type NewMediaFile = typeof mediaFiles.$inferInsert;