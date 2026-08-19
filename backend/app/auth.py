"""Autenticazione minimale: username+PIN verificato con bcrypt, token di sessione
opaco tenuto in memoria (dict di processo, non persistente tra riavvii).

IMPORTANTE — il PIN non va mai loggato. Se in futuro si aggiunge un middleware di
logging delle richieste, va esplicitamente escluso o mascherato il body di
POST /auth/login.
"""
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Header, HTTPException
from pydantic import BaseModel

from app.profiles import Profilo, load_profiles

SESSION_TTL = timedelta(hours=1)

# Sessioni in memoria: sufficiente per uso familiare a bassa concorrenza.
# Un redeploy invalida tutti i login attivi — accettabile in questa fase,
# da rivalutare (Redis/DB) se il backend cresce oltre l'uso familiare.
_sessions: dict[str, "SessionInfo"] = {}


class SessionInfo(BaseModel):
    username: str
    nome_autore: str
    scade_alle: datetime


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pin(pin: str, pin_hash: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode("utf-8"), pin_hash.encode("utf-8"))
    except ValueError:
        # pin_hash malformato (es. non è davvero un hash bcrypt) — tratta come non valido
        return False


def authenticate(username: str, pin: str) -> Profilo | None:
    profili = load_profiles()
    profilo = next((p for p in profili if p.username == username), None)
    if profilo is None:
        return None
    if not verify_pin(pin, profilo.pin_hash):
        return None
    return profilo


def create_session(profilo: Profilo) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    scade_alle = datetime.now(timezone.utc) + SESSION_TTL
    _sessions[token] = SessionInfo(
        username=profilo.username,
        nome_autore=profilo.nome_autore,
        scade_alle=scade_alle,
    )
    return token, scade_alle


def get_session(token: str) -> SessionInfo | None:
    session = _sessions.get(token)
    if session is None:
        return None
    if session.scade_alle < datetime.now(timezone.utc):
        del _sessions[token]
        return None
    return session


def require_auth(authorization: str | None = Header(default=None)) -> SessionInfo:
    """Dependency FastAPI per proteggere le route: solleva 401 se il token è
    mancante, malformato, sconosciuto o scaduto.

    L'header è dichiarato opzionale (default=None) apposta: se fosse Header(...)
    (obbligatorio), FastAPI risponderebbe 422 "Field required" prima ancora di
    eseguire questa funzione — qui vogliamo un 401 esplicito, coerente con gli
    altri casi di autenticazione mancante/non valida."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "detail": "Header Authorization mancante o malformato"},
        )
    token = authorization.removeprefix("Bearer ").strip()
    session = get_session(token)
    if session is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "detail": "Token non valido o scaduto"},
        )
    return session
