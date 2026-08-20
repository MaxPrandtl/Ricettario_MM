from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings  # importato subito: fail-fast se .env è incompleto
from app.routers import auth, dev_tools, recipes

app = FastAPI(title="Ricettario — backend")

# Origin fisso (non wildcard "*"): si manda Authorization: Bearer, un'origin
# esplicita resta la scelta più corretta anche se qui costa zero. Sito Eleventy
# in sviluppo gira su localhost:8080 — vedi CLAUDE.md per la convenzione di porte.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(recipes.router)
if settings.local_dev_tools_enabled:
    # Solo sviluppo locale: git pull + anteprima via build Eleventy reale.
    # Se il flag è spento (default), queste route non esistono nemmeno —
    # niente traccia in /docs, nessun endpoint da disattivare al deploy.
    app.include_router(dev_tools.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "repo": settings.github_repo}
