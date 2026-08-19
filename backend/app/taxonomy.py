"""Caricamento e validazione delle tassonomie canoniche (tags.yaml, strumenti.yaml).

Entrambi i file organizzano i valori in gruppi per leggibilità (vedi i commenti
nei file stessi), ma nello schema ricetta sono usati come liste piatte — la
validazione quindi appiattisce tutti i gruppi in un unico insieme di valori ammessi.
"""
from pathlib import Path

import yaml

from app.config import settings


def _load_flat_taxonomy(path: Path) -> set[str]:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    valori: set[str] = set()
    for gruppo in data.values():
        if isinstance(gruppo, list):
            valori.update(gruppo)
    return valori


def load_tags() -> set[str]:
    return _load_flat_taxonomy(settings.content_path / "tags.yaml")


def load_strumenti() -> set[str]:
    return _load_flat_taxonomy(settings.content_path / "strumenti.yaml")


def validate_against_taxonomy(values: list[str], canonical: set[str]) -> list[str]:
    """Ritorna i valori non riconosciuti nella tassonomia canonica, preservando
    l'ordine di apparizione. Lista vuota = tutto valido."""
    return [v for v in values if v not in canonical]
