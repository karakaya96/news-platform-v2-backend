-- Migration: Add author and viewer roles to users table
-- This is safe because SQLite doesn't enforce CHECK constraints on ALTER COLUMN

-- First, update any existing users with invalid roles to 'editor'
UPDATE users SET role = 'editor' WHERE role NOT IN ('admin', 'editor', 'author', 'viewer');

-- Add indexes for user management queries (if not exists)
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
