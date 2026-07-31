import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureSampleJobs,
  matchResumeToJobs,
  processApplicationsForResume,
} from "@/lib/pipeline";
import { extractResumeText, extractSkills } from "@/lib/resume-extract";
import type { Resume } from "@/lib/types";

const BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_RESUME_BUCKET || "job-agent-resumes";

export async function POST(request: Request) {
  try {
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

    const supabase = createAdminClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${Date.now()}-${safeName}`;

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

    // Mark previous resumes inactive (column added in migration 002)
    await supabase.from("resumes").update({ is_active: false }).eq("is_active", true);

    const insertPayload: Record<string, unknown> = {
      filename: file.name,
      storage_path: storagePath,
      extracted_text: extractedText,
      skills,
      is_active: true,
    };

    let { data, error } = await supabase
      .from("resumes")
      .insert(insertPayload)
      .select()
      .single();

    // Fallback if migration 002 not applied yet
    if (error && /is_active/i.test(error.message)) {
      delete insertPayload.is_active;
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
    const matches = await matchResumeToJobs(supabase, resume);
    const applications = await processApplicationsForResume(
      supabase,
      resume,
      matches,
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
