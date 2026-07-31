import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_RESUME_BUCKET || "job-agent-resumes";

/** Signed URL to download the original uploaded CV (for attaching on job sites). */
export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const supabase = createAdminClient();

    let query = supabase
      .from("resumes")
      .select("id, filename, storage_path, user_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (resumeId) {
      query = supabase
        .from("resumes")
        .select("id, filename, storage_path, user_id")
        .eq("user_id", user.id)
        .eq("id", resumeId)
        .limit(1);
    } else {
      query = supabase
        .from("resumes")
        .select("id, filename, storage_path, user_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const resume = data?.[0];
    if (!resume?.storage_path) {
      return NextResponse.json({ error: "No resume file found" }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(resume.storage_path, 60 * 30);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signError?.message || "Could not create download link" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      url: signed.signedUrl,
      filename: resume.filename,
      resumeId: resume.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
