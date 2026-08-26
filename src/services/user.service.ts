import type { User } from '../types';
import { hashPassword, verifyPassword } from '../utils/auth';

type SafeUser = Omit<User, 'password_hash'> & {
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export class UserService {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  private sanitize(user: User): SafeUser {
    const { password_hash, ...rest } = user;
    return {
      ...rest,
      avatarUrl: user.avatar_url ?? null,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async list(page = 1, limit = 20, search?: string, role?: string): Promise<{ users: SafeUser[]; total: number }> {
    const offset = (page - 1) * limit;
    let whereClause = '';
    const bindings: unknown[] = [];

    const conditions: string[] = [];
    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      bindings.push(`%${search}%`, `%${search}%`);
    }
    if (role) {
      conditions.push('role = ?');
      bindings.push(role);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as total FROM users ${whereClause}`)
      .bind(...bindings)
      .first<{ total: number }>();

    const total = countResult?.total || 0;

    const result = await this.db
      .prepare(`SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all<User>();

    return {
      users: (result.results || []).map((u) => this.sanitize(u)),
      total,
    };
  }

  async getById(id: number): Promise<SafeUser | null> {
    const user = await this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<User>();
    return user ? this.sanitize(user) : null;
  }

  async getByEmail(email: string): Promise<User | null> {
    return (await this.db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>()) || null;
  }

  async create(data: {
    email: string;
    password: string;
    name: string;
    role?: 'admin' | 'editor' | 'author' | 'viewer';
    avatar_url?: string | null;
  }): Promise<SafeUser> {
    const password_hash = await hashPassword(data.password);
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        'INSERT INTO users (email, password_hash, name, role, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
      )
      .bind(
        data.email,
        password_hash,
        data.name,
        data.role || 'editor',
        data.avatar_url || null,
        now,
        now
      )
      .first<User>();

    if (!result) throw new Error('Failed to create user');
    return this.sanitize(result);
  }

  async update(
    id: number,
    data: {
      email?: string;
      name?: string;
      role?: 'admin' | 'editor' | 'author' | 'viewer';
      avatar_url?: string | null;
      password?: string;
    }
  ): Promise<SafeUser> {
    const existing = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<User>();
    if (!existing) throw new Error('User not found');

    const updates: string[] = [];
    const bindings: unknown[] = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      bindings.push(data.email);
    }
    if (data.name !== undefined) {
      updates.push('name = ?');
      bindings.push(data.name);
    }
    if (data.role !== undefined) {
      updates.push('role = ?');
      bindings.push(data.role);
    }
    if (data.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      bindings.push(data.avatar_url);
    }
    if (data.password) {
      const password_hash = await hashPassword(data.password);
      updates.push('password_hash = ?');
      bindings.push(password_hash);
    }

    if (updates.length === 0) return this.sanitize(existing);

    updates.push('updated_at = ?');
    bindings.push(new Date().toISOString());
    bindings.push(id);

    const result = await this.db
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
      .bind(...bindings)
      .first<User>();

    if (!result) throw new Error('Failed to update user');
    return this.sanitize(result);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return (result.meta?.changes || 0) > 0;
  }

  async updateProfile(
    userId: number,
    data: { name?: string; avatar_url?: string | null; current_password?: string; new_password?: string }
  ): Promise<SafeUser> {
    const user = await this.db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>();
    if (!user) throw new Error('User not found');

    const updates: string[] = [];
    const bindings: unknown[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      bindings.push(data.name);
    }
    if (data.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      bindings.push(data.avatar_url);
    }
    if (data.new_password) {
      if (!data.current_password) throw new Error('Current password required');
      const valid = await verifyPassword(data.current_password, user.password_hash);
      if (!valid) throw new Error('Current password is incorrect');
      const hash = await hashPassword(data.new_password);
      updates.push('password_hash = ?');
      bindings.push(hash);
    }

    if (updates.length === 0) return this.sanitize(user);

    updates.push('updated_at = ?');
    bindings.push(new Date().toISOString());
    bindings.push(userId);

    const result = await this.db
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ? RETURNING *`)
      .bind(...bindings)
      .first<User>();

    if (!result) throw new Error('Failed to update profile');
    return this.sanitize(result);
  }

  async getStats(): Promise<{ total: number; byRole: Record<string, number> }> {
    const total = await this.db.prepare('SELECT COUNT(*) as total FROM users').first<{ total: number }>();
    const byRole = await this.db
      .prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role')
      .all<{ role: string; count: number }>();

    const roleMap: Record<string, number> = {};
    for (const r of byRole.results || []) {
      roleMap[r.role] = r.count;
    }

    return { total: total?.total || 0, byRole: roleMap };
  }
}
