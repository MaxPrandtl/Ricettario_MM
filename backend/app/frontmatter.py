"""Parsing del frontmatter YAML di un file ricetta .md, lato lettura.

Speculare a recipe_serializer.render_recipe_markdown (che scrive), ma qui si
legge un documento reale già esistente su GitHub — usa yaml.safe_load diretto
(a differenza del serializer, qui non serve preservare l'ordine/stile scritto
a mano, solo estrarre i dati). Usato da GET /recipes/{id} e da PUT
/recipes/{id} (per recuperare data_inserimento dall'originale).
"""
import yaml


def parse_recipe_markdown(raw: str) -> tuple[dict, str]:
    """Ritorna (frontmatter_dict, corpo_markdown). Solleva ValueError se il
    documento non ha un frontmatter delimitato correttamente da '---'."""
    if not raw.startswith("---\n"):
        raise ValueError("il file non inizia con un frontmatter valido")
    parts = raw.split("---\n", 2)
    if len(parts) < 3:
        raise ValueError("frontmatter non delimitato correttamente da '---'")
    frontmatter = yaml.safe_load(parts[1]) or {}
    corpo = parts[2].strip()
    return frontmatter, corpo
