import { NextResponse } from "next/server";
import {
  isHistoryEntry,
  isJunkApplicationRow,
  wasLinkOpened,
  wasSentToRealEmployer,
} from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { getDailyAutoApplyUsage } from "@/lib/daily-quota";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const supabase = createAdminClient();

    let query = supabase
      .from("applications")
      .select("*, jobs(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);

    if (resumeId) {
      query = query.eq("resume_id", resumeId);
    }

    const { data, error } = await query;
    if (error) {
      if (/user_id/i.test(error.message)) {
        return NextResponse.json({
          applications: [],
          summary: {
            total: 0,
            sent: 0,
            opened: 0,
            notSent: 0,
            prepared: 0,
            skipped: 0,
            failed: 0,
          },
          warning: "Run SQL migration 004_security_rls_auth.sql",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data ?? [];

    // Purge noise: send-failures + "sent" to synthetic catalog inboxes
    const junkIds = rows
      .filter((a) => isJunkApplicationRow(a))
      .map((a) => a.id)
      .filter(Boolean);

    if (junkIds.length) {
      try {
        await supabase.from("applications").delete().in("id", junkIds);
      } catch {
        // best-effort cleanup
      }
    }

    const applications = rows.filter((a) => isHistoryEntry(a));
    const sent = applications.filter((a) => wasSentToRealEmployer(a)).length;
    const opened = applications.filter(
      (a) => wasLinkOpened(a) && !wasSentToRealEmployer(a),
    ).length;
    const dailyQuota = await getDailyAutoApplyUsage(supabase, user.id);
    const summary = {
      total: applications.length,
      sent,
      opened,
      notSent: 0,
      prepared: 0,
      skipped: 0,
      failed: 0,
      dailyAutoUsed: dailyQuota.used,
      dailyAutoQuota: dailyQuota.quota,
      dailyAutoRemaining: dailyQuota.remaining,
    };

    return NextResponse.json({ applications, summary, dailyQuota });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load applications";
    const he =
      message === "Failed to load applications"
        ? "טעינת ההיסטוריה נכשלה"
        : message;
    return NextResponse.json({ error: he }, { status: 500 });
  }
}
