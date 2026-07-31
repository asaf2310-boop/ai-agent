-- Applications, tailored CVs, recruiter insights (additive — safe on existing schema)

create table if not exists job_agent.applications (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references job_agent.resumes (id) on delete cascade,
  job_id uuid not null references job_agent.jobs (id) on delete cascade,
  match_id uuid references job_agent.job_matches (id) on delete set null,
  status text not null check (status in ('sent', 'prepared', 'skipped', 'failed')),
  method text,
  skip_reason text,
  recruiter_insights text,
  tailored_cv_text text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resume_id, job_id)
);

create index if not exists applications_status_idx on job_agent.applications (status);
create index if not exists applications_resume_id_idx on job_agent.applications (resume_id);
create index if not exists applications_created_at_idx on job_agent.applications (created_at desc);

alter table job_agent.jobs
  add column if not exists apply_email text;

alter table job_agent.resumes
  add column if not exists is_active boolean not null default true;

grant all on table job_agent.applications to anon, authenticated, service_role;

alter table job_agent.applications enable row level security;

drop policy if exists "Allow read applications" on job_agent.applications;
drop policy if exists "Allow write applications" on job_agent.applications;

create policy "Allow read applications" on job_agent.applications for select using (true);
create policy "Allow write applications" on job_agent.applications for all using (true) with check (true);
