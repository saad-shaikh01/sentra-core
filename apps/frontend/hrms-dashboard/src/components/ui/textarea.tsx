import * as React from 'react';
import { cn } from '@/lib/utils';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[100px] w-full rounded-xl px-4 py-3 text-sm',
          'bg-white/[0.03] border border-white/10 backdrop-blur-md',
          'text-foreground placeholder:text-muted-foreground/60',
          'transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)',
          'focus:outline-none focus:bg-white/[0.06] focus:border-primary/60 focus:ring-4 focus:ring-primary/10 focus:scale-[1.005]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-none',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
