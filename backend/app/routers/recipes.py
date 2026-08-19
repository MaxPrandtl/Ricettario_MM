from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from github import GithubException
from pydantic import BaseModel

from app.auth import SessionInfo, require_auth
from app.github_client import GithubClient, get_github_client
from app.profiles import load_profiles
from app.recipe_serializer import render_recipe_markdown, verify_roundtrip
from app.schemas.recipe import RicettaCreateRequest, RicettaIn
from app.taxonomy import load_strumenti, load_tags, validate_against_taxonomy

router = APIRouter()


class RecipeCreateResponse(BaseModel):
    id: str
    path: str
    commit_sha: str
    commit_url: str
    html_url: str


def _taxonomy_error(code: str, label: str, unknown: list[str]) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={
            "code": code,
            "detail": f"{label} non riconosciuti: {', '.join(unknown)}",
            "unknown_values": unknown,
            "suggestion": f"Verifica refusi o proponi l'aggiunta alla tassonomia canonica",
        },
    )


@router.post("/recipes", status_code=201, response_model=RecipeCreateResponse)
def create_recipe(
    payload: RicettaCreateRequest,
    session: SessionInfo = Depends(require_auth),
    gh: GithubClient = Depends(get_github_client),
) -> RecipeCreateResponse:
    # Validazione tassonomie: tag e strumenti sconosciuti bloccano con l'elenco,
    # per permettere a un futuro frontend di proporre "aggiungi questo tag".
    tags_sconosciuti = validate_against_taxonomy(payload.categorie, load_tags())
    if tags_sconosciuti:
        raise _taxonomy_error("unknown_tags", "Tag", tags_sconosciuti)

    strumenti_sconosciuti = validate_against_taxonomy(payload.strumenti, load_strumenti())
    if strumenti_sconosciuti:
        raise _taxonomy_error("unknown_tools", "Strumenti", strumenti_sconosciuti)

    # autore/data_inserimento assegnati SOLO server-side — mai fidarsi del client.
    profilo = next(p for p in load_profiles() if p.username == session.username)
    ricetta = RicettaIn(
        **payload.model_dump(),
        autore=profilo.nome_autore,
        data_inserimento=date.today(),
    )

    contenuto = render_recipe_markdown(ricetta)
    try:
        verify_roundtrip(contenuto, ricetta)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "serialization_error", "detail": str(e)},
        )

    path = f"content/ricette/{ricetta.id}.md"

    if gh.file_exists(path):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "slug_conflict",
                "detail": f"Esiste già una ricetta con id '{ricetta.id}'",
            },
        )

    try:
        result = gh.create_file(
            path=path,
            content=contenuto,
            message=f"Aggiunge ricetta: {ricetta.titolo}",
            author_name=profilo.nome_autore,
            author_email=profilo.email,
        )
    except GithubException as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "github_error", "detail": str(e)},
        )

    return RecipeCreateResponse(
        id=ricetta.id,
        path=path,
        commit_sha=result.commit_sha,
        commit_url=result.commit_url,
        html_url=f"https://github.com/{gh.repo_full_name}/blob/main/{path}",
    )
