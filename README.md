# AllIn — AI Agent (Israel job search)

Next.js app (installable PWA) on Vercel, Supabase for data/storage, GitHub Actions for twice-daily refresh + auto applications.

## Structure

| Path | Role |
|------|------|
| `src/` | AllIn app UI — login, home, match pool, history, CV autofill |
| `job-agent/` | Python scan / match / tailor / apply (`refresh.py`) |
| `supabase/migrations/` | SQL schema (`job_agent`) |
| `.github/workflows/` | Twice-daily cron |

## App

- Hebrew RTL product UI branded **AllIn**
- Bottom navigation: בית · פול · היסטוריה · קו״ח
- Install to home screen (PWA / `manifest.webmanifest`)
- Google/Gmail login; data scoped per user

## Setup

### 1. Supabase SQL

Run migrations in order:

1. `001_job_agent_schema.sql`
2. `002_applications_and_tailoring.sql`
3. `003_social_freelance_posts.sql`
4. `004_security_rls_auth.sql` ← **locks data; required**

**Settings → API → Exposed schemas** — add `job_agent`.

### 2. Google / Gmail login

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth client (Web).
2. Authorized redirect URI:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
3. Supabase → **Authentication → Providers → Google** → enable, paste Client ID + Secret.
4. Supabase → **Authentication → URL Configuration**:
   - Site URL: your Vercel URL (e.g. `https://ai-agent-tan-five.vercel.app`)
   - Redirect URLs: `https://YOUR_VERCEL_URL/auth/callback` and `http://localhost:3000/auth/callback`

### 3. Local / Vercel env

```bash
cp .env.example .env.local
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (**server only** — never expose to the browser)

Optional: `GROQ_API_KEY`, `RESEND_API_KEY`, `APPLICATION_NOTIFY_EMAIL`, `SOCIAL_RSS_URLS`

## Security model

| Layer | Protection |
|-------|------------|
| Anon role | **No** table access to `job_agent` after migration 004 |
| RLS | Users only read/write rows where `user_id = auth.uid()` |
| Jobs catalog | Authenticated read-only; writes via service role (Actions) |
| Storage | Private bucket; path must be `{user_id}/...` |
| App routes | Middleware requires login; APIs return 401 without session |
| Service role | Used only on the server / Actions — never `NEXT_PUBLIC_` |

## Flow

1. Sign in with Gmail.
2. Upload CV → owned by your user id.
3. Match / tailor / apply scoped to your data.
4. Twice daily (`05:00` / `17:00` UTC ≈ morning & evening Israel): GitHub Actions + Vercel Cron call `/api/cron/auto-apply`, which syncs jobs and auto-sends (email or web-form) up to **20 successful applications per user per Israel day**. Only real sends appear in History.
5. Job sources: LinkedIn, Drushim, Remotive/RemoteOK, plus **company career boards** (Greenhouse / Lever / Ashby) for Israel tech, finance, cyber, and startups — matched to your CV.

### Cron secrets

| Secret / env | Where |
|--------------|--------|
| `CRON_SECRET` | Vercel + GitHub Actions |
| `APP_URL` | GitHub Actions (e.g. `https://ai.allincenter.co.il`) |
| `DAILY_AUTO_APPLY_QUOTA` | Optional, default `20` |
