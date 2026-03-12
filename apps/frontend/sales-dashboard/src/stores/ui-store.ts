import { create } from 'zustand';

export type CommConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const COMM_UNREAD_STORAGE_KEY = 'comm:unread';

type StoredCommUnread = {
  count: number;
  timestamp: number | null;
};

function readStoredCommUnread(): StoredCommUnread {
  if (typeof window === 'undefined') {
    return { count: 0, timestamp: null };
  }

  try {
    const rawValue = window.localStorage.getItem(COMM_UNREAD_STORAGE_KEY);
    if (!rawValue) {
      return { count: 0, timestamp: null };
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredCommUnread>;
    return {
      count: typeof parsed.count === 'number' ? Math.max(0, parsed.count) : 0,
      timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : null,
    };
  } catch {
    return { count: 0, timestamp: null };
  }
}

function persistCommUnread(count: number, timestamp: number | null) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    COMM_UNREAD_STORAGE_KEY,
    JSON.stringify({ count: Math.max(0, count), timestamp }),
  );
}

const initialCommUnread = readStoredCommUnread();

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
  commUnreadTimestamp: number | null;
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
  setCommUnread: (count: number, timestamp?: number) => void;
  incrementCommUnread: (amount?: number) => void;
  decrementCommUnread: (amount?: number) => void;
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
  commUnreadCount: initialCommUnread.count,
  commUnreadTimestamp: initialCommUnread.timestamp,
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
  setCommUnread: (count, timestamp = Date.now()) =>
    set(() => {
      const nextCount = Math.max(0, count);
      persistCommUnread(nextCount, timestamp);
      return { commUnreadCount: nextCount, commUnreadTimestamp: timestamp };
    }),
  incrementCommUnread: (amount = 1) =>
    set((s) => {
      const nextCount = Math.max(0, s.commUnreadCount + Math.max(0, amount));
      const timestamp = Date.now();
      persistCommUnread(nextCount, timestamp);
      return { commUnreadCount: nextCount, commUnreadTimestamp: timestamp };
    }),
  decrementCommUnread: (amount = 1) =>
    set((s) => {
      const nextCount = Math.max(0, s.commUnreadCount - Math.max(0, amount));
      const timestamp = Date.now();
      persistCommUnread(nextCount, timestamp);
      return { commUnreadCount: nextCount, commUnreadTimestamp: timestamp };
    }),
  clearCommUnread: () => set((s) => s),
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
