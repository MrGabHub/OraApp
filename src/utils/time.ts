export function formatRelativeTime(timestamp?: number | null): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 45 * 1000) return "just now";
  if (diff < 90 * 1000) return "1 minute ago";
  if (diff < 45 * minute) return `${Math.round(diff / minute)} minutes ago`;
  if (diff < 90 * minute) return "1 hour ago";
  if (diff < 24 * hour) return `${Math.round(diff / hour)} hours ago`;
  if (diff < 36 * hour) return "1 day ago";
  return `${Math.round(diff / day)} days ago`;
}

