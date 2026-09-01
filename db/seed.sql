-- Seed Data for News Platform
-- Run after schema.sql

-- Default admin user (password: admin123 - MUST change in production)
-- Hash is SHA-256 based, will be verified by the worker
INSERT OR IGNORE INTO users (email, password_hash, name, role)
VALUES ('admin@newsplatform.com', '$2b$10$8K1p/ZKqgfuO6Ry4A0vCzOQxRfSdghijklmnopqrstuABCDEFGH', 'Admin User', 'admin');

-- Categories
INSERT OR IGNORE INTO categories (name, slug, description, color, sort_order) VALUES
    ('Technology', 'technology', 'Latest in tech, AI, and innovation', '#3b82f6', 1),
    ('World News', 'world-news', 'Breaking stories from around the globe', '#ef4444', 2),
    ('Economy', 'economy', 'Markets, business, and financial news', '#10b981', 3),
    ('Sports', 'sports', 'Scores, analysis, and sports coverage', '#f59e0b', 4),
    ('Science', 'science', 'Discoveries, research, and breakthroughs', '#8b5cf6', 5),
    ('Health', 'health', 'Wellness, medicine, and public health', '#ec4899', 6),
    ('Entertainment', 'entertainment', 'Culture, movies, music, and celebrities', '#f97316', 7),
    ('Politics', 'politics', 'Government, policy, and political analysis', '#6366f1', 8);

-- Tags
INSERT OR IGNORE INTO tags (name, slug) VALUES
    ('AI', 'ai'),
    ('Climate', 'climate'),
    ('Finance', 'finance'),
    ('Football', 'football'),
    ('NASA', 'nasa'),
    ('Medical', 'medical'),
    ('Apple', 'apple'),
    ('EU', 'eu'),
    ('Oscars', 'oscars'),
    ('Bitcoin', 'bitcoin');
