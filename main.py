import logging

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from routers import config, demo, preview, reports, webhook

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

app = FastAPI(
    title="English Lesson Analyzer",
    description="Analyses English lessons via Recall.ai transcripts using Claude AI",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(preview.router, prefix="/api", tags=["preview"])
app.include_router(demo.router, prefix="/api", tags=["demo"])
app.include_router(reports.router, prefix="/api", tags=["reports"])


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "service": "English Lesson Analyzer"}


_NO_CACHE = {"Cache-Control": "no-cache"}


@app.get("/dashboard", tags=["dashboard"])
def dashboard():
    return FileResponse("static/dashboard.html", headers=_NO_CACHE)
