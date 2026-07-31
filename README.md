# AI Agent — Israel job search

Next.js on Vercel, Supabase for data/storage, GitHub Actions for daily refresh.

## Structure

| Path | Role |
|------|------|
| `src/` | Next.js UI — upload resume, view matches |
| `job-agent/` | Python scraper + matcher (`refresh.py`) |
| `supabase/migrations/` | SQL schema (`job_agent`) |
| `.github/workflows/` | Daily cron refresh |

## Setup

### 1. Supabase

1. Run `supabase/migrations/001_job_agent_schema.sql` in the SQL Editor.
2. **Settings → API → Exposed schemas** — add `job_agent`.
3. Copy Project URL, anon key, and service role key.

### 2. Local Next.js

```bash
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

### 3. Vercel

Connect this repo. Framework: Next.js (root). Set env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_SCHEMA=job_agent`
- `NEXT_PUBLIC_SUPABASE_RESUME_BUCKET=job-agent-resumes`

### 4. GitHub Actions secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (optional)
