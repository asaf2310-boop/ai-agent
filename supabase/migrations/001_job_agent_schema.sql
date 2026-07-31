-- Reset + create job_agent schema (uuid PKs)

drop schema if exists job_agent cascade;

create schema job_agent;

create extension if not exists "pgcrypto";

create table job_agent.resumes (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  extracted_text text,
  skills text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table job_agent.jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title text not null,
  company text,
  location text,
  url text,
  description text,
  posted_at timestamptz,
  scraped_at timestamptz not null default now(),
  unique (source, external_id)
);

create table job_agent.job_matches (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references job_agent.resumes (id) on delete cascade,
  job_id uuid not null references job_agent.jobs (id) on delete cascade,
  score numeric(5, 4) not null check (score >= 0 and score <= 1),
  reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (resume_id, job_id)
);

create index jobs_posted_at_idx on job_agent.jobs (posted_at desc nulls last);
create index jobs_scraped_at_idx on job_agent.jobs (scraped_at desc);
create index job_matches_score_idx on job_agent.job_matches (score desc);
create index job_matches_resume_id_idx on job_agent.job_matches (resume_id);

insert into storage.buckets (id, name, public)
values ('job-agent-resumes', 'job-agent-resumes', false)
on conflict (id) do nothing;

grant usage on schema job_agent to anon, authenticated, service_role;
grant all on all tables in schema job_agent to anon, authenticated, service_role;
grant all on all sequences in schema job_agent to anon, authenticated, service_role;
alter default privileges in schema job_agent
  grant all on tables to anon, authenticated, service_role;

alter table job_agent.resumes enable row level security;
alter table job_agent.jobs enable row level security;
alter table job_agent.job_matches enable row level security;

drop policy if exists "Allow read resumes" on job_agent.resumes;
drop policy if exists "Allow insert resumes" on job_agent.resumes;
drop policy if exists "Allow read jobs" on job_agent.jobs;
drop policy if exists "Allow write jobs" on job_agent.jobs;
drop policy if exists "Allow read matches" on job_agent.job_matches;
drop policy if exists "Allow write matches" on job_agent.job_matches;
drop policy if exists "Allow resume uploads" on storage.objects;
drop policy if exists "Allow resume reads" on storage.objects;

create policy "Allow read resumes" on job_agent.resumes for select using (true);
create policy "Allow insert resumes" on job_agent.resumes for insert with check (true);
create policy "Allow read jobs" on job_agent.jobs for select using (true);
create policy "Allow write jobs" on job_agent.jobs for all using (true) with check (true);
create policy "Allow read matches" on job_agent.job_matches for select using (true);
create policy "Allow write matches" on job_agent.job_matches for all using (true) with check (true);

create policy "Allow resume uploads"
  on storage.objects for insert
  with check (bucket_id = 'job-agent-resumes');

create policy "Allow resume reads"
  on storage.objects for select
  using (bucket_id = 'job-agent-resumes');
