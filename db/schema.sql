-- News Platform D1 Schema
-- Run: wrangler d1 execute news-platform-db --local --file=./db/schema.sql

-- Users table (admin accounts)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Admin',
    role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin', 'editor')),
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- News articles table
CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT NOT NULL,
    image_url TEXT,
    image_alt TEXT,
    category_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'archived')),
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_breaking INTEGER NOT NULL DEFAULT 0,
    view_count INTEGER NOT NULL DEFAULT 0,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Tags table (optional but useful)
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);

-- News-Tags junction table
CREATE TABLE IF NOT EXISTS news_tags (
    news_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (news_id, tag_id),
    FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(
    title,
    excerpt,
    content,
    content=news,
    content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS news_ai AFTER INSERT ON news BEGIN
    INSERT INTO news_fts(rowid, title, excerpt, content)
    VALUES (new.id, new.title, new.excerpt, new.content);
END;

CREATE TRIGGER IF NOT EXISTS news_ad AFTER DELETE ON news BEGIN
    INSERT INTO news_fts(news_fts, rowid, title, excerpt, content)
    VALUES ('delete', old.id, old.title, old.excerpt, old.content);
END;

CREATE TRIGGER IF NOT EXISTS news_au AFTER UPDATE ON news BEGIN
    INSERT INTO news_fts(news_fts, rowid, title, excerpt, content)
    VALUES ('delete', old.id, old.title, old.excerpt, old.content);
    INSERT INTO news_fts(rowid, title, excerpt, content)
    VALUES (new.id, new.title, new.excerpt, new.content);
END;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);
CREATE INDEX IF NOT EXISTS idx_news_status ON news(status);
CREATE INDEX IF NOT EXISTS idx_news_category ON news(category_id);
CREATE INDEX IF NOT EXISTS idx_news_featured ON news(is_featured);
CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created ON news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
