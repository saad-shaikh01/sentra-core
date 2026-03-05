/**
 * Comm Service API Response Conventions
 *
 * Route prefix: /api/comm
 *
 * Response shape conventions:
 *   Single resource:  { data: T }
 *   Paginated list:   { data: T[], meta: { total, page, limit, totalPages } }
 *   Mutation success: { success: true, data?: T }
 *   Error:            { statusCode, message, error }  (NestJS default exception filter)
 */

export interface CommSingleResponse<T> {
  data: T;
}

export function wrapSingle<T>(data: T): CommSingleResponse<T> {
  return { data };
}

export interface CommMutationResponse {
  success: true;
}

export const COMM_MUTATION_OK: CommMutationResponse = { success: true };
