-- Security hardening: ownership + lock down public/anon access
-- Run after 001–003

-- Ownership columns
alter table job_agent.resumes
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table job_agent.job_matches
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table job_agent.applications
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists resumes_user_id_idx on job_agent.resumes (user_id);
create index if not exists job_matches_user_id_idx on job_agent.job_matches (user_id);
create index if not exists applications_user_id_idx on job_agent.applications (user_id);

-- Revoke wide-open grants from anonymous role
revoke all on all tables in schema job_agent from anon;
revoke all on all sequences in schema job_agent from anon;
revoke usage on schema job_agent from anon;

-- Authenticated: usage + table access (RLS still applies)
grant usage on schema job_agent to authenticated, service_role;
grant select, insert, update, delete on all tables in schema job_agent to authenticated;
grant all on all tables in schema job_agent to service_role;
grant all on all sequences in schema job_agent to authenticated, service_role;

-- Drop insecure open policies
drop policy if exists "Allow read resumes" on job_agent.resumes;
drop policy if exists "Allow insert resumes" on job_agent.resumes;
drop policy if exists "Allow read jobs" on job_agent.jobs;
drop policy if exists "Allow write jobs" on job_agent.jobs;
drop policy if exists "Allow read matches" on job_agent.job_matches;
drop policy if exists "Allow write matches" on job_agent.job_matches;
drop policy if exists "Allow read applications" on job_agent.applications;
drop policy if exists "Allow write applications" on job_agent.applications;
drop policy if exists "Allow resume uploads" on storage.objects;
drop policy if exists "Allow resume reads" on storage.objects;

-- Ensure RLS on
alter table job_agent.resumes enable row level security;
alter table job_agent.jobs enable row level security;
alter table job_agent.job_matches enable row level security;
alter table job_agent.applications enable row level security;

-- Resumes: owner only
create policy "resumes_select_own"
  on job_agent.resumes for select to authenticated
  using (auth.uid() = user_id);

create policy "resumes_insert_own"
  on job_agent.resumes for insert to authenticated
  with check (auth.uid() = user_id);

create policy "resumes_update_own"
  on job_agent.resumes for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "resumes_delete_own"
  on job_agent.resumes for delete to authenticated
  using (auth.uid() = user_id);

-- Jobs catalog: authenticated can read; writes only via service_role (bypasses RLS)
create policy "jobs_select_authenticated"
  on job_agent.jobs for select to authenticated
  using (true);

-- Matches: owner only
create policy "matches_select_own"
  on job_agent.job_matches for select to authenticated
  using (auth.uid() = user_id);

create policy "matches_insert_own"
  on job_agent.job_matches for insert to authenticated
  with check (auth.uid() = user_id);

create policy "matches_update_own"
  on job_agent.job_matches for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "matches_delete_own"
  on job_agent.job_matches for delete to authenticated
  using (auth.uid() = user_id);

-- Applications: owner only
create policy "applications_select_own"
  on job_agent.applications for select to authenticated
  using (auth.uid() = user_id);

create policy "applications_insert_own"
  on job_agent.applications for insert to authenticated
  with check (auth.uid() = user_id);

create policy "applications_update_own"
  on job_agent.applications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "applications_delete_own"
  on job_agent.applications for delete to authenticated
  using (auth.uid() = user_id);

-- Storage: private bucket, only own folder `{user_id}/...`
create policy "resume_storage_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-agent-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "resume_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-agent-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "resume_storage_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'job-agent-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "resume_storage_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'job-agent-resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ensure bucket stays private
update storage.buckets
set public = false
where id = 'job-agent-resumes';
