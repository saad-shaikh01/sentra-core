import * as React from 'react';
import { cn } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-xl px-4 py-2 text-sm',
          'bg-white/[0.03] border border-white/10 backdrop-blur-md',
          'text-foreground placeholder:text-muted-foreground/60',
          'transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)',
          'focus:outline-none focus:bg-white/[0.06] focus:border-primary/60 focus:ring-4 focus:ring-primary/10 focus:scale-[1.01]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
