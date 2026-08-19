"""Genera il contenuto del file .md di una ricetta, fedele al formato scritto a
mano negli esempi esistenti (content/ricette/*.md).

Deliberatamente NON usa yaml.dump() sull'intero documento: produrrebbe ordine
alfabetico delle chiavi e stile flow/quoting diverso da quello leggibile a mano
degli esempi. Il frontmatter viene costruito riga per riga in un ordine di campo
fisso; yaml.dump/json.dumps sono usati solo per il quoting corretto dei singoli
scalari, mai per la struttura del documento.
"""
import json

import yaml

from app.schemas.recipe import Ingrediente, Passo, RicettaIn

# Unità che negli esempi appaiono SENZA virgolette (parole singole senza punti/spazi
# ambigui per YAML). "q.b." va sempre quotata perché contiene un punto.
_UNITA_NON_QUOTATE = {
    "g", "kg", "ml", "l", "pz", "cucchiai", "cucchiaino", "cucchiaini",
    "spicchio", "spicchi", "fette", "mazzetto",
}


def _yaml_scalar(s: str) -> str:
    """Quota una stringa come fanno gli esempi (es. "Tiramisù al caffè").
    json.dumps produce un quoting/escaping valido anche in YAML per stringhe
    semplici — evita di reimplementare a mano le regole di escaping YAML."""
    return json.dumps(s, ensure_ascii=False)


def _yaml_scalar_or_null(s: str | None) -> str:
    if s is None:
        return "null"
    return _yaml_scalar(s)


def _yaml_flow_item(s: str) -> str:
    """Un elemento di lista flow-style: quotato solo se contiene spazi o
    caratteri che altrimenti YAML interpreterebbe in modo ambiguo — come negli
    esempi (`[dolce, "senza cottura", ...]`)."""
    if s and all(c.isalnum() or c in "_'" for c in s):
        return s
    return _yaml_scalar(s)


def _yaml_flow_list(items: list[str]) -> str:
    return "[" + ", ".join(_yaml_flow_item(i) for i in items) + "]"


def _yaml_unita(unita: str) -> str:
    if unita in _UNITA_NON_QUOTATE:
        return unita
    return _yaml_scalar(unita)


def _render_ingrediente(ing: Ingrediente) -> list[str]:
    out = [f'  - nome: {_yaml_scalar(ing.nome)}']
    qty = "null" if ing.quantita is None else _format_number(ing.quantita)
    out.append(f"    quantita: {qty}")
    out.append(f"    unita: {_yaml_unita(ing.unita)}")

    if ing.scala is not None:
        if isinstance(ing.scala, dict):
            out.append("    scala:")
            for k, v in ing.scala.items():
                out.append(f'      "{k}": {v}')
        elif ing.scala == "fisso":
            out.append("    scala: fisso")
        else:  # numero
            out.append(f"    scala: {_format_number(ing.scala)}")
    return out


def _format_number(n: float) -> str:
    """Evita di scrivere 300.0 quando negli esempi è sempre 300 (intero)."""
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return str(n)


def _render_passo(passo: Passo) -> list[str]:
    out = [f"  - numero: {passo.numero}"]
    out.append(f"    testo: {_yaml_scalar(passo.testo)}")
    out.append(f"    foto: {_yaml_scalar_or_null(passo.foto)}")
    timer = "null" if passo.timer_sec is None else str(passo.timer_sec)
    out.append(f"    timer_sec: {timer}")
    return out


def render_recipe_markdown(r: RicettaIn) -> str:
    lines = ["---"]
    lines.append(f"id: {r.id}")
    lines.append(f"titolo: {_yaml_scalar(r.titolo)}")
    lines.append(f"categorie: {_yaml_flow_list(r.categorie)}")
    lines.append(f"tempo_preparazione_min: {r.tempo_preparazione_min}")
    lines.append(f"tempo_cottura_min: {r.tempo_cottura_min}")
    lines.append(f"porzioni_base: {r.porzioni_base}")
    lines.append(f"difficolta: {_format_number(r.difficolta)}")
    lines.append(f"autore: {_yaml_scalar(r.autore)}")
    lines.append(f"data_inserimento: {r.data_inserimento.isoformat()}")
    lines.append(f"immagine_copertina: {_yaml_scalar_or_null(r.immagine_copertina)}")
    lines.append(f"video: {_yaml_scalar_or_null(r.video)}")
    lines.append(f"racconto: {_yaml_scalar_or_null(r.racconto)}")
    lines.append(f"strumenti: {_yaml_flow_list(r.strumenti)}")

    if not r.scalabile:
        lines.append("scalabile: false")
    if r.nota_scalabilita:
        lines.append(f"nota_scalabilita: {_yaml_scalar(r.nota_scalabilita)}")

    lines.append("ingredienti:")
    for ing in r.ingredienti:
        lines.extend(_render_ingrediente(ing))

    if r.passi:
        lines.append("passi:")
        for passo in r.passi:
            lines.extend(_render_passo(passo))

    lines.append("---")

    corpo = (r.corpo_markdown or "").strip()
    return "\n".join(lines) + "\n" + corpo + "\n"


def verify_roundtrip(rendered: str, r: RicettaIn) -> None:
    """Controllo di sicurezza prima di scrivere su un repo pubblico reale:
    ri-parsa il frontmatter generato e verifica che torni semanticamente
    equivalente al modello originale. Solleva ValueError se qualcosa non torna,
    da intercettare nel router e tradurre in 500 invece di pubblicare un file
    rotto."""
    if not rendered.startswith("---\n"):
        raise ValueError("il contenuto generato non inizia con un frontmatter valido")

    parts = rendered.split("---\n", 2)
    if len(parts) < 3:
        raise ValueError("frontmatter non delimitato correttamente da '---'")

    frontmatter_raw = parts[1]
    try:
        parsed = yaml.safe_load(frontmatter_raw)
    except yaml.YAMLError as e:
        raise ValueError(f"il frontmatter generato non è YAML valido: {e}") from e

    if parsed.get("id") != r.id or parsed.get("titolo") != r.titolo:
        raise ValueError("round-trip check fallito: id/titolo non corrispondono")

    if len(parsed.get("ingredienti") or []) != len(r.ingredienti):
        raise ValueError("round-trip check fallito: numero ingredienti non corrisponde")

    # yaml.safe_load ritorna int per valori interi (es. 3, non 3.0), ma
    # 3 == 3.0 è True in Python — il confronto diretto funziona senza cast.
    if parsed.get("difficolta") != r.difficolta:
        raise ValueError("round-trip check fallito: difficolta non corrisponde")
