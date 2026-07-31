import { drizzle } from 'drizzle-orm/d1';
import { migrate } from 'drizzle-orm/d1/migrator';
import * as schema from '../db/schema';

/**
 * Migration runner for D1 database
 * Runs Drizzle migrations on the D1 database
 */
export async function runMigrations(db: D1Database): Promise<void> {
  const drizzleDb = drizzle(db, { schema });

  try {
    // For D1, we need to run migrations differently
    // The migrations are in the drizzle folder
    await migrate(drizzleDb, { migrationsFolder: 'drizzle' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Initialize database - run migrations and seed data
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  await runMigrations(db);
  console.log('Database initialized successfully');
}