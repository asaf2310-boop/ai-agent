# Job Agent

Python worker that upserts Israel job listings (including **LinkedIn jobs from the past 7 days**) and matches them to resumes in Supabase. Runs twice daily via GitHub Actions.

```bash
pip install -r requirements.txt
python refresh.py
python main.py   # optional FastAPI POST /refresh
```

See `.env.example` for required variables.
