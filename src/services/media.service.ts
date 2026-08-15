import { createDb } from '../db';
import { mediaFiles, users } from '../db/schema';
import { eq, desc, and, count, inArray } from 'drizzle-orm';
import type { Bindings } from '../types';
import type { MediaFile, NewMediaFile } from '../db/schema';

export interface MediaFileResponse {
  id: number;
  key: string;
  url: string;
  mimeType: string;
  size: number;
  alt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedMediaFiles {
  files: MediaFileResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class MediaService {
  private db = createDb;

  constructor(private env: Bindings) {}

  async create(data: NewMediaFile): Promise<MediaFile> {
    const db = this.db(this.env.DB);
    const [created] = await db.insert(mediaFiles).values(data).returning();
    return created;
  }

  async getByKey(key: string): Promise<MediaFile | null> {
    const db = this.db(this.env.DB);
    const result = await db.select().from(mediaFiles).where(eq(mediaFiles.key, key)).limit(1);
    return result[0] || null;
  }

  async getByUser(
    userId: number,
    page = 1,
    limit = 20
  ): Promise<PaginatedMediaFiles> {
    const db = this.db(this.env.DB);
    const offset = (page - 1) * limit;

    const [files, totalResult] = await Promise.all([
      db
        .select()
        .from(mediaFiles)
        .where(eq(mediaFiles.userId, userId))
        .orderBy(desc(mediaFiles.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(mediaFiles)
        .where(eq(mediaFiles.userId, userId)),
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      files: files.map(this.mapToResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteByKey(userId: number, key: string): Promise<boolean> {
    const db = this.db(this.env.DB);
    const file = await this.getByKey(key);

    if (!file) return false;
    if (file.userId !== userId) return false;

    await db.delete(mediaFiles).where(and(eq(mediaFiles.key, key), eq(mediaFiles.userId, userId)));

    if (this.env.R2) {
      await this.env.R2.delete(key);
    }

    return true;
  }

  async deleteMultiple(userId: number, keys: string[]): Promise<number> {
    const db = this.db(this.env.DB);
    let deletedCount = 0;

    for (const key of keys) {
      const file = await this.getByKey(key);
      if (file && file.userId === userId) {
        await db.delete(mediaFiles).where(and(eq(mediaFiles.key, key), eq(mediaFiles.userId, userId)));
        if (this.env.R2) {
          await this.env.R2.delete(key);
        }
        deletedCount++;
      }
    }

    return deletedCount;
  }

  private mapToResponse(file: MediaFile): MediaFileResponse {
    return {
      id: file.id,
      key: file.key,
      url: file.url,
      mimeType: file.mimeType,
      size: file.size,
      alt: file.alt,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }
}