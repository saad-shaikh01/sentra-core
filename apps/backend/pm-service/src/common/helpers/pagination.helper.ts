/**
 * PM pagination response builder.
 * All PM list endpoints must return this shape — no raw array responses.
 */
export interface PmPaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function buildPmPaginationResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PmPaginatedResponse<T> {
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
 * Returns Prisma-compatible skip/take values from page + limit.
 */
export function toPrismaPagination(page: number, limit: number): { skip: number; take: number } {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}
