/**
 * Comm pagination response builder.
 * All comm list endpoints must return this shape — no raw array responses.
 */
export interface CommPaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function buildCommPaginationResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): CommPaginatedResponse<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Returns Mongoose-compatible skip/limit values from page + limit.
 */
export function toMongoosePagination(page: number, limit: number): { skip: number; limit: number } {
  return {
    skip: (page - 1) * limit,
    limit,
  };
}
