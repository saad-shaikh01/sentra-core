import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-ring',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary/20 text-primary hover:bg-primary/30',
        secondary:
          'border-transparent bg-secondary/50 text-secondary-foreground hover:bg-secondary/80 backdrop-blur-md',
        destructive:
          'border-transparent bg-destructive/20 text-destructive hover:bg-destructive/30',
        outline:
          'text-foreground border-white/10 bg-white/5 backdrop-blur-sm',
        success:
          'border-transparent bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30',
        // Role variants with premium styling
        owner:
          'badge-owner border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.1)]',
        admin:
          'badge-admin border-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.1)]',
        'sales-manager':
          'badge-sales-manager border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.1)]',
        'project-manager':
          'badge-project-manager border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]',
        'frontsell-agent':
          'badge-frontsell-agent border-cyan-500/20 shadow-[0_0_12px_rgba(6,182,212,0.1)]',
        'upsell-agent':
          'badge-upsell-agent border-orange-500/20 shadow-[0_0_12px_rgba(249,115,22,0.1)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
