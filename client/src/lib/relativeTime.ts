const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const sameYear = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const otherYear = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "Mar 4", "Mar 4, 2025". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();

  if (Number.isNaN(diff)) return '';
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return relative.format(-Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return relative.format(-Math.floor(diff / HOUR), 'hour');
  if (diff < 2 * DAY) return 'yesterday';
  return (date.getFullYear() === now.getFullYear() ? sameYear : otherYear).format(date);
}
