// Simple in-memory rate limiter using Cloudflare Workers global scope
// For production, consider using Cloudflare's Rate Limiting or Durable Objects

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const RATE_LIMITS = {
  login: { max: 5, windowMs: 15 * 60 * 1000 },      // 5 attempts per 15 min
  api: { max: 100, windowMs: 60 * 1000 },            // 100 req per minute
  trigger: { max: 10, windowMs: 60 * 1000 },          // 10 per minute
};

export function checkRateLimit(
  type: keyof typeof RATE_LIMITS,
  identifier: string
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = RATE_LIMITS[type];
  const key = `${type}:${identifier}`;
  const now = Date.now();

  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    // Window expired, reset
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return {
      allowed: true,
      remaining: config.max - 1,
      resetAt: now + config.windowMs,
    };
  }

  if (entry.count >= config.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.max - entry.count,
    resetAt: entry.resetAt,
  };
}
