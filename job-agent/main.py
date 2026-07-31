"""Minimal FastAPI for local/manual refresh. Production uses GitHub Actions."""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from refresh import run

app = FastAPI(title="Job Agent", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/refresh")
def refresh() -> JSONResponse:
    try:
        run()
        return JSONResponse({"status": "ok"})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"status": "error", "detail": str(exc)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
