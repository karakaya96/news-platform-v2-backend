import type { User } from '../types';
import { generateToken, hashPassword, verifyPassword } from '../utils/auth';

export class AuthService {
  constructor(private db: import('@cloudflare/workers-types').D1Database) {}

  async login(
    email: string,
    password: string,
    jwtSecret: string
  ): Promise<{ user: Omit<User, 'password_hash'>; token: string } | null> {
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

    const { password_hash, avatar_url, created_at, updated_at, ...userWithoutPassword } = user;
    return {
      user: {
        ...userWithoutPassword,
        avatarUrl: avatar_url,
        createdAt: created_at,
        updatedAt: updated_at,
      },
      token,
    };
  }

  async getProfile(userId: number): Promise<Omit<User, 'password_hash'> | null> {
    const user = await this.db
      .prepare(
        'SELECT id, email, name, role, avatar_url, created_at, updated_at FROM users WHERE id = ?'
      )
      .bind(userId)
      .first<{
        id: number;
        email: string;
        name: string;
        role: string;
        avatar_url: string | null;
        created_at: string;
        updated_at: string;
      }>();
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  async seedAdminPassword(): Promise<string> {
    return hashPassword('admin123');
  }
}
