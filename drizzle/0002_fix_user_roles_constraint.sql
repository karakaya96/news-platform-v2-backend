-- Fix: Recreate users table with new role constraints
-- Disable foreign keys temporarily
PRAGMA foreign_keys = OFF;

-- 1. Create new table with correct roles
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK(role IN ('admin', 'editor', 'author', 'viewer')),
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Copy data from old table
INSERT INTO users_new (id, email, password_hash, name, role, avatar_url, created_at, updated_at)
SELECT id, email, password_hash, name, role, avatar_url, created_at, updated_at FROM users;

-- 3. Drop old table
DROP TABLE users;

-- 4. Rename new table
ALTER TABLE users_new RENAME TO users;

-- 5. Recreate indexes
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE INDEX users_role_idx ON users(role);

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;
