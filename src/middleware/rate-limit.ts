import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// NOTE: In-memory store Worker instances之间paylaşılmaz.
// Production'da D1 veya KV kullanılması önerilir.
const store = new Map<string, RateLimitEntry>();

// Endpoint-specific rate limit configurations
const RATE_LIMIT_CONFIGS: Record<string, { max: number; windowMs: number }> = {
  // Auth endpoints - strict limits
  login: { max: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 min
  register: { max: 3, windowMs: 15 * 60 * 1000 }, // 3 attempts per 15 min
  'password-reset': { max: 2, windowMs: 60 * 60 * 1000 }, // 2 attempts per hour

  // News API endpoints
  'api:news:list': { max: 60, windowMs: 60 * 1000 }, // 60 req/min
  'api:news:detail': { max: 120, windowMs: 60 * 1000 }, // 120 req/min
  'api:news:featured': { max: 30, windowMs: 60 * 1000 }, // 30 req/min
  'api:news:breaking': { max: 30, windowMs: 60 * 1000 }, // 30 req/min
  'api:news:search': { max: 30, windowMs: 60 * 1000 }, // 30 req/min

  // Category endpoints
  'api:categories:list': { max: 60, windowMs: 60 * 1000 },
  'api:categories:detail': { max: 60, windowMs: 60 * 1000 },

  // Subscription endpoints
  'api:subscribe': { max: 10, windowMs: 60 * 1000 }, // 10 req/min
  'api:unsubscribe': { max: 10, windowMs: 60 * 1000 },

  // Comment endpoints
  'api:comments:list': { max: 60, windowMs: 60 * 1000 },
  'api:comments:create': { max: 20, windowMs: 60 * 1000 },

  // Admin endpoints - stricter
  'api:admin:create': { max: 20, windowMs: 60 * 1000 },
  'api:admin:update': { max: 30, windowMs: 60 * 1000 },
  'api:admin:delete': { max: 10, windowMs: 60 * 1000 },

  // Default fallback
  default: { max: 100, windowMs: 60 * 1000 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  total: number;
}

function getKey(identifier: string, endpoint: string): string {
  return `${endpoint}:${identifier}`;
}

export function checkRateLimit(endpoint: string, identifier: string): RateLimitResult {
  const config = RATE_LIMIT_CONFIGS[endpoint] || RATE_LIMIT_CONFIGS.default;
  const key = getKey(identifier, endpoint);
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    // First request or window expired
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(key, newEntry);
    return {
      allowed: true,
      remaining: config.max - 1,
      resetAt: newEntry.resetAt,
      total: config.max,
    };
  }

  // Increment counter
  entry.count += 1;
  store.set(key, entry);

  const allowed = entry.count <= config.max;
  const remaining = Math.max(0, config.max - entry.count);

  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
    total: config.max,
  };
}

export function createRateLimiter(endpoint: string) {
  return async (c: Context, next: Next) => {
    // Get client IP from CF-Connecting-IP header or fallback
    const clientIp =
      c.req.header('CF-Connecting-IP') ||
      c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    const result = checkRateLimit(endpoint, clientIp);

    // Add rate limit headers
    c.header('X-RateLimit-Limit', String(result.total));
    c.header('X-RateLimit-Remaining', String(result.remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      return c.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again after ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
        },
        429,
        {
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        }
      );
    }

    await next();
  };
}

// Cleanup old entries periodically (call this in a cron job or periodically)
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}

// Get current stats for monitoring
export function getRateLimitStats(): { totalKeys: number; endpoints: Record<string, number> } {
  const endpoints: Record<string, number> = {};
  for (const key of store.keys()) {
    const endpoint = key.split(':')[0];
    endpoints[endpoint] = (endpoints[endpoint] || 0) + 1;
  }
  return {
    totalKeys: store.size,
    endpoints,
  };
}
