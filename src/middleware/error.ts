import type { Context, Next } from 'hono';
import type { Bindings } from '../types';
import { error } from '../utils/response';

export async function errorMiddleware(_c: Context<{ Bindings: Bindings }>, next: Next) {
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
