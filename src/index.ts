import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings } from './types';
import { errorMiddleware } from './middleware/error';
import newsRoutes from './routes/news.routes';
import categoryRoutes from './routes/category.routes';
import authRoutes from './routes/auth.routes';
import uploadRoutes from './routes/upload.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware - must explicitly set origin when credentials: true
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || c.env.CORS_ORIGIN || '*';
  const corsMiddleware = cors({
    origin: origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Error handling middleware
app.use('*', errorMiddleware);

// Request logging
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`${c.req.method} ${c.req.url} - ${c.res.status} (${duration}ms)`);
});

// Health check
app.get('/api/health', (c) => {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.route('/api/news', newsRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/upload', uploadRoutes);
app.route('/api/dashboard', dashboardRoutes);

// 404 handler
app.notFound((c) => {
  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
});

export default app;
