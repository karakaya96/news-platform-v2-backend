-- Migration: Create FTS5 virtual table and populate with existing data
-- Run: wrangler d1 execute news-platform-db --remote --file=./db/migrate-fts.sql

-- Drop if exists (for idempotency)
DROP TABLE IF EXISTS news_fts;

-- Create FTS5 virtual table
CREATE VIRTUAL TABLE news_fts USING fts5(
    title,
    excerpt,
    content,
    content=news,
    content_rowid=id
);

-- Populate FTS table with existing published news
INSERT INTO news_fts(rowid, title, excerpt, content)
SELECT id, title, excerpt, content FROM news WHERE status = 'published';

-- Triggers to keep FTS in sync
CREATE TRIGGER news_ai AFTER INSERT ON news BEGIN
    INSERT INTO news_fts(rowid, title, excerpt, content)
    VALUES (new.id, new.title, new.excerpt, new.content);
END;

CREATE TRIGGER news_ad AFTER DELETE ON news BEGIN
    INSERT INTO news_fts(news_fts, rowid, title, excerpt, content)
    VALUES ('delete', old.id, old.title, old.excerpt, old.content);
END;

CREATE TRIGGER news_au AFTER UPDATE ON news BEGIN
    INSERT INTO news_fts(news_fts, rowid, title, excerpt, content)
    VALUES ('delete', old.id, old.title, old.excerpt, old.content);
    INSERT INTO news_fts(rowid, title, excerpt, content)
    VALUES (new.id, new.title, new.excerpt, new.content);
END;
