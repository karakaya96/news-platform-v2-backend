import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';

// Common response schemas
export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.string(),
});

export const SuccessResponse = <T extends z.ZodType>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
  });

export const PaginationMeta = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const PaginatedResponse = <T extends z.ZodType>(data: T) =>
  z.object({
    success: z.literal(true),
    data: z.array(data),
    pagination: PaginationMeta,
  });

// Auth schemas
export const LoginRequest = z.object({
  email: z.string().email('Geçersiz e-posta adresi'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
});

export const LoginResponse = z.object({
  token: z.string(),
  user: z.object({
    id: z.number(),
    email: z.string(),
    name: z.string(),
    role: z.enum(['admin', 'editor']),
    avatar_url: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
});

export const RegisterRequest = z.object({
  email: z.string().email('Geçersiz e-posta adresi'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
  name: z.string().min(2, 'İsim en az 2 karakter olmalıdır').max(100),
});

export const ProfileResponse = z.object({
  id: z.number(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'editor']),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Category schemas
export const Category = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  color: z.string(),
  sort_order: z.number(),
  created_at: z.string(),
  article_count: z.number().optional(),
});

export const CreateCategoryRequest = z.object({
  name: z.string().min(1, 'İsim zorunludur').max(100),
  slug: z.string().optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Geçersiz hex renk kodu')
    .default('#6366f1'),
  sort_order: z.number().int().default(0),
});

export const UpdateCategoryRequest = CreateCategoryRequest.partial();

// News schemas
export const NewsTag = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
});

export const News = z.object({
  id: z.number(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  content: z.string(),
  image_url: z.string().nullable(),
  image_alt: z.string().nullable(),
  category_id: z.number(),
  author_id: z.number(),
  status: z.enum(['draft', 'published', 'archived']),
  is_featured: z.number(),
  is_breaking: z.number(),
  view_count: z.number(),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
  seo_keywords: z.string().nullable(),
  published_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  category_name: z.string().optional(),
  category_slug: z.string().optional(),
  category_color: z.string().optional(),
  author_name: z.string().optional(),
  tags: z.array(NewsTag).optional(),
});

export const CreateNewsRequest = z.object({
  title: z.string().min(1, 'Başlık zorunludur').max(500),
  slug: z.string().optional(),
  excerpt: z.string().max(1000).optional(),
  content: z.string().min(1, 'İçerik zorunludur'),
  image_url: z
    .string()
    .url('Geçersiz URL formatı')
    .optional()
    .or(z.literal(''))
    .or(z.null())
    .transform((val) => val || null),
  image_alt: z.string().max(255).optional(),
  category_id: z.number().int().positive('Kategori seçilmelidir'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  is_featured: z.boolean().default(false),
  is_breaking: z.boolean().default(false),
  seo_title: z.string().max(255).optional(),
  seo_description: z.string().max(500).optional(),
  seo_keywords: z.string().max(500).optional(),
  published_at: z.string().datetime().optional(),
  tag_ids: z.array(z.number().int().positive()).optional(),
});

export const UpdateNewsRequest = CreateNewsRequest.partial();

// Comment schemas
export const Comment = z.object({
  id: z.number(),
  news_id: z.number(),
  parent_id: z.number().nullable(),
  author_name: z.string(),
  author_email: z.string(),
  content: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
  ip_address: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  news_title: z.string().optional(),
  news_slug: z.string().optional(),
  reply_count: z.number().optional(),
  replies: z.array(z.any()).optional(),
});

export const CreateCommentRequest = z.object({
  news_id: z.number().int().positive('Haber ID zorunludur'),
  parent_id: z.number().int().positive().optional().nullable(),
  author_name: z.string().min(1, 'İsim zorunludur').max(100),
  author_email: z.string().email('Geçersiz e-posta adresi'),
  content: z.string().min(1, 'Yorum içeriği zorunludur').max(5000),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
});

export const UpdateCommentRequest = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
});

export const BulkCommentActionRequest = z.object({
  ids: z.array(z.number().int().positive()),
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
});

// Subscription schemas
export const Subscription = z.object({
  id: z.number(),
  type: z.enum(['browser', 'email']),
  endpoint: z.string().nullable(),
  p256dh: z.string().nullable(),
  auth: z.string().nullable(),
  email: z.string().nullable(),
  categories: z.array(z.string()),
  status: z.enum(['active', 'unsubscribed']),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SubscribeRequest = z
  .object({
    type: z.enum(['browser', 'email']),
    endpoint: z.string().url('Geçersiz endpoint URL').optional(),
    p256dh: z.string().optional(),
    auth: z.string().optional(),
    email: z.string().email('Geçersiz e-posta adresi').optional(),
    categories: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'browser') {
        return !!data.endpoint && !!data.p256dh && !!data.auth;
      }
      if (data.type === 'email') {
        return !!data.email;
      }
      return false;
    },
    {
      message:
        'Browser aboneliği için endpoint, p256dh, auth; email aboneliği için email zorunludur',
      path: ['type'],
    }
  );

export const UnsubscribeRequest = z.object({
  email: z.string().email('Geçersiz e-posta adresi'),
  token: z.string().optional(),
});

// Search schemas
export const SearchQuery = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  sortBy: z.enum(['relevance', 'date', 'views']).default('relevance'),
});

export const SuggestQuery = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().positive().max(20).default(5),
});

// Dashboard schemas
export const DashboardQuery = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export const DashboardStats = z.object({
  totalNews: z.number(),
  publishedNews: z.number(),
  draftNews: z.number(),
  totalCategories: z.number(),
  recentNews: z.array(News),
  categoryStats: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      color: z.string(),
    })
  ),
});

// Upload schemas
export const UploadResponse = z.object({
  url: z.string(),
  filename: z.string(),
  size: z.number(),
  mimeType: z.string(),
});

// Cron schemas
export const CronTriggerRequest = z.object({
  secret: z.string().min(1),
});

// OpenAPI route definitions
export const loginRoute = createRoute({
  method: 'post',
  path: '/api/auth/login',
  summary: 'User login',
  description: 'Authenticate user and return JWT token',
  tags: ['Auth'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: LoginRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: SuccessResponse(LoginResponse.shape.user),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Invalid credentials',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const profileRoute = createRoute({
  method: 'get',
  path: '/api/auth/profile',
  summary: 'Get user profile',
  description: 'Get authenticated user profile',
  tags: ['Auth'],
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: 'User profile',
      content: {
        'application/json': {
          schema: SuccessResponse(ProfileResponse),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/api/categories',
  summary: 'List all categories',
  description: 'Get all categories with optional article count',
  tags: ['Categories'],
  responses: {
    200: {
      description: 'List of categories',
      content: {
        'application/json': {
          schema: SuccessResponse(z.array(Category)),
        },
      },
    },
  },
});

export const createCategoryRoute = createRoute({
  method: 'post',
  path: '/api/categories',
  summary: 'Create category',
  description: 'Create a new category (admin only)',
  tags: ['Categories'],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCategoryRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Category created',
      content: {
        'application/json': {
          schema: SuccessResponse(Category),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const getCategoryRoute = createRoute({
  method: 'get',
  path: '/api/categories/{id}',
  summary: 'Get category by ID',
  description: 'Get a single category by ID',
  tags: ['Categories'],
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'Category found',
      content: {
        'application/json': {
          schema: SuccessResponse(Category),
        },
      },
    },
    404: {
      description: 'Category not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const updateCategoryRoute = createRoute({
  method: 'put',
  path: '/api/categories/{id}',
  summary: 'Update category',
  description: 'Update a category (admin only)',
  tags: ['Categories'],
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateCategoryRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Category updated',
      content: {
        'application/json': {
          schema: SuccessResponse(Category),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'Category not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const deleteCategoryRoute = createRoute({
  method: 'delete',
  path: '/api/categories/{id}',
  summary: 'Delete category',
  description: 'Delete a category (admin only)',
  tags: ['Categories'],
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'Category deleted',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true) }),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'Category not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    409: {
      description: 'Category has articles',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const listNewsRoute = createRoute({
  method: 'get',
  path: '/api/news',
  summary: 'List news articles',
  description: 'Get paginated list of news articles with filtering',
  tags: ['News'],
  request: {
    query: z.object({
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(50).default(10).optional(),
      category: z.string().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      featured: z.coerce.boolean().optional(),
      breaking: z.coerce.boolean().optional(),
      search: z.string().optional(),
      sortBy: z.enum(['date', 'views', 'featured']).default('date').optional(),
      sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated news list',
      content: {
        'application/json': {
          schema: PaginatedResponse(News),
        },
      },
    },
  },
});

export const getNewsRoute = createRoute({
  method: 'get',
  path: '/api/news/{slug}',
  summary: 'Get news by slug',
  description: 'Get a single news article by slug',
  tags: ['News'],
  request: {
    params: z.object({
      slug: z.string().openapi({ param: { name: 'slug', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'News article found',
      content: {
        'application/json': {
          schema: SuccessResponse(News),
        },
      },
    },
    404: {
      description: 'News not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const createNewsRoute = createRoute({
  method: 'post',
  path: '/api/news',
  summary: 'Create news article',
  description: 'Create a new news article (admin/editor only)',
  tags: ['News'],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateNewsRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'News created',
      content: {
        'application/json': {
          schema: SuccessResponse(News),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const updateNewsRoute = createRoute({
  method: 'put',
  path: '/api/news/{id}',
  summary: 'Update news article',
  description: 'Update a news article (admin/editor only)',
  tags: ['News'],
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateNewsRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'News updated',
      content: {
        'application/json': {
          schema: SuccessResponse(News),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'News not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const deleteNewsRoute = createRoute({
  method: 'delete',
  path: '/api/news/{id}',
  summary: 'Delete news article',
  description: 'Delete a news article (admin only)',
  tags: ['News'],
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'News deleted',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true) }),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'News not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const searchNewsRoute = createRoute({
  method: 'get',
  path: '/api/search',
  summary: 'Search news',
  description: 'Full-text search across news articles',
  tags: ['Search'],
  request: {
    query: SearchQuery,
  },
  responses: {
    200: {
      description: 'Search results',
      content: {
        'application/json': {
          schema: PaginatedResponse(News),
        },
      },
    },
  },
});

export const suggestSearchRoute = createRoute({
  method: 'get',
  path: '/api/search/suggest',
  summary: 'Search suggestions',
  description: 'Get autocomplete suggestions for search',
  tags: ['Search'],
  request: {
    query: SuggestQuery,
  },
  responses: {
    200: {
      description: 'Search suggestions',
      content: {
        'application/json': {
          schema: SuccessResponse(
            z.array(
              z.object({
                id: z.number(),
                title: z.string(),
                slug: z.string(),
              })
            )
          ),
        },
      },
    },
  },
});

export const listCommentsRoute = createRoute({
  method: 'get',
  path: '/api/comments/{newsId}',
  summary: 'List comments for news',
  description: 'Get all comments for a specific news article',
  tags: ['Comments'],
  request: {
    params: z.object({
      newsId: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'newsId', in: 'path' } }),
    }),
    query: z.object({
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(50).default(20).optional(),
      status: z.enum(['pending', 'approved', 'rejected', 'spam']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated comments',
      content: {
        'application/json': {
          schema: PaginatedResponse(Comment),
        },
      },
    },
  },
});

export const createCommentRoute = createRoute({
  method: 'post',
  path: '/api/comments',
  summary: 'Create comment',
  description: 'Add a new comment to a news article',
  tags: ['Comments'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateCommentRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Comment created',
      content: {
        'application/json': {
          schema: SuccessResponse(Comment),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const updateCommentRoute = createRoute({
  method: 'put',
  path: '/api/comments/{id}',
  summary: 'Update comment status',
  description: 'Update comment status (admin only)',
  tags: ['Comments'],
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .regex(/^\d+$/)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateCommentRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Comment updated',
      content: {
        'application/json': {
          schema: SuccessResponse(Comment),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'Comment not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const bulkUpdateCommentsRoute = createRoute({
  method: 'put',
  path: '/api/comments/bulk',
  summary: 'Bulk update comments',
  description: 'Bulk update comment statuses (admin only)',
  tags: ['Comments'],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: BulkCommentActionRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Comments updated',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            updated: z.number(),
          }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const subscribeRoute = createRoute({
  method: 'post',
  path: '/api/subscriptions',
  summary: 'Subscribe to notifications',
  description: 'Create a new browser or email subscription',
  tags: ['Subscriptions'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: SubscribeRequest,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Subscription created',
      content: {
        'application/json': {
          schema: SuccessResponse(Subscription),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const unsubscribeRoute = createRoute({
  method: 'post',
  path: '/api/subscriptions/unsubscribe',
  summary: 'Unsubscribe from notifications',
  description: 'Unsubscribe from browser or email notifications',
  tags: ['Subscriptions'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: UnsubscribeRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Unsubscribed successfully',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
          }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    404: {
      description: 'Subscription not found',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const listSubscriptionsRoute = createRoute({
  method: 'get',
  path: '/api/subscriptions',
  summary: 'List subscriptions',
  description: 'List all subscriptions (admin only)',
  tags: ['Subscriptions'],
  security: [{ BearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().positive().default(1).optional(),
      limit: z.coerce.number().int().positive().max(100).default(20).optional(),
      type: z.enum(['browser', 'email']).optional(),
      status: z.enum(['active', 'unsubscribed']).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated subscriptions',
      content: {
        'application/json': {
          schema: PaginatedResponse(Subscription),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const sendNotificationRoute = createRoute({
  method: 'post',
  path: '/api/notifications/send',
  summary: 'Send push notification',
  description: 'Send a push notification to all browser subscribers (admin only)',
  tags: ['Notifications'],
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            title: z.string().min(1).max(100),
            body: z.string().min(1).max(200),
            url: z.string().url().optional(),
            icon: z.string().url().optional(),
            badge: z.string().url().optional(),
            categories: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Notification sent',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            sent: z.number(),
            failed: z.number(),
          }),
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const cronTriggerRoute = createRoute({
  method: 'post',
  path: '/api/cron/trigger',
  summary: 'Trigger cron job manually',
  description: 'Manually trigger the scheduled cron job for fetching news',
  tags: ['Cron'],
  security: [{ CronAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CronTriggerRequest,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Cron triggered',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            message: z.string(),
          }),
        },
      },
    },
    401: {
      description: 'Invalid secret',
      content: {
        'application/json': {
          schema: ErrorResponse,
        },
      },
    },
  },
});

export const healthCheckRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'API health check endpoint',
  tags: ['System'],
  responses: {
    200: {
      description: 'Healthy',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('ok'),
            timestamp: z.string(),
            version: z.string(),
          }),
        },
      },
    },
  },
});

export const allRoutes = [
  loginRoute,
  profileRoute,
  listCategoriesRoute,
  createCategoryRoute,
  getCategoryRoute,
  updateCategoryRoute,
  deleteCategoryRoute,
  listNewsRoute,
  getNewsRoute,
  createNewsRoute,
  updateNewsRoute,
  deleteNewsRoute,
  searchNewsRoute,
  suggestSearchRoute,
  listCommentsRoute,
  createCommentRoute,
  updateCommentRoute,
  bulkUpdateCommentsRoute,
  subscribeRoute,
  unsubscribeRoute,
  listSubscriptionsRoute,
  sendNotificationRoute,
  cronTriggerRoute,
  healthCheckRoute,
];
