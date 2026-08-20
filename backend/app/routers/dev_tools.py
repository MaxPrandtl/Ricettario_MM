"""Endpoint SOLO per sviluppo locale (git pull sulla working copy, anteprima
ricetta con build Eleventy reale) — mai montati se
settings.local_dev_tools_enabled è False (vedi main.py). Non fanno mai parte
di un deploy in produzione: eseguono comandi di sistema (git, npx) nella
cartella del repo, cosa che non ha senso né è sicura fuori da un PC di
sviluppo personale.
"""
import shutil
import subprocess
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import SessionInfo, require_auth
from app.config import settings
from app.profiles import load_profiles
from app.recipe_serializer import render_recipe_markdown
from app.schemas.recipe import RicettaCreateRequest, RicettaIn

router = APIRouter(prefix="/dev", tags=["dev-only"])

REPO_ROOT = settings.content_path.parent
ANTEPRIMA_PATH = settings.content_path / "_anteprima" / "current.md"


class PullResponse(BaseModel):
    aggiornato: bool
    dettaglio: str


@router.post("/pull", response_model=PullResponse)
def pull_locale(session: SessionInfo = Depends(require_auth)) -> PullResponse:
    """Esegue `git pull` sulla working copy locale del repo, così il sito
    Eleventy in `npm run dev` (che non osserva content/ in automatico) può
    vedere le ricette salvate dall'editor senza un comando manuale.

    Mai operazioni distruttive automatiche: se il pull fallisce (conflitti,
    modifiche locali non committate), l'output di git viene restituito
    così com'è — nessun --force, nessun reset --hard."""
    try:
        result = subprocess.run(
            ["git", "pull"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=502,
            detail={"code": "pull_timeout", "detail": "git pull non ha risposto entro 30s"},
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=502,
            detail={"code": "git_not_found", "detail": "Comando 'git' non trovato nel PATH del backend"},
        )

    if result.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"code": "pull_failed", "detail": (result.stderr or result.stdout).strip()},
        )

    output = result.stdout.strip()
    return PullResponse(
        aggiornato="Already up to date" not in output,
        dettaglio=output,
    )


class AnteprimaResponse(BaseModel):
    url: str


@router.post("/anteprima", response_model=AnteprimaResponse)
def genera_anteprima(
    payload: RicettaCreateRequest,
    session: SessionInfo = Depends(require_auth),
) -> AnteprimaResponse:
    """Scrive i dati del form corrente in un file temporaneo isolato
    (content/_anteprima/current.md, escluso da git) usando lo stesso
    serializzatore già usato per creare/modificare ricette vere — poi
    invoca una build Eleventy one-off (non --watch/--serve, per non
    scontrarsi col dev server già in esecuzione) così la pagina /anteprima/
    viene rigenerata con lo stile identico al sito reale.

    autore/data_inserimento sono placeholder (profilo loggato + oggi) solo
    per rendere l'anteprima leggibile — non vengono mai scritti su GitHub."""
    profilo = next(p for p in load_profiles() if p.username == session.username)
    ricetta = RicettaIn(
        **payload.model_dump(),
        autore=profilo.nome_autore,
        data_inserimento=date.today(),
    )
    contenuto = render_recipe_markdown(ricetta)

    ANTEPRIMA_PATH.parent.mkdir(parents=True, exist_ok=True)
    ANTEPRIMA_PATH.write_text(contenuto, encoding="utf-8")

    npx = shutil.which("npx")
    if npx is None:
        raise HTTPException(
            status_code=502,
            detail={"code": "npx_not_found", "detail": "Comando 'npx' non trovato nel PATH del backend"},
        )

    try:
        result = subprocess.run(
            [npx, "eleventy"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=502,
            detail={"code": "build_timeout", "detail": "La build Eleventy non ha risposto entro 60s"},
        )

    if result.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail={"code": "build_failed", "detail": (result.stderr or result.stdout).strip()},
        )

    return AnteprimaResponse(url="http://localhost:8080/anteprima/")
