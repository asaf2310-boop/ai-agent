import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureSampleJobs,
  matchResumeToJobs,
  processApplicationsForResume,
  syncDrushimJobs,
  syncLinkedInJobs,
  syncLiveSocialJobs,
} from "@/lib/pipeline";
import { extractResumeText, extractSkills } from "@/lib/resume-extract";
import type { Resume } from "@/lib/types";

const BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_RESUME_BUCKET || "job-agent-resumes";

/** Load saved resume for the logged-in user (no re-upload). */
export async function GET() {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const supabase = createAdminClient();

    const { data: active } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (active?.[0]) {
      return NextResponse.json({ resume: active[0] });
    }

    const { data: latest, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ resume: latest?.[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load resume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const allowed = [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (
      file.type &&
      !allowed.includes(file.type) &&
      !file.name.match(/\.(pdf|txt|doc|docx)$/i)
    ) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const extractedText = await extractResumeText(
      bytes,
      file.name,
      file.type || "",
    );
    const skills = extractedText ? extractSkills(extractedText) : [];

    await supabase
      .from("resumes")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("is_active", true);

    const insertPayload: Record<string, unknown> = {
      filename: file.name,
      storage_path: storagePath,
      extracted_text: extractedText,
      skills,
      is_active: true,
      user_id: user.id,
    };

    let { data, error } = await supabase
      .from("resumes")
      .insert(insertPayload)
      .select()
      .single();

    if (error && /is_active|user_id/i.test(error.message)) {
      if (/user_id/i.test(error.message)) delete insertPayload.user_id;
      if (/is_active/i.test(error.message)) delete insertPayload.is_active;
      ({ data, error } = await supabase
        .from("resumes")
        .insert(insertPayload)
        .select()
        .single());
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const resume = data as Resume;

    await ensureSampleJobs(supabase);
    await syncLiveSocialJobs(supabase);
    await syncDrushimJobs(supabase);
    await syncLinkedInJobs(supabase);
    const matches = await matchResumeToJobs(supabase, resume, undefined, user.id);
    const applications = await processApplicationsForResume(
      supabase,
      resume,
      matches,
      user.id,
    );

    return NextResponse.json({
      resume,
      matches,
      applications,
      extracted: Boolean(extractedText),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
