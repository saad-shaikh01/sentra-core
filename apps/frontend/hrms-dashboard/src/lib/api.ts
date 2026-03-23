import { isRefreshing, pendingQueue, processQueue, setRefreshing } from './refresh-mutex';
import { clearTokens, getTokens, setTokens as setTokensHelper } from './tokens';
import { IMyAppAccess, IUserProfile } from '@sentra-core/types';

const CORE_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const HRMS_API_URL = process.env.NEXT_PUBLIC_HRMS_API_URL || 'http://localhost:3004/api/hrms';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly refreshBaseUrl: string = CORE_API_URL,
  ) {}

  setTokens(accessToken: string, refreshToken: string) {
    setTokensHelper(accessToken, refreshToken);
  }

  clearTokens() {
    clearTokens();
  }

  async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { skipAuth = false, ...fetchOptions } = options;
    const url = `${this.baseUrl}${endpoint}`;
    const isFormData =
      typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;

    const headers: HeadersInit = {
      ...fetchOptions.headers,
    };

    if (!isFormData) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    if (!skipAuth) {
      const accessToken = getTokens().accessToken;
      if (accessToken) {
        (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    let response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (response.status === 401 && !skipAuth) {
      if (url.includes('/auth/refresh')) {
        clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
        throw new Error('Session expired');
      }

      if (isRefreshing) {
        const newToken = await new Promise<string>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        });
        (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(url, { ...fetchOptions, headers });
      } else {
        setRefreshing(true);
        try {
          const { refreshToken } = getTokens();
          if (!refreshToken) throw new Error('No refresh token');

          // Multi-tab race: check if another tab already refreshed while we waited
          const currentStoredRefresh = getTokens().refreshToken;
          if (currentStoredRefresh && currentStoredRefresh !== refreshToken) {
            const freshAccess = getTokens().accessToken;
            if (freshAccess) {
              processQueue(null, freshAccess);
              (headers as Record<string, string>)['Authorization'] = `Bearer ${freshAccess}`;
              response = await fetch(url, { ...fetchOptions, headers });
              return JSON.parse(await response.text() || '{}') as T;
            }
          }

          // Send refresh token in Authorization header (required by RefreshTokenGuard)
          const refreshResponse = await fetch(`${this.refreshBaseUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${refreshToken}`,
            },
          });

          if (!refreshResponse.ok) {
            // TOKEN_ROTATED means another tab just refreshed — recover instead of logging out
            const errBody = await refreshResponse.json().catch(() => ({}));
            const errCode = errBody?.code ?? errBody?.error?.code;
            if (errCode === 'TOKEN_ROTATED') {
              const freshAccess = getTokens().accessToken;
              const freshRefresh = getTokens().refreshToken;
              if (freshAccess && freshRefresh && freshRefresh !== refreshToken) {
                processQueue(null, freshAccess);
                (headers as Record<string, string>)['Authorization'] = `Bearer ${freshAccess}`;
                response = await fetch(url, { ...fetchOptions, headers });
                return JSON.parse(await response.text() || '{}') as T;
              }
            }
            throw new Error('Refresh failed');
          }

          const data = await refreshResponse.json();
          const { accessToken, refreshToken: newRefreshToken } = data.data ?? data;

          setTokensHelper(accessToken, newRefreshToken);
          processQueue(null, accessToken);

          (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
          response = await fetch(url, { ...fetchOptions, headers });
        } catch (refreshError) {
          processQueue(refreshError, null);
          clearTokens();
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
      const message = error?.error?.message || error?.message || `HTTP ${response.status}`;
      const enrichedError = new Error(message) as Error & { code?: string; data?: unknown };
      enrichedError.code = error?.code ?? error?.error?.code;
      enrichedError.data = error?.data ?? error;
      throw enrichedError;
    }

    if (response.status === 204) return {} as T;
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  get<T>(endpoint: string, params?: Record<string, unknown>) {
    return this.fetch<T>(`${endpoint}${buildQueryString(params)}`);
  }

  post<T>(endpoint: string, data?: unknown, options?: Omit<FetchOptions, 'body' | 'method'>) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }

  patch<T>(endpoint: string, data?: unknown, options?: Omit<FetchOptions, 'body' | 'method'>) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }

  put<T>(endpoint: string, data?: unknown, options?: Omit<FetchOptions, 'body' | 'method'>) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }

  delete<T>(endpoint: string, options?: Omit<FetchOptions, 'method'>) {
    return this.fetch<T>(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }

  login(email: string, password: string) {
    return this.post<{
      data?: { accessToken: string; refreshToken: string; user: IUserProfile; appAccess?: IMyAppAccess[] };
      accessToken?: string;
      refreshToken?: string;
      user?: IUserProfile;
      appAccess?: IMyAppAccess[];
    }>('/auth/login', { email, password }, { skipAuth: true });
  }

  logout() {
    return this.post('/auth/logout');
  }

  getMe() {
    return this.get<IUserProfile>('/users/me');
  }

  getMyApps() {
    return this.get<{ data: IMyAppAccess[] }>('/auth/my-apps').then((response) => response.data);
  }

  getMyPermissions() {
    return this.get<{ data: string[] }>('/auth/my-permissions').then((response) => response.data);
  }

  getAvailableApps() {
    return this.fetch<Array<{
      appCode: string;
      appName: string;
      baseUrl?: string;
      isDefault: boolean;
    }>>('/auth/apps');
  }

  // Session management
  async getMySessions() {
    return this.get<any[]>('/auth/my-sessions');
  }

  async revokeSession(sessionId: string) {
    return this.delete<void>(`/auth/sessions/${sessionId}`);
  }

  async revokeOtherSessions() {
    return this.delete<void>('/auth/sessions/others');
  }

  // User endpoints
  async updateProfile(data: {
    name?: string;
    avatarUrl?: string;
    jobTitle?: string;
    phone?: string;
    bio?: string;
  }) {
    return this.patch<any>('/users/me', data);
  }

  async uploadAvatar(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.fetch<any>('/users/me/avatar', {
      method: 'POST',
      body: form,
    });
  }

  // Global search
  async search(q: string) {
    return this.get<any[]>(`/search`, { q });
  }
}

export const api = new ApiClient(CORE_API_URL, CORE_API_URL);
export const hrmsApi = new ApiClient(HRMS_API_URL, CORE_API_URL);
export const publicApi = new ApiClient(CORE_API_URL, CORE_API_URL);
