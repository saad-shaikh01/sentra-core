import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  inviteModalOpen: boolean;
  confirmDialogOpen: boolean;
  confirmDialogData: {
    title: string;
    description: string;
    onConfirm: () => void;
  } | null;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openInviteModal: () => void;
  closeInviteModal: () => void;
  openConfirmDialog: (data: UIState['confirmDialogData']) => void;
  closeConfirmDialog: () => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  // State
  sidebarOpen: true,
  inviteModalOpen: false,
  confirmDialogOpen: false,
  confirmDialogData: null,

  // Actions
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openInviteModal: () => set({ inviteModalOpen: true }),
  closeInviteModal: () => set({ inviteModalOpen: false }),
  openConfirmDialog: (data) => set({ confirmDialogOpen: true, confirmDialogData: data }),
  closeConfirmDialog: () => set({ confirmDialogOpen: false, confirmDialogData: null }),
}));

// Selectors for performance optimization
export const useSidebarOpen = () => useUIStore((state) => state.sidebarOpen);
export const useInviteModalOpen = () => useUIStore((state) => state.inviteModalOpen);
