import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { Bindings } from './types';

export function createOpenAPIApp() {
  return new OpenAPIHono<{ Bindings: Bindings }>();
}

export function setupSwagger(app: OpenAPIHono<{ Bindings: Bindings }>) {
  // Mount Swagger UI at /docs
  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      title: 'NewsHaberGlobal API',
      version: '1.0.0',
      description: 'API documentation for NewsHaberGlobal news platform',
      contact: {
        name: 'NewsHaberGlobal Team',
        email: 'newshaberglobal@gmail.com',
      },
    },
    servers: [
      {
        url: 'https://news-v2-api.karakaya-mk96.workers.dev',
        description: 'Production server',
      },
      {
        url: 'http://localhost:8787',
        description: 'Local development server',
      },
    ],
  });

  app.get(
    '/docs',
    swaggerUI({
      url: '/api-docs/doc',
      layout: 'BaseLayout',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      displayOperationId: false,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      syntaxHighlight: {
        activated: true,
        theme: ['monokai'],
      },
    })
  );
}
