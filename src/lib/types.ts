export type Resume = {
  id: string;
  filename: string;
  storage_path: string;
  extracted_text: string | null;
  skills: string[];
  created_at: string;
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
