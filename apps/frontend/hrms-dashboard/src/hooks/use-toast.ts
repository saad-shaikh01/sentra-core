'use client';

import { create } from 'zustand';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error';
}

interface ToastStore {
  toasts: ToastItem[];
  add: (item: Omit<ToastItem, 'id'>) => void;
  remove: (id: string) => void;
}

let _counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (item) => {
    const id = `toast-${++_counter}`;
    set((s) => ({ toasts: [...s.toasts, { ...item, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Imperative API — call this anywhere (hooks, event handlers)
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().add({ title, description, variant: 'success' }),
  error: (title: string, description?: string) =>
    useToastStore.getState().add({ title, description, variant: 'error' }),
  info: (title: string, description?: string) =>
    useToastStore.getState().add({ title, description, variant: 'default' }),
};
