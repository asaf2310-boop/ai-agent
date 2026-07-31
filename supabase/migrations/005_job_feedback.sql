-- User dismiss / not-interested feedback for preference learning

create table if not exists job_agent.job_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid references job_agent.resumes (id) on delete set null,
  job_id uuid references job_agent.jobs (id) on delete set null,
  feedback text not null check (feedback in ('dismiss', 'not_interested')),
  title text,
  company text,
  families text[] not null default '{}',
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists job_feedback_user_id_idx
  on job_agent.job_feedback (user_id, created_at desc);

create index if not exists job_feedback_job_id_idx
  on job_agent.job_feedback (job_id);

alter table job_agent.job_feedback enable row level security;

drop policy if exists "job_feedback_select_own" on job_agent.job_feedback;
drop policy if exists "job_feedback_insert_own" on job_agent.job_feedback;
drop policy if exists "job_feedback_delete_own" on job_agent.job_feedback;

create policy "job_feedback_select_own"
  on job_agent.job_feedback for select to authenticated
  using (auth.uid() = user_id);

create policy "job_feedback_insert_own"
  on job_agent.job_feedback for insert to authenticated
  with check (auth.uid() = user_id);

create policy "job_feedback_delete_own"
  on job_agent.job_feedback for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on job_agent.job_feedback to authenticated;
grant all on job_agent.job_feedback to service_role;
