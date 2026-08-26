import type { MiddlewareHandler } from 'hono';

/**
 * Security headers middleware for Cloudflare Workers
 * Adds comprehensive security headers to all responses
 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Content Security Policy - strict but allows necessary resources
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: https:",
      "media-src 'self' https:",
      "connect-src 'self' https://news-v2-api.karakaya-mk96.workers.dev https://vitals.vercel-insights.com",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.dailymotion.com https://player.vimeo.com https://www.bloomberg.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
      'block-all-mixed-content',
    ];

    c.header('Content-Security-Policy', cspDirectives.join('; '));

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    c.header('X-Frame-Options', 'SAMEORIGIN');

    // XSS Protection (legacy but still useful)
    c.header('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy (Feature Policy)
    c.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    );

    // HSTS - only in production (when using HTTPS)
    const host = c.req.header('host') || '';
    if (host.includes('newshaberglobal.vercel.app') || host.includes('karakaya-mk96.workers.dev')) {
      c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Cross-Origin policies - skip CORP for media proxy (needs cross-origin for <img>)
    const path = c.req.path;
    if (!path.startsWith('/api/media/')) {
      c.header('Cross-Origin-Opener-Policy', 'same-origin');
      c.header('Cross-Origin-Resource-Policy', 'same-origin');
      c.header('Cross-Origin-Embedder-Policy', 'require-corp');
    } else {
      // Media proxy needs cross-origin for <img> tags
      c.header('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    // DNS Prefetch Control
    c.header('X-DNS-Prefetch-Control', 'off');

    // Server header kaldırıldı (güvenlik için bilgi sızıntısı engellendi)
  };
}

/**
 * CORS configuration for API routes
 */
export interface CorsOptions {
  origin?: string | string[] | '*';
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function cors(options: CorsOptions = {}): MiddlewareHandler {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    credentials = false,
    maxAge = 86400,
  } = options;

  const allowedOrigins = Array.isArray(origin) ? origin : [origin];

  return async (c, next) => {
    const requestOrigin = c.req.header('Origin') || '';
    const isAllowedOrigin = allowedOrigins.includes('*') || allowedOrigins.includes(requestOrigin);

    // Handle preflight requests
    if (c.req.method === 'OPTIONS') {
      const response = c.newResponse(null, 204);

      if (isAllowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', requestOrigin);
        response.headers.set('Access-Control-Allow-Credentials', credentials.toString());
      }

      response.headers.set('Access-Control-Allow-Methods', methods.join(', '));
      response.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      response.headers.set('Access-Control-Max-Age', String(maxAge));

      return response;
    }

    await next();

    // Add CORS headers to actual responses
    if (isAllowedOrigin) {
      c.header('Access-Control-Allow-Origin', requestOrigin);
      c.header('Access-Control-Allow-Credentials', credentials.toString());
    }

    if (exposedHeaders.length > 0) {
      c.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }
  };
}

/**
 * Admin-specific security headers (stricter)
 */
export function adminSecurityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Stricter CSP for admin panel
    const adminCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https://news-v2-api.karakaya-mk96.workers.dev",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
      'block-all-mixed-content',
    ];

    c.header('Content-Security-Policy', adminCsp.join('; '));
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('X-XSS-Protection', '1; mode=block');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
  };
}