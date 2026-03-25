import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

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

const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={cn(
            'flex h-11 w-full rounded-xl px-4 py-2 pr-11 text-sm',
            'bg-white/[0.03] border border-white/10 backdrop-blur-md',
            'text-foreground placeholder:text-muted-foreground/60',
            'transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)',
            'focus:outline-none focus:bg-white/[0.06] focus:border-primary/60 focus:ring-4 focus:ring-primary/10 focus:scale-[1.01]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

export { Input, PasswordInput };

