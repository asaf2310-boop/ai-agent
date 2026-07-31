-- Social / freelance post metadata on jobs

alter table job_agent.jobs
  add column if not exists post_kind text not null default 'job'
    check (post_kind in ('job', 'freelance', 'social'));

alter table job_agent.jobs
  add column if not exists channel text;

alter table job_agent.jobs
  add column if not exists is_social boolean not null default false;

create index if not exists jobs_is_social_idx on job_agent.jobs (is_social);
create index if not exists jobs_post_kind_idx on job_agent.jobs (post_kind);
