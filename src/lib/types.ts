export type Resume = {
  id: string;
  filename: string;
  storage_path: string;
  extracted_text: string | null;
  skills: string[];
  created_at: string;
  is_active?: boolean;
};

export type Job = {
  id: string;
  source: string;
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string | null;
  posted_at: string | null;
  scraped_at: string;
  apply_email?: string | null;
  post_kind?: "job" | "freelance" | "social" | string;
  channel?: string | null;
  is_social?: boolean;
};

export type JobMatch = {
  id: string;
  resume_id: string;
  job_id: string;
  score: number;
  reasons: string[];
  created_at: string;
  jobs?: Job;
};

export type Application = {
  id: string;
  resume_id: string;
  job_id: string;
  match_id: string | null;
  status: "sent" | "prepared" | "skipped" | "failed";
  method: string | null;
  skip_reason: string | null;
  recruiter_insights: string | null;
  tailored_cv_text: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  jobs?: Job;
};
