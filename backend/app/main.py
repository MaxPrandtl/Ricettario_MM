from fastapi import FastAPI

from app.config import settings  # importato subito: fail-fast se .env è incompleto
from app.routers import auth, recipes

app = FastAPI(title="Ricettario — backend")

app.include_router(auth.router)
app.include_router(recipes.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "repo": settings.github_repo}
