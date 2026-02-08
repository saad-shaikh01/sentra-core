'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { IUserProfile } from '@sentra-core/types';

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

// Hook for login
export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await api.login(email, password);
      api.setTokens(response.accessToken, response.refreshToken);
      return response.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.user(), user);
      router.push('/dashboard');
    },
  });
}

// Hook for signup
export function useSignup() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      name: string;
      organizationName: string;
    }) => {
      const response = await api.signup(data);
      api.setTokens(response.accessToken, response.refreshToken);
      return response.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.user(), user);
      router.push('/dashboard');
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
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async (data: { token: string; name: string; password: string }) => {
      const response = await api.acceptInvitation(data);
      api.setTokens(response.accessToken, response.refreshToken);
      return response.user;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.user(), user);
      router.push('/dashboard');
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
