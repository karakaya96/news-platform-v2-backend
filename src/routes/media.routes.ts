import { Hono } from 'hono';
import type { Bindings } from '../types';

const mediaRoutes = new Hono<{ Bindings: Bindings }>();

mediaRoutes.get('/*', async (c) => {
  const r2Key = c.req.path.replace('/api/media/', '');

  if (!r2Key || r2Key.includes('..')) {
    return c.text('Not found', 404);
  }

  if (!c.env.R2) {
    return c.text('R2 not configured', 503);
  }

  const object = await c.env.R2.get(r2Key);

  if (!object) {
    return c.text('Not found', 404);
  }

  const headers = new globalThis.Headers();
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Content-Length', String(object.size));
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  }

  return new Response(object.body as ReadableStream, { status: 200, headers });
});

export default mediaRoutes;
