'use client';

import { Info, MailOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommSettings } from '@/types/comm.types';

type TrackingSendControlProps = {
  value: boolean;
  onChange: (nextValue: boolean) => void;
  settings?: CommSettings;
  hasHtmlSupport?: boolean;
  compact?: boolean;
  className?: string;
};

export function TrackingSendControl({
  value,
  onChange,
  settings,
  hasHtmlSupport = true,
  compact = false,
  className,
}: TrackingSendControlProps) {
  const trackingEnabled = settings?.trackingEnabled ?? true;
  const openTrackingEnabled = settings?.openTrackingEnabled ?? true;
  const allowPerMessageTrackingToggle = settings?.allowPerMessageTrackingToggle ?? true;

  const trackingAvailable = trackingEnabled && openTrackingEnabled && hasHtmlSupport;
  const toggleDisabled = !trackingAvailable || !allowPerMessageTrackingToggle;

  const helperText = !trackingEnabled
    ? 'Workspace tracking is off. Gmail sync still works, but estimated open tracking is disabled.'
    : !openTrackingEnabled
      ? 'Open tracking is turned off in workspace settings.'
      : !hasHtmlSupport
        ? 'Plain-text sends cannot carry an open pixel.'
        : !allowPerMessageTrackingToggle
          ? 'Tracking is controlled by workspace settings for this send.'
          : 'Open signals are estimated. Image proxying and scanners can create noise.';

  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.03]',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              <MailOpen className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Estimated Open Tracking
              </p>
              <p className="text-[11px] text-muted-foreground">
                {value && trackingAvailable ? 'Enabled for this send' : 'Not included for this send'}
              </p>
            </div>
          </div>
        </div>
        <label className={cn('inline-flex items-center gap-2', toggleDisabled && 'opacity-70')}>
          <input
            type="checkbox"
            checked={value && trackingAvailable}
            onChange={(event) => onChange(event.target.checked)}
            disabled={toggleDisabled}
            className="h-4 w-4 rounded border-white/20 bg-black/20 text-primary focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">Track</span>
        </label>
      </div>
      <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
        <p>{helperText}</p>
      </div>
    </div>
  );
}
