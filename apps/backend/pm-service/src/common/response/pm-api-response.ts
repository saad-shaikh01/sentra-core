/**
 * PM Service API Response Conventions
 *
 * Route prefix: /api/pm
 *
 * Route naming rules:
 *   Templates:          /api/pm/templates
 *   Template stages:    /api/pm/templates/:templateId/stages
 *   Template tasks:     /api/pm/templates/:templateId/stages/:stageId/tasks
 *   Engagements:        /api/pm/engagements
 *   Projects:           /api/pm/projects
 *   Project stages:     /api/pm/projects/:projectId/stages
 *   Tasks:              /api/pm/projects/:projectId/tasks
 *   Stage tasks:        /api/pm/stages/:stageId/tasks
 *   Submissions:        /api/pm/tasks/:taskId/submissions
 *   QC reviews:         /api/pm/submissions/:submissionId/qc-reviews
 *   Deliverables:       /api/pm/projects/:projectId/deliverables
 *   Approvals:          /api/pm/deliverables/:deliverableId/approval-requests
 *   Threads:            /api/pm/threads
 *   Messages:           /api/pm/threads/:threadId/messages
 *   Files:              /api/pm/files
 *   Health:             /api/pm/health
 *
 * Response shape conventions:
 *   Single resource:  { data: T }
 *   Paginated list:   { data: T[], meta: { total, page, limit, totalPages } }
 *   Mutation success: { success: true, data?: T }
 *   Error:            { statusCode, message, error }  (NestJS default exception filter)
 *
 * Tenant scoping rule:
 *   organizationId is extracted from the JWT payload by the auth guard.
 *   It is NEVER read from the request body or query params.
 *   Every PM service method receives organizationId from the controller via @CurrentUser().
 */

/**
 * Standard single-resource response wrapper.
 * Use for GET :id and POST/PATCH responses.
 */
export interface PmSingleResponse<T> {
  data: T;
}

export function wrapSingle<T>(data: T): PmSingleResponse<T> {
  return { data };
}

/**
 * Standard success response for mutations that don't return a full resource.
 */
export interface PmMutationResponse {
  success: true;
}

export const PM_MUTATION_OK: PmMutationResponse = { success: true };
