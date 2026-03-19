// tokens.ts does NOT import from api.ts to avoid circular dependencies.
// Use registerApiInstance if an axios-style instance with default headers is needed.

let _apiInstance: { defaults: { headers: { common: Record<string, string> } } } | null = null;

// BroadcastChannel: sync token refreshes across tabs so only one tab calls /auth/refresh
const _tokenChannel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('sentra_auth_tokens')
    : null;

if (_tokenChannel) {
  _tokenChannel.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'TOKENS_UPDATED') {
      localStorage.setItem('accessToken', event.data.accessToken);
      localStorage.setItem('refreshToken', event.data.refreshToken);
    } else if (event.data?.type === 'TOKENS_CLEARED') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  };
}

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
  _tokenChannel?.postMessage({ type: 'TOKENS_UPDATED', accessToken, refreshToken });
  if (_apiInstance) {
    _apiInstance.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  _tokenChannel?.postMessage({ type: 'TOKENS_CLEARED' });
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
