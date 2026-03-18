import {
  IMyAppAccess,
  IInvitation,
  ILoginResponse,
  IOrganizationMember,
  ISignupResponse,
  IUserProfile,
  UserRole,
} from '@sentra-core/types';
import { isRefreshing, setRefreshing, pendingQueue, processQueue } from './refresh-mutex';
import { getTokens, setTokens as setTokensHelper, clearTokens as clearTokensHelper } from './tokens';

const CORE_API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001/api';
const PM_API_URL   = process.env.NEXT_PUBLIC_PM_API_URL   || 'http://localhost:3003/api/pm';
const COMM_API_URL = process.env.NEXT_PUBLIC_COMM_API_URL || 'http://localhost:3002/api/comm';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
  service?: 'core' | 'pm' | 'comm';
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }

  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export type AppBundleInput = {
  appCode: 'SALES_DASHBOARD' | 'PM_DASHBOARD' | 'HRMS' | 'CLIENT_PORTAL' | 'COMM_SERVICE';
  roleIds?: string[];
  scopeGrants?: Array<{
    resourceKey: string;
    scopeType: 'OWN' | 'TEAM' | 'DEPARTMENT' | 'BRAND' | 'PROJECT' | 'ALL';
    scopeValues?: Record<string, unknown>;
  }>;
};

export interface PmSingleResponse<T> {
  data: T;
}

export interface PmMutationResponse {
  success: boolean;
  data?: unknown;
}

export interface InvitationLookupResponse {
  id: string;
  email: string;
  role?: UserRole | null;
  organizationName: string;
  bundles?: Array<{
    appCode: string;
    roleIds?: string[];
    scopeGrants?: unknown[];
  }>;
}

export interface PmThread {
  id: string;
  projectId: string;
  scopeType: 'PROJECT' | 'STAGE' | 'TASK' | 'APPROVAL';
  scopeId: string;
  visibility: 'INTERNAL' | 'EXTERNAL';
}

export interface PmThreadMessage {
  id: string;
  threadId: string;
  authorId: string;
  body: string;
  messageType: string;
  createdAt: string;
}

export interface PmThreadHead {
  lastMessageAt: string | null;
  count: number;
}

export interface PmFileUploadToken {
  fileAssetId: string;
  storageKey: string;
  uploadUrl: string;
  bucket: string;
}

export interface PmFileVersion {
  id: string;
  versionNumber: number;
  originalFilename: string;
  sizeBytes: number | null;
}

export interface PmFileLink {
  id: string;
  fileAssetId: string;
  createdAt: string;
  fileAsset: {
    id: string;
    name: string;
    assetType: string;
    mimeType: string | null;
  };
  fileVersion: {
    versionNumber: number;
    originalFilename: string;
    sizeBytes: number | null;
    isLatest: boolean;
  } | null;
}

export interface PmSignedUrlResponse {
  fileAssetId: string;
  fileVersionId: string;
  storageKey: string;
  signedUrl: string;
  expiresInSeconds: number;
}

export interface PmNotification {
  id: string;
  organizationId: string;
  projectId: string | null;
  userId: string;
  eventType: string;
  scopeType: string;
  scopeId: string;
  status: 'UNREAD' | 'READ';
  payload?: unknown;
  createdAt: string;
  readAt: string | null;
}

export interface PmActivityLog {
  id: string;
  organizationId: string;
  projectId: string;
  scopeType: string;
  scopeId: string;
  actorUserId: string | null;
  eventType: string;
  payloadJson?: unknown;
  createdAt: string;
}

class ApiClient {
  private coreUrl: string;
  private pmUrl: string;
  private commUrl: string;

  constructor(coreUrl: string, pmUrl: string, commUrl: string = COMM_API_URL) {
    this.coreUrl = coreUrl;
    this.pmUrl   = pmUrl;
    this.commUrl = commUrl;
  }

  private unwrapData<T>(payload: PmSingleResponse<T> | T): T {
    if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
      return (payload as PmSingleResponse<T>).data;
    }
    return payload as T;
  }

  private getAccessToken(): string | null {
    return getTokens().accessToken;
  }

  setTokens(accessToken: string, refreshToken: string) {
    setTokensHelper(accessToken, refreshToken);
  }

  clearTokens() {
    clearTokensHelper();
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { skipAuth = false, service = 'core', ...fetchOptions } = options;
    const baseUrl = service === 'pm' ? this.pmUrl : service === 'comm' ? this.commUrl : this.coreUrl;
    
    // Normalize endpoint: ensure it doesn't double-prefix /pm
    let cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (service === 'pm' && cleanEndpoint.startsWith('/pm/')) {
      cleanEndpoint = cleanEndpoint.substring(3); // Remove /pm
    }
    
    const url = `${baseUrl}${cleanEndpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };

    if (!skipAuth) {
      const accessToken = this.getAccessToken();
      if (accessToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    let response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401 && !skipAuth) {
      // Don't retry the refresh endpoint itself
      if (url.includes('/auth/refresh')) {
        clearTokensHelper();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        throw new Error('Session expired');
      }

      // If refresh already in progress, queue this request
      if (isRefreshing) {
        const newToken = await new Promise<string>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        });
        (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...fetchOptions, headers });
      } else {
        // Start refresh — set mutex
        setRefreshing(true);
        try {
          const { refreshToken } = getTokens();
          if (!refreshToken) throw new Error('No refresh token');

          const refreshResponse = await fetch(`${this.coreUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!refreshResponse.ok) throw new Error('Refresh failed');

          const data = await refreshResponse.json();
          const { accessToken, refreshToken: newRefreshToken } =
            data.data ?? data;

          setTokensHelper(accessToken, newRefreshToken);
          processQueue(null, accessToken);

          (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
          response = await fetch(url, { ...fetchOptions, headers });
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearTokensHelper();
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login';
          }
          throw refreshError;
        } finally {
          setRefreshing(false);
        }
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      const message =
        error?.error?.message ||
        error?.message ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    if (response.status === 204) {
      return {} as T;
    }

    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  // Auth endpoints
  async login(email: string, password: string) {
    return this.fetch<ILoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
  }

  async signup(data: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
  }) {
    return this.fetch<ISignupResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  }

  async logout() {
    try {
      await this.fetch('/auth/logout', { method: 'POST' });
    } finally {
      this.clearTokens();
    }
  }

  async getInvitation(token: string) {
    return this.fetch<InvitationLookupResponse>(
      `/auth/invite?token=${token}`,
      { skipAuth: true },
    );
  }

  async acceptInvitation(data: { token: string; name: string; password: string }) {
    return this.fetch<ILoginResponse>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuth: true,
    });
  }

  async getAvailableApps() {
    return this.fetch<Array<{
      appCode: string;
      appName: string;
      baseUrl?: string;
      isDefault: boolean;
    }>>('/auth/apps');
  }

  async forgotPassword(email: string) {
    return this.fetch<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
  }

  async resetPassword(token: string, newPassword: string) {
    return this.fetch<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
      skipAuth: true,
    });
  }

  // User endpoints
  async getMe() {
    return this.fetch<IUserProfile>('/users/me');
  }

  async updateProfile(data: {
    name?: string;
    avatarUrl?: string;
    jobTitle?: string;
    phone?: string;
    bio?: string;
  }) {
    return this.fetch<IUserProfile>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Organization endpoints
  async getMembers() {
    return this.fetch<IOrganizationMember[]>('/organization/members');
  }

  async updateMemberRole(userId: string, role: string) {
    return this.fetch<IOrganizationMember>(`/organization/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(userId: string) {
    return this.fetch<{ message: string }>(`/organization/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // Invitation endpoints
  async sendInvitation(email: string, role: string) {
    return this.fetch<IInvitation>('/organization/invite', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  async sendIamInvitation(dto: {
    email: string;
    appBundles: AppBundleInput[];
    expiresInDays?: number;
  }) {
    return this.fetch<any>('/iam/invitations', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  async getPendingInvitations() {
    return this.fetch<IInvitation[]>('/organization/invitations');
  }

  async getIamInvitations() {
    return this.fetch<any[]>('/iam/invitations');
  }

  async cancelInvitation(invitationId: string) {
    return this.fetch<{ message: string }>(`/organization/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  async resendIamInvitation(invitationId: string) {
    return this.fetch<any>(`/iam/invitations/${invitationId}/resend`, {
      method: 'POST',
    });
  }

  async cancelIamInvitation(invitationId: string) {
    return this.fetch<{ message: string }>(`/iam/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  async updateUserEntitlements(
    userId: string,
    dto: { appBundles: AppBundleInput[]; defaultAppCode?: AppBundleInput['appCode'] },
  ) {
    return this.fetch<any>(`/iam/users/${userId}/entitlements`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  // Brand endpoints
  async getBrands(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/brands${qs}`);
  }

  async getBrand(id: string) {
    return this.fetch<any>(`/brands/${id}`);
  }

  async createBrand(dto: Record<string, unknown>) {
    return this.fetch<any>('/brands', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateBrand(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/brands/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteBrand(id: string) {
    return this.fetch<{ message: string }>(`/brands/${id}`, { method: 'DELETE' });
  }

  // Client endpoints
  async getClients(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/clients${qs}`);
  }

  async getClient(id: string) {
    return this.fetch<any>(`/clients/${id}`);
  }

  async createClient(dto: Record<string, unknown>) {
    return this.fetch<any>('/clients', { method: 'POST', body: JSON.stringify(dto) });
  }

  async updateClient(id: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
  }

  async deleteClient(id: string) {
    return this.fetch<{ message: string }>(`/clients/${id}`, { method: 'DELETE' });
  }

  // PM (PM Service)
  async getProjects(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/projects${qs}`, { service: 'pm' });
  }

  async getProject(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${id}`, { service: 'pm' });
  }

  async getProjectBoard(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${id}/board`, { service: 'pm' });
  }

  async getProjectActivity(id: string, params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/projects/${id}/activity${qs}`, { service: 'pm' });
  }

  async createProject(dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>('/projects', { method: 'POST', body: JSON.stringify(dto), service: 'pm' });
  }

  async updateProject(id: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(dto), service: 'pm' });
  }

  async archiveProject(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${id}/archive`, { method: 'POST', service: 'pm' });
  }

  async getEngagements(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/engagements${qs}`, { service: 'pm' });
  }

  async getEngagement(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/engagements/${id}`, { service: 'pm' });
  }

  async createEngagement(dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>('/engagements', {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async updateEngagement(id: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/engagements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async archiveEngagement(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/engagements/${id}/archive`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async getTemplates(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/templates${qs}`, { service: 'pm' });
  }

  async getStages(projectId: string, params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/projects/${projectId}/stages${qs}`, { service: 'pm' });
  }

  async createStage(projectId: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${projectId}/stages`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async updateStage(stageId: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async updateStageLead(stageId: string, ownerLeadId: string) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/lead`, {
      method: 'PATCH',
      body: JSON.stringify({ ownerLeadId }),
      service: 'pm',
    });
  }

  async activateStage(stageId: string) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/activate`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async completeStage(stageId: string) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/complete`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async blockStage(stageId: string, reason: string) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/block`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      service: 'pm',
    });
  }

  async unblockStage(stageId: string) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/unblock`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async skipStage(stageId: string) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/skip`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async getAllStages(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/stages${qs}`, { service: 'pm' });
  }

  async getTasksByStage(stageId: string, params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/stages/${stageId}/tasks${qs}`, { service: 'pm' });
  }

  async getMyTasks(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/my-tasks${qs}`, { service: 'pm' });
  }

  async getSubmissions(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/submissions/queue/all${qs}`, { service: 'pm' });
  }

  async getSubmission(id: string) {
    return this.fetch<PmSingleResponse<any>>(`/submissions/${id}`, { service: 'pm' });
  }

  async submitReview(submissionId: string, dto: Record<string, unknown>) {
    return this.fetch<PmMutationResponse>(`/submissions/${submissionId}/qc-reviews`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm'
    });
  }

  async createTaskSubmission(taskId: string, dto: { notes?: string; selfQcResponses?: { labelSnapshot: string; isChecked?: boolean; responseText?: string }[] }) {
    return this.fetch<any>(`/tasks/${taskId}/submissions`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async getTask(taskId: string) {
    return this.fetch<any>(`/tasks/${taskId}`, { service: 'pm' });
  }

  async createTask(stageId: string, projectId: string, dto: Record<string, unknown>) {
    const qs = new URLSearchParams({ projectId }).toString();
    return this.fetch<any>(`/stages/${stageId}/tasks?${qs}`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async updateTask(taskId: string, dto: Record<string, unknown>) {
    return this.fetch<any>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(dto), service: 'pm' });
  }

  async moveTask(taskId: string, dto: { projectStageId: string; sortOrder?: number }) {
    return this.fetch<PmSingleResponse<any>>(`/tasks/${taskId}/move`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async reorderStageTasks(stageId: string, items: { taskId: string; sortOrder: number }[]) {
    return this.fetch<PmSingleResponse<any>>(`/stages/${stageId}/tasks/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ items }),
      service: 'pm',
    });
  }

  async archiveTask(taskId: string) {
    return this.fetch<PmSingleResponse<any>>(`/tasks/${taskId}/archive`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async deleteTask(taskId: string) {
    return this.fetch(`/tasks/${taskId}`, {
      method: 'DELETE',
      service: 'pm',
    });
  }

  async getThreadByScope(scopeType: string, scopeId: string) {
    const query = new URLSearchParams({ scopeType, scopeId }).toString();
    return this.fetch<PmSingleResponse<PmThread>>(`/threads/scope/lookup?${query}`, {
      service: 'pm',
    });
  }

  async createThread(dto: {
    projectId: string;
    scopeType: 'PROJECT' | 'STAGE' | 'TASK' | 'APPROVAL';
    scopeId: string;
    visibility?: 'INTERNAL' | 'EXTERNAL';
  }) {
    return this.fetch<PmSingleResponse<PmThread>>('/threads', {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async getThreadMessages(threadId: string, params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<{ data: PmThreadMessage[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
      `/threads/${threadId}/messages${qs}`,
      { service: 'pm' },
    );
  }

  async createThreadMessage(
    threadId: string,
    dto: { body: string; parentMessageId?: string; mentionedUserIds?: string[] },
  ) {
    return this.fetch<PmSingleResponse<PmThreadMessage>>(`/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async deleteThreadMessage(messageId: string) {
    return this.fetch<PmSingleResponse<any>>(`/messages/${messageId}`, {
      method: 'DELETE',
      service: 'pm',
    });
  }

  async listFileLinks(scopeType: string, scopeId: string) {
    const query = new URLSearchParams({ scopeType, scopeId }).toString();
    return this.fetch<PmSingleResponse<PmFileLink[]>>(`/files/links?${query}`, {
      service: 'pm',
    });
  }

  async requestFileUploadToken(dto: {
    projectId: string;
    assetType: string;
    name: string;
    mimeType?: string;
  }) {
    return this.fetch<PmSingleResponse<PmFileUploadToken>>('/files/upload-token', {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async completeFileUpload(dto: {
    fileAssetId: string;
    storageKey: string;
    originalFilename: string;
    sizeBytes?: number;
  }) {
    return this.fetch<PmSingleResponse<PmFileVersion>>('/files/complete-upload', {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async linkFile(
    fileAssetId: string,
    dto: { fileVersionId?: string; scopeType: string; scopeId: string; linkType?: string },
  ) {
    return this.fetch<PmSingleResponse<PmFileLink>>(`/files/${fileAssetId}/link`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async unlinkFile(linkId: string) {
    return this.fetch(`/files/links/${linkId}`, {
      method: 'DELETE',
      service: 'pm',
    });
  }

  async archiveFile(fileAssetId: string) {
    return this.fetch<PmSingleResponse<any>>(`/files/${fileAssetId}/archive`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async getFileSignedUrl(fileAssetId: string, versionId?: string) {
    const qs = versionId ? `?${new URLSearchParams({ versionId }).toString()}` : '';
    return this.fetch<PmSingleResponse<PmSignedUrlResponse>>(`/files/${fileAssetId}/signed-url${qs}`, {
      service: 'pm',
    });
  }

  async getThreadHead(threadId: string): Promise<PmThreadHead> {
    const payload = await this.fetch<PmSingleResponse<PmThreadHead> | PmThreadHead>(
      `/threads/${threadId}/head`,
      { service: 'pm' },
    );
    return this.unwrapData(payload);
  }

  async getStageHead(threadId: string) {
    return this.getThreadHead(threadId);
  }

  async createDeliverable(projectId: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${projectId}/deliverables`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async createApprovalRequest(projectId: string, dto: Record<string, unknown>) {
    return this.fetch<PmSingleResponse<any>>(`/projects/${projectId}/approval-requests`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async getApprovalRequests(projectId: string, params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/projects/${projectId}/approval-requests${qs}`, { service: 'pm' });
  }

  async getNotifications(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/notifications${qs}`, { service: 'pm' });
  }

  async markNotificationRead(id: string) {
    return this.fetch<PmSingleResponse<PmNotification>>(`/notifications/${id}/read`, {
      method: 'POST',
      service: 'pm',
    });
  }

  async markAllNotificationsRead() {
    return this.fetch<{ success: boolean; updatedCount: number }>('/notifications/read-all', {
      method: 'POST',
      service: 'pm',
    });
  }

  // Comm — Identities
  async listIdentities() {
    return this.fetch<any>('/identities', { service: 'comm' });
  }

  async initiateOAuth(brandId?: string) {
    const qs = brandId ? `?brandId=${encodeURIComponent(brandId)}` : '';
    const response = await this.fetch<{ data?: { redirectUrl?: string }; redirectUrl?: string }>(
      `/identities/oauth/initiate${qs}`,
      { service: 'comm' },
    );
    return response.data ?? response;
  }

  async disconnectIdentity(id: string) {
    return this.fetch<void>(`/identities/${id}`, { method: 'DELETE', service: 'comm' });
  }

  async setDefaultIdentity(id: string) {
    return this.fetch<void>(`/identities/${id}/default`, { method: 'PATCH', service: 'comm' });
  }

  // Comm — Threads
  async listCommThreads(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/threads${qs}`, { service: 'comm' });
  }

  async getCommThread(id: string) {
    return this.fetch<any>(`/threads/${id}`, { service: 'comm' });
  }

  async archiveCommThread(id: string) {
    return this.fetch<void>(`/threads/${id}/archive`, { method: 'PATCH', service: 'comm' });
  }

  async markCommThreadRead(id: string) {
    return this.fetch<void>(`/threads/${id}/read`, { method: 'PATCH', service: 'comm' });
  }

  // Comm — Messages
  async listCommMessages(params?: Record<string, unknown>) {
    const qs = buildQueryString(params);
    return this.fetch<any>(`/messages${qs}`, { service: 'comm' });
  }

  async getCommMessage(id: string) {
    return this.fetch<any>(`/messages/${id}`, { service: 'comm' });
  }

  async sendCommMessage(dto: Record<string, unknown>, idempotencyKey: string) {
    return this.fetch<any>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: { 'Idempotency-Key': idempotencyKey },
      service: 'comm',
    });
  }

  async replyToCommMessage(id: string, dto: Record<string, unknown>, idempotencyKey: string) {
    return this.fetch<any>(`/messages/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: { 'Idempotency-Key': idempotencyKey },
      service: 'comm',
    });
  }

  async forwardCommMessage(id: string, dto: Record<string, unknown>, idempotencyKey: string) {
    return this.fetch<any>(`/messages/${id}/forward`, {
      method: 'POST',
      body: JSON.stringify(dto),
      headers: { 'Idempotency-Key': idempotencyKey },
      service: 'comm',
    });
  }

  // Comm — Timeline
  async getEntityTimeline(entityType: string, entityId: string, params?: Record<string, unknown>) {
    const allParams = { entityType, entityId, ...(params ?? {}) };
    const qs = '?' + new URLSearchParams(allParams as Record<string, string>).toString();
    return this.fetch<any>(`/messages${qs}`, { service: 'comm' });
  }

  // Comm — Entity Links
  async linkCommThread(threadId: string, entityType: string, entityId: string) {
    return this.fetch<void>('/entity-links', {
      method: 'POST',
      body: JSON.stringify({ threadId, entityType, entityId }),
      service: 'comm',
    });
  }

  async unlinkCommThread(threadId: string, entityType: string, entityId: string) {
    return this.fetch<void>('/entity-links/by-entity', {
      method: 'DELETE',
      body: JSON.stringify({ threadId, entityType, entityId }),
      service: 'comm',
    });
  }

  // Comm — Attachments
  async getCommAttachmentUrl(messageId: string, attachmentIndex: number) {
    return this.fetch<{ url: string; filename: string }>(`/messages/${messageId}/attachments/${attachmentIndex}`, { service: 'comm' });
  }

  // PM — Task revisions
  async getTaskRevisions(taskId: string) {
    return this.fetch<{ data: any[] }>(`/tasks/${taskId}/revisions`, { service: 'pm' });
  }

  // PM — Departments
  async getDepartments() {
    return this.fetch<{ data: any[] }>('/departments', { service: 'pm' });
  }

  async addDepartmentMember(deptId: string, dto: { userId: string; role?: string }) {
    return this.fetch<any>(`/departments/${deptId}/members`, {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async updateDepartmentMember(deptId: string, userId: string, dto: { role: string }) {
    return this.fetch<any>(`/departments/${deptId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  async removeDepartmentMember(deptId: string, userId: string) {
    return this.fetch<any>(`/departments/${deptId}/members/${userId}`, {
      method: 'DELETE',
      service: 'pm',
    });
  }

  // PM — Deliverables
  async getDeliverables(projectId: string) {
    return this.fetch<{ data: any[] }>(`/projects/${projectId}/deliverables`, { service: 'pm' });
  }

  // PM — Reports
  async getPmReports(type: 'project-health' | 'sla-breaches' | 'team-performance' | 'engagement-financials', params?: Record<string, unknown>) {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return this.fetch<any>(`/reports/${type}${qs}`, { service: 'pm' });
  }

  async resolveEscalation(id: string) {
    return this.fetch<any>(`/reports/escalations/${id}/resolve`, {
      method: 'PATCH',
      service: 'pm',
    });
  }

  // PM — Client portal
  async createPortalAccess(dto: { projectId: string; email: string; clientId?: string; expiresAt?: string }) {
    return this.fetch<any>('/client-portal/access', {
      method: 'POST',
      body: JSON.stringify(dto),
      service: 'pm',
    });
  }

  // Session management
  async getMySessions() {
    return this.fetch<any[]>('/auth/my-sessions');
  }

  async revokeSession(sessionId: string) {
    return this.fetch<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
  }

  async revokeOtherSessions() {
    return this.fetch<void>('/auth/sessions/others', { method: 'DELETE' });
  }

  async getMyApps() {
    const response = await this.fetch<{ data: IMyAppAccess[] }>('/auth/my-apps');
    return response.data;
  }
}

export const api = new ApiClient(CORE_API_URL, PM_API_URL, COMM_API_URL);
