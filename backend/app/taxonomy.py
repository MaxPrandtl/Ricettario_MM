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
    l'ordine di apparizione. Lista vuota = tutto valido.

    NOTA: non più usata dai router create/update (sostituita da
    resolve_or_register, che risolve invece di bloccare) — resta qui come
    utility generica, potenzialmente riusabile altrove."""
    return [v for v in values if v not in canonical]


def _load_grouped_taxonomy(path: Path) -> dict[str, list[str]]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_tags_grouped() -> dict[str, list[str]]:
    return _load_grouped_taxonomy(settings.content_path / "tags.yaml")


def load_strumenti_grouped() -> dict[str, list[str]]:
    return _load_grouped_taxonomy(settings.content_path / "strumenti.yaml")


def _normalizza(v: str) -> str:
    return v.strip().lower()


def resolve_or_register(
    values: list[str],
    canonical_by_group: dict[str, list[str]],
) -> tuple[list[str], list[str]]:
    """Per ogni valore in `values`: se esiste (case-insensitive/trim) in
    canonical_by_group, lo sostituisce con la forma canonica già presente
    (per non salvare varianti maiuscole/minuscole nella ricetta). Se non
    esiste in nessuna forma, lo tratta come nuovo — normalizzato (trim,
    minuscolo), coerente con lo stile "tutto minuscolo" dei valori esistenti.

    Ritorna (valori_risolti, nuovi_valori) — `nuovi_valori` è la lista dei
    soli valori genuinamente nuovi (normalizzati), usata dal chiamante per
    sapere esattamente cosa aggiungere al file tassonomia su GitHub. Non
    modifica `canonical_by_group` — la scrittura del file è responsabilità
    del chiamante (taxonomy_writer.append_personalizzati + GithubClient)."""
    flat_norm_to_canonical: dict[str, str] = {}
    for gruppo_valori in canonical_by_group.values():
        if not isinstance(gruppo_valori, list):
            continue
        for v in gruppo_valori:
            flat_norm_to_canonical[_normalizza(v)] = v

    risolti: list[str] = []
    nuovi: list[str] = []

    for valore_utente in values:
        norm = _normalizza(valore_utente)
        if not norm:
            continue  # valore vuoto/solo spazi, ignorato silenziosamente
        if norm in flat_norm_to_canonical:
            risolti.append(flat_norm_to_canonical[norm])
        else:
            flat_norm_to_canonical[norm] = norm  # evita duplicati nello stesso payload
            risolti.append(norm)
            nuovi.append(norm)

    return risolti, nuovi
