import type { TFunction } from "i18next";

export function formatRelativeTime(
  timestamp: number | null | undefined,
  t: TFunction<"common">,
): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 45 * 1000) return t("time.just_now");
  if (diff < 90 * 1000) return t("time.minute_ago");
  if (diff < 45 * minute) return t("time.minutes_ago", { count: Math.round(diff / minute) });
  if (diff < 90 * minute) return t("time.hour_ago");
  if (diff < 24 * hour) return t("time.hours_ago", { count: Math.round(diff / hour) });
  if (diff < 36 * hour) return t("time.day_ago");
  return t("time.days_ago", { count: Math.round(diff / day) });
}


