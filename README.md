# AI Agent — Israel job search

Next.js on Vercel, Supabase for data/storage, GitHub Actions for twice-daily refresh + auto applications.

## Structure

| Path | Role |
|------|------|
| `src/` | Next.js UI — upload CV, matches, application report |
| `job-agent/` | Python scan / match / tailor / apply (`refresh.py`) |
| `supabase/migrations/` | SQL schema (`job_agent`) |
| `.github/workflows/` | Twice-daily cron |

## Setup

### 1. Supabase

Run both migrations in the SQL Editor:

1. `supabase/migrations/001_job_agent_schema.sql`
2. `supabase/migrations/002_applications_and_tailoring.sql`

Then **Settings → API → Exposed schemas** — add `job_agent`.

### 2. Local Next.js

```bash
cp .env.example .env.local
npm install
npm run dev
```

### 3. Vercel env

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_SCHEMA=job_agent`
- `NEXT_PUBLIC_SUPABASE_RESUME_BUCKET=job-agent-resumes`
- `OPENAI_API_KEY` (recommended — CV rewrite)
- `RESEND_API_KEY` + `APPLICATION_NOTIFY_EMAIL` (real outbound sends)
- `APPLICATION_FROM_EMAIL` (optional)

### 4. GitHub Actions secrets

Same as above (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `APPLICATION_NOTIFY_EMAIL`, `APPLICATION_FROM_EMAIL`).

## Flow

1. Upload CV → extract text (DOCX/PDF/TXT) → store in Supabase.
2. Seed sample jobs if empty → score matches → rewrite CV per job → attempt send.
3. UI shows matches + report (`sent` / `prepared` / `skipped` / `failed`).
4. Actions runs ~08:00 and ~20:00 Israel time.

Without Resend, applications stay **prepared** (tailored CV saved in the report) instead of emailed.
