// tokens.ts does NOT import from api.ts to avoid circular dependencies.
// Use registerApiInstance if an axios-style instance with default headers is needed.

let _apiInstance: { defaults: { headers: { common: Record<string, string> } } } | null = null;

export function registerApiInstance(instance: typeof _apiInstance) {
  _apiInstance = instance;
}

export function getTokens() {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  if (_apiInstance) {
    _apiInstance.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  if (_apiInstance) {
    delete (_apiInstance.defaults.headers.common as Record<string, string>)['Authorization'];
  }
}

export function getCurrentJti(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('accessToken');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.jti || null;
  } catch {
    return null;
  }
}
