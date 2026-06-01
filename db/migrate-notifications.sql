-- Notification & Subscription System Migration
-- Run: wrangler d1 execute news-platform-db --file=./db/migrate-notifications.sql

-- Subscriptions table (browser push + email)
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('browser', 'email')),
    endpoint TEXT,                    -- Web Push endpoint (browser)
    p256dh TEXT,                     -- Web Push p256dh key (browser)
    auth TEXT,                       -- Web Push auth key (browser)
    email TEXT,                      -- Email address (email type)
    categories TEXT DEFAULT '[]',    -- JSON array of category slugs
    is_active INTEGER NOT NULL DEFAULT 1,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notification log (sent notifications)
CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('browser', 'email')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    url TEXT,
    news_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_type ON subscriptions(type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active ON subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_notification_log_news ON notification_log(news_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status);
