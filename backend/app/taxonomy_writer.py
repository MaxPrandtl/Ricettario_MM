"""Scrittura incrementale di tags.yaml/strumenti.yaml: appende nuovi valori al
gruppo "personalizzati" preservando il resto del file byte per byte (commenti
editoriali inclusi) — non un giro yaml.load()+yaml.dump() che li perderebbe.
"""
import json


def append_personalizzati(raw_yaml: str, nuovi_valori: list[str]) -> str:
    if not nuovi_valori:
        return raw_yaml

    righe = raw_yaml.rstrip("\n").split("\n")

    idx_gruppo = next(
        (i for i, r in enumerate(righe) if r.strip().startswith("personalizzati:")),
        None,
    )

    if idx_gruppo is not None:
        idx_fine = idx_gruppo + 1
        while idx_fine < len(righe) and righe[idx_fine].startswith("  - "):
            idx_fine += 1
        for v in nuovi_valori:
            righe.insert(idx_fine, f"  - {_yaml_flow_item_semplice(v)}")
            idx_fine += 1
        return "\n".join(righe) + "\n"

    blocco = "\npersonalizzati:  # valori aggiunti dall'editor, non pre-organizzati a mano\n"
    blocco += "".join(f"  - {_yaml_flow_item_semplice(v)}\n" for v in nuovi_valori)
    return "\n".join(righe) + "\n" + blocco


def _yaml_flow_item_semplice(v: str) -> str:
    """Stessa euristica di quoting di recipe_serializer._yaml_flow_item, ma in
    stile block (- valore) invece di flow-list — quoting solo se serve."""
    if v and all(c.isalnum() or c in "_' " for c in v):
        return v
    return json.dumps(v, ensure_ascii=False)
