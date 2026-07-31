import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_RESUME_BUCKET || "job-agent-resumes";

function extractSkills(text: string): string[] {
  const known = [
    "python",
    "javascript",
    "typescript",
    "react",
    "next.js",
    "node",
    "fastapi",
    "django",
    "sql",
    "postgres",
    "supabase",
    "aws",
    "docker",
    "kubernetes",
    "git",
    "linux",
    "java",
    "c#",
    "go",
    "rust",
  ];
  const lower = text.toLowerCase();
  return known.filter((skill) => lower.includes(skill));
}

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

    let extractedText: string | null = null;
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      extractedText = bytes.toString("utf-8");
    }

    const skills = extractedText ? extractSkills(extractedText) : [];

    const { data, error } = await supabase
      .from("resumes")
      .insert({
        filename: file.name,
        storage_path: storagePath,
        extracted_text: extractedText,
        skills,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ resume: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
