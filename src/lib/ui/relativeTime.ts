const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday", … */
export function relativeTime(epochMs: number, now = Date.now()): string {
  const diffSec = Math.round((epochMs - now) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.trunc(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.trunc(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.trunc(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.trunc(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.trunc(diffSec / (86400 * 365)), 'year');
}
