export function formatDateTime(value?: string | null) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return 'Unknown';

  const now = Date.now();
  const then = new Date(value).getTime();
  const diffMs = then - now;
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(absMs / (60 * 1000));
  const hours = Math.round(absMs / (60 * 60 * 1000));
  const days = Math.round(absMs / (24 * 60 * 60 * 1000));

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (minutes < 60) {
    return formatter.format(diffMs < 0 ? -minutes : minutes, 'minute');
  }

  if (hours < 24) {
    return formatter.format(diffMs < 0 ? -hours : hours, 'hour');
  }

  return formatter.format(diffMs < 0 ? -days : days, 'day');
}

export function formatValue(value?: string | null) {
  return value?.trim() || '-';
}

export function formatDeviceInfo(deviceInfo: unknown) {
  if (typeof deviceInfo === 'string' && deviceInfo.trim()) {
    return deviceInfo;
  }

  if (deviceInfo && typeof deviceInfo === 'object') {
    const info = deviceInfo as Record<string, unknown>;
    const device = typeof info.device === 'string' ? info.device : null;
    const browser = typeof info.browser === 'string' ? info.browser : null;
    const os = typeof info.os === 'string' ? info.os : null;
    const summary = [browser, os, device].filter(Boolean).join(' · ');
    if (summary) {
      return summary;
    }
  }

  return 'Unknown device';
}
