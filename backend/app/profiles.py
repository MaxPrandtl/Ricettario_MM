"""Caricamento dei profili statici da backend/profili.yaml.

Il file va creato A MANO (non da un endpoint — niente self-signup in questa fase),
con il PIN già hashato con bcrypt. È escluso dal repo git (vedi .gitignore).

Formato atteso:

    profili:
      - username: mary
        nome_autore: "Mary"
        email: "mary@example.com"
        pin_hash: "$2b$12$....."
"""
from pydantic import BaseModel

from app.config import settings


class Profilo(BaseModel):
    username: str
    nome_autore: str
    email: str
    pin_hash: str


def load_profiles() -> list[Profilo]:
    """Riletto a ogni chiamata (non cachato): permette di modificare profili.yaml
    a mano senza dover riavviare il processo. Il file è piccolo, il costo è
    trascurabile per questo volume d'uso."""
    import yaml

    path = settings.profili_path
    if not path.exists():
        raise FileNotFoundError(
            f"{path} non trovato — crealo a mano seguendo il formato in "
            f"app/profiles.py (docstring del modulo)."
        )
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    return [Profilo(**p) for p in data.get("profili", [])]
