import { Context, Next } from 'hono';
import { error } from '../utils/response';
import type { Bindings } from '../types';

export async function errorMiddleware(c: Context<{ Bindings: Bindings }>, next: Next) {
  try {
    await next();
  } catch (err) {
    console.error('Unhandled error:', err);
    if (err instanceof Error) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return error('Resource already exists', 409);
      }
      if (err.message.includes('FOREIGN KEY constraint failed')) {
        return error('Referenced resource not found', 400);
      }
      return error(err.message, 500);
    }
    return error('Internal server error', 500);
  }
}
