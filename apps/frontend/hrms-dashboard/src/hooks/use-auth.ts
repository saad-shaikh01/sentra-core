'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { IUserProfile } from '@sentra-core/types';

const CURRENT_APP_CODE = 'HRMS';

type AppRouteTarget = {
  appCode: string;
  baseUrl?: string;
  isDefault: boolean;
};

function routeAfterAuth(router: ReturnType<typeof useRouter>, appAccess?: AppRouteTarget[]) {
  if (!appAccess || appAccess.length === 0) {
    router.push('/auth/select-app');
    return;
  }

  const sorted = [...appAccess].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  if (sorted.length === 1) {
    const [single] = sorted;
    if (single.appCode === CURRENT_APP_CODE) {
      router.push('/dashboard');
      return;
    }
    if (single.baseUrl && typeof window !== 'undefined') {
      window.location.href = `${single.baseUrl}/dashboard`;
      return;
    }
    router.push('/auth/select-app');
    return;
  }

  router.push('/auth/select-app');
}

// Query keys
export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
};

// Custom hook to check if we're on the client and have a token
function useHasToken() {
  const [hasToken, setHasToken] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setHasToken(!!localStorage.getItem('accessToken'));
    setChecked(true);
  }, []);

  return { hasToken, checked };
}

// Hook to get current user
export function useUser() {
  const { hasToken, checked } = useHasToken();

  const query = useQuery({
    queryKey: authKeys.user(),
    queryFn: async (): Promise<IUserProfile> => {
      return api.getMe();
    },
    enabled: checked && hasToken,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    ...query,
    isLoading: !checked || query.isLoading,
  };
}

// Typed auth error for special cases
export class AuthError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Hook for login
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      let response: Awaited<ReturnType<typeof api.login>>;
      try {
        response = await api.login(email, password);
      } catch (err: any) {
        // Re-parse the raw fetch error to surface the code field
        const rawCode = err?.code ?? err?.data?.code ?? null;
        if (rawCode === 'ACCOUNT_SUSPENDED') {
          throw new AuthError('Account suspended', 'ACCOUNT_SUSPENDED');
        }
        if (rawCode === 'ACCOUNT_DEACTIVATED') {
          throw new AuthError('Account deactivated', 'ACCOUNT_DEACTIVATED');
        }
        throw err;
      }
      const payload = response.data ?? response;
      if (!payload.accessToken || !payload.refreshToken || !payload.user) {
        throw new Error('Invalid login response');
      }
      api.setTokens(payload.accessToken, payload.refreshToken);
      const appAccess = payload.appAccess ?? (await api.getMyApps().catch(() => []));
      return { user: payload.user, appAccess };
    },
    onSuccess: ({ user, appAccess }) => {
      queryClient.setQueryData(authKeys.user(), user);
      routeAfterAuth(router, appAccess);
    },
    onError: (err: Error) => {
      if (err instanceof AuthError && err.code === 'ACCOUNT_SUSPENDED') {
        router.push('/auth/suspended');
      }
    },
  });
}

// Hook for signup
export function useSignup() {
  return useMutation({
    mutationFn: async (_data: {
      email: string;
      password: string;
      name: string;
      organizationName: string;
    }) => {
      throw new Error('Signup is not implemented for HRMS dashboard');
    },
  });
}

// Hook for logout
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      await api.logout();
    },
    onSuccess: () => {
      queryClient.setQueryData(authKeys.user(), null);
      queryClient.clear();
      router.push('/auth/login');
    },
    onError: () => {
      // Even on error, clear local state
      api.clearTokens();
      queryClient.setQueryData(authKeys.user(), null);
      queryClient.clear();
      router.push('/auth/login');
    },
  });
}

// Hook for accepting invitation
export function useAcceptInvitation() {
  return useMutation({
    mutationFn: async (_data: { token: string; name: string; password: string }) => {
      throw new Error('Invitation acceptance is not implemented in FE-001');
    },
  });
}

// Combined auth hook for backward compatibility
export function useAuth() {
  const { data: user, isLoading, isError } = useUser();
  const loginMutation = useLogin();
  const signupMutation = useSignup();
  const logoutMutation = useLogout();

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user && !isError,
    login: loginMutation.mutateAsync,
    signup: signupMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
    loginError: loginMutation.error,
    signupError: signupMutation.error,
    isLoggingIn: loginMutation.isPending,
    isSigningUp: signupMutation.isPending,
  };
}
