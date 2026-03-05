'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { IInvitation, IOrganizationMember } from '@sentra-core/types';

// Query keys
export const organizationKeys = {
  all: ['organization'] as const,
  members: () => [...organizationKeys.all, 'members'] as const,
  invitations: () => [...organizationKeys.all, 'invitations'] as const,
};

// Hook to get organization members
export function useMembers() {
  return useQuery<IOrganizationMember[]>({
    queryKey: organizationKeys.members(),
    queryFn: () => api.getMembers(),
  });
}

// Hook to update member role
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.updateMemberRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.members() });
    },
  });
}

// Hook to remove member
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => api.removeMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.members() });
    },
  });
}

// Hook to get pending invitations
export function useInvitations() {
  return useQuery<IInvitation[]>({
    queryKey: organizationKeys.invitations(),
    queryFn: async () => {
      try {
        return await api.getIamInvitations();
      } catch {
        return api.getPendingInvitations();
      }
    },
  });
}

// Hook to send invitation
export function useSendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      try {
        return await api.sendIamInvitation({
          email,
          appBundles: [{ appCode: 'PM_DASHBOARD' }],
        });
      } catch {
        return api.sendInvitation(email, role);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.invitations() });
    },
  });
}

// Hook to cancel invitation
export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      try {
        return await api.cancelIamInvitation(invitationId);
      } catch {
        return api.cancelInvitation(invitationId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.invitations() });
    },
  });
}
