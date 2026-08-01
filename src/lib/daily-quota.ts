/**
 * Daily auto-apply quota (successful job-email / web-form sends per user).
 * Calendar day is Asia/Jerusalem so the product matches Israel usage.
 */

export const AUTO_APPLY_METHODS = ["job-email", "web-form"] as const;

export function getDailyAutoApplyQuota(): number {
  const n = Number(process.env.DAILY_AUTO_APPLY_QUOTA || "20");
  if (!Number.isFinite(n) || n < 0) return 20;
  return Math.min(Math.floor(n), 100);
}

export function israelCalendarDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/** UTC instant for local midnight of `dayKey` (YYYY-MM-DD) in Asia/Jerusalem. */
export function israelDayStartUtc(dayKey: string): Date {
  let utc = new Date(`${dayKey}T00:00:00.000Z`);
  for (let i = 0; i < 3; i++) {
    const offset = zoneOffsetMs(utc, "Asia/Jerusalem");
    utc = new Date(Date.parse(`${dayKey}T00:00:00.000Z`) - offset);
  }
  return utc;
}

export function israelDayUtcBounds(date = new Date()): {
  startIso: string;
  endIso: string;
  dayKey: string;
} {
  const dayKey = israelCalendarDayKey(date);
  const start = israelDayStartUtc(dayKey);
  // Next calendar day in Jerusalem
  const nextProbe = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  const nextKey = israelCalendarDayKey(nextProbe);
  const end = israelDayStartUtc(nextKey);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dayKey,
  };
}

type DbClient = {
  from: (table: string) => any;
};

export type DailyAutoApplyQuota = {
  used: number;
  quota: number;
  remaining: number;
  dayKey: string;
};

/** Count successful auto-applies created today (Israel calendar day). */
export async function getDailyAutoApplyUsage(
  supabase: DbClient,
  userId: string,
): Promise<DailyAutoApplyQuota> {
  const quota = getDailyAutoApplyQuota();
  const { startIso, endIso, dayKey } = israelDayUtcBounds();

  if (!userId) {
    return { used: 0, quota, remaining: quota, dayKey };
  }

  const { data, error } = await supabase
    .from("applications")
    .select("id, status, method, created_at")
    .eq("user_id", userId)
    .eq("status", "sent")
    .in("method", [...AUTO_APPLY_METHODS])
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .limit(200);

  if (error) {
    // Fail open on count errors so a scan can still try (cap still applied in-loop)
    console.warn("daily auto-apply count failed:", error.message);
    return { used: 0, quota, remaining: quota, dayKey };
  }

  const used = (data || []).length;
  return {
    used,
    quota,
    remaining: Math.max(0, quota - used),
    dayKey,
  };
}
