import type { User, Bindings } from '../types';
import { hashPassword, verifyPassword, generateToken } from '../utils/auth';

export class AuthService {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  async login(email: string, password: string, jwtSecret: string): Promise<{ user: Omit<User, 'password_hash'>; token: string } | null> {
    const user = await this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<User>();

    if (!user) return null;

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) return null;

    const token = await generateToken(
      { sub: user.id, email: user.email, role: user.role },
      jwtSecret
    );

    const { password_hash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  async getProfile(userId: number): Promise<Omit<User, 'password_hash'> | null> {
    const user = await this.db
      .prepare('SELECT id, email, name, role, avatar_url, created_at, updated_at FROM users WHERE id = ?')
      .bind(userId)
      .first<Omit<User, 'password_hash'>>();
    return user || null;
  }

  async seedAdminPassword(): Promise<string> {
    return hashPassword('admin123');
  }
}
