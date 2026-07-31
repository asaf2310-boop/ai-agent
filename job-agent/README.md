# Job Agent

Python worker that upserts Israel job listings and matches them to resumes in Supabase.

```bash
pip install -r requirements.txt
python refresh.py
python main.py   # optional FastAPI POST /refresh
```

See `.env.example` for required variables.
