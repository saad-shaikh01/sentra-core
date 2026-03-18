'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const variantConfig = {
  success: {
    icon: CheckCircle2,
    className: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
    iconClass: 'text-emerald-400',
  },
  error: {
    icon: AlertCircle,
    className: 'bg-red-500/15 border-red-500/30 text-red-300',
    iconClass: 'text-red-400',
  },
  default: {
    icon: Info,
    className: 'bg-white/10 border-white/20 text-foreground',
    iconClass: 'text-muted-foreground',
  },
};

export function Toaster() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-80 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const cfg = variantConfig[t.variant ?? 'default'];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3',
                'backdrop-blur-xl shadow-xl',
                cfg.className
              )}
            >
              <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', cfg.iconClass)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.description && (
                  <p className="text-xs opacity-70 mt-0.5">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
