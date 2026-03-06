import { create } from 'zustand';

export type CommConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UIState {
  sidebarOpen: boolean;
  inviteModalOpen: boolean;
  confirmDialogOpen: boolean;
  confirmDialogData: {
    title: string;
    description: string;
    onConfirm: () => void;
  } | null;
  commUnreadCount: number;
  commConnectionStatus: CommConnectionStatus;
  commSyncProgress: Record<string, { synced: number; total: number }>;
  commIdentityErrors: Record<string, string>;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openInviteModal: () => void;
  closeInviteModal: () => void;
  openConfirmDialog: (data: UIState['confirmDialogData']) => void;
  closeConfirmDialog: () => void;
  incrementCommUnread: () => void;
  clearCommUnread: () => void;
  setCommConnectionStatus: (status: CommConnectionStatus) => void;
  setCommSyncProgress: (identityId: string, synced: number, total: number) => void;
  clearCommSyncProgress: (identityId: string) => void;
  setCommIdentityError: (identityId: string, error: string) => void;
  clearCommIdentityError: (identityId: string) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  // State
  sidebarOpen: true,
  inviteModalOpen: false,
  confirmDialogOpen: false,
  confirmDialogData: null,
  commUnreadCount: 0,
  commConnectionStatus: 'disconnected',
  commSyncProgress: {},
  commIdentityErrors: {},

  // Actions
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openInviteModal: () => set({ inviteModalOpen: true }),
  closeInviteModal: () => set({ inviteModalOpen: false }),
  openConfirmDialog: (data) => set({ confirmDialogOpen: true, confirmDialogData: data }),
  closeConfirmDialog: () => set({ confirmDialogOpen: false, confirmDialogData: null }),
  incrementCommUnread: () => set((s) => ({ commUnreadCount: s.commUnreadCount + 1 })),
  clearCommUnread: () => set({ commUnreadCount: 0 }),
  setCommConnectionStatus: (status) => set({ commConnectionStatus: status }),
  setCommSyncProgress: (identityId, synced, total) =>
    set((s) => ({ commSyncProgress: { ...s.commSyncProgress, [identityId]: { synced, total } } })),
  clearCommSyncProgress: (identityId) =>
    set((s) => {
      const next = { ...s.commSyncProgress };
      delete next[identityId];
      return { commSyncProgress: next };
    }),
  setCommIdentityError: (identityId, error) =>
    set((s) => ({ commIdentityErrors: { ...s.commIdentityErrors, [identityId]: error } })),
  clearCommIdentityError: (identityId) =>
    set((s) => {
      const next = { ...s.commIdentityErrors };
      delete next[identityId];
      return { commIdentityErrors: next };
    }),
}));

// Selectors for performance optimization
export const useSidebarOpen = () => useUIStore((state) => state.sidebarOpen);
export const useInviteModalOpen = () => useUIStore((state) => state.inviteModalOpen);
