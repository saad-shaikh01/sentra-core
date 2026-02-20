import { IPaginatedResponse } from '@sentra-core/types';

export function buildPaginationResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): IPaginatedResponse<T> {
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
