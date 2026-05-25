import type { ApiResponse, PaginationMeta } from '../types';

export function success<T>(data: T, status: number = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return Response.json(body, { status });
}

export function error(message: string, status: number = 400): Response {
  const body: ApiResponse = { success: false, error: message };
  return Response.json(body, { status });
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): Response {
  const pagination: PaginationMeta = {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
  const body: ApiResponse<T[]> = { success: true, data, pagination };
  return Response.json(body);
}
