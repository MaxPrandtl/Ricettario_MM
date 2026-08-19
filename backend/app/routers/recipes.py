from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from github import GithubException
from pydantic import BaseModel

from app.auth import SessionInfo, require_auth
from app.frontmatter import parse_recipe_markdown
from app.github_client import GithubClient, get_github_client
from app.profiles import load_profiles
from app.recipe_serializer import render_recipe_markdown, verify_roundtrip
from app.schemas.recipe import RicettaCreateRequest, RicettaIn
from app.taxonomy import (
    load_strumenti_grouped,
    load_tags_grouped,
    resolve_or_register,
)
from app.taxonomy_writer import append_personalizzati

router = APIRouter()


class RecipeCreateResponse(BaseModel):
    id: str
    path: str
    commit_sha: str
    commit_url: str
    html_url: str


class RecipeUpdateResponse(BaseModel):
    id: str
    path: str
    commit_sha: str
    commit_url: str
    html_url: str


class RecipeGetResponse(BaseModel):
    stato: Literal["pubblicata", "bozza"]
    payload: RicettaCreateRequest
    autore: str
    data_inserimento: date


class RecipePubblicaResponse(BaseModel):
    id: str
    path: str
    commit_sha: str
    commit_url: str
    html_url: str


def _cartella(stato: Literal["bozza", "pubblicata"]) -> str:
    return "bozze" if stato == "bozza" else "ricette"


def _risolvi_tassonomie(
    payload: RicettaCreateRequest,
    gh: GithubClient,
    profilo,
) -> RicettaCreateRequest:
    """Normalizza categorie/strumenti contro le tassonomie canoniche,
    risolvendo alla forma esistente se il valore normalizzato matcha, o
    registrando un valore genuinamente nuovo sotto il gruppo "personalizzati".
    Scrive un commit separato su tags.yaml/strumenti.yaml PRIMA della ricetta,
    se ci sono valori nuovi — mai un giro yaml.dump che perderebbe i commenti
    editoriali del file (vedi taxonomy_writer.append_personalizzati)."""
    tags_risolti, tags_nuovi = resolve_or_register(payload.categorie, load_tags_grouped())
    strumenti_risolti, strumenti_nuovi = resolve_or_register(
        payload.strumenti, load_strumenti_grouped()
    )

    if tags_nuovi:
        raw = gh.get_file_content("content/tags.yaml")
        nuovo_raw = append_personalizzati(raw, tags_nuovi)
        gh.update_file(
            path="content/tags.yaml",
            content=nuovo_raw,
            message=f"Aggiunge tag personalizzati: {', '.join(tags_nuovi)}",
            sha=gh.get_file_sha("content/tags.yaml"),
            author_name=profilo.nome_autore,
            author_email=profilo.email,
        )
    if strumenti_nuovi:
        raw = gh.get_file_content("content/strumenti.yaml")
        nuovo_raw = append_personalizzati(raw, strumenti_nuovi)
        gh.update_file(
            path="content/strumenti.yaml",
            content=nuovo_raw,
            message=f"Aggiunge strumenti personalizzati: {', '.join(strumenti_nuovi)}",
            sha=gh.get_file_sha("content/strumenti.yaml"),
            author_name=profilo.nome_autore,
            author_email=profilo.email,
        )

    return payload.model_copy(update={"categorie": tags_risolti, "strumenti": strumenti_risolti})


@router.post("/recipes", status_code=201, response_model=RecipeCreateResponse)
def create_recipe(
    payload: RicettaCreateRequest,
    stato: Literal["bozza", "pubblicata"] = "pubblicata",
    session: SessionInfo = Depends(require_auth),
    gh: GithubClient = Depends(get_github_client),
) -> RecipeCreateResponse:
    profilo = next(p for p in load_profiles() if p.username == session.username)
    payload = _risolvi_tassonomie(payload, gh, profilo)

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

    path = f"content/{_cartella(stato)}/{ricetta.id}.md"

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


@router.put("/recipes/{recipe_id}", response_model=RecipeUpdateResponse)
def update_recipe(
    recipe_id: str,
    payload: RicettaCreateRequest,
    stato: Literal["bozza", "pubblicata"] = "pubblicata",
    session: SessionInfo = Depends(require_auth),
    gh: GithubClient = Depends(get_github_client),
) -> RecipeUpdateResponse:
    if payload.id != recipe_id:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "id_mismatch",
                "detail": "L'id nel corpo non corrisponde all'id nell'URL",
            },
        )

    profilo = next(p for p in load_profiles() if p.username == session.username)
    payload = _risolvi_tassonomie(payload, gh, profilo)

    path = f"content/{_cartella(stato)}/{recipe_id}.md"
    sha = gh.get_file_sha(path)
    if sha is None:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "not_found",
                "detail": f"Nessuna ricetta con id '{recipe_id}' in questa cartella",
            },
        )

    # data_inserimento preservata dall'originale: è la data di PRIMA inserzione,
    # non di ultima modifica — va letta dal file esistente, non ricalcolata,
    # altrimenti ogni modifica "resetterebbe" la data di creazione. autore
    # invece riflette CHI ha fatto l'ultima modifica (assegnato server-side
    # come nella creazione).
    originale_raw = gh.get_file_content(path)
    frontmatter_originale, _ = parse_recipe_markdown(originale_raw)
    data_inserimento_originale = date.fromisoformat(str(frontmatter_originale["data_inserimento"]))

    ricetta = RicettaIn(
        **payload.model_dump(),
        autore=profilo.nome_autore,
        data_inserimento=data_inserimento_originale,
    )

    contenuto = render_recipe_markdown(ricetta)
    try:
        verify_roundtrip(contenuto, ricetta)
    except ValueError as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "serialization_error", "detail": str(e)},
        )

    try:
        result = gh.update_file(
            path=path,
            content=contenuto,
            message=f"Modifica ricetta: {ricetta.titolo}",
            sha=sha,
            author_name=profilo.nome_autore,
            author_email=profilo.email,
        )
    except GithubException as e:
        if e.status == 409:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "concurrent_edit",
                    "detail": "La ricetta è stata modificata da qualcun altro nel "
                    "frattempo. Ricarica e riapplica le tue modifiche.",
                },
            )
        raise HTTPException(
            status_code=502,
            detail={"code": "github_error", "detail": str(e)},
        )

    return RecipeUpdateResponse(
        id=ricetta.id,
        path=path,
        commit_sha=result.commit_sha,
        commit_url=result.commit_url,
        html_url=f"https://github.com/{gh.repo_full_name}/blob/main/{path}",
    )


@router.get("/recipes/{recipe_id}", response_model=RecipeGetResponse)
def get_recipe(
    recipe_id: str,
    session: SessionInfo = Depends(require_auth),
    gh: GithubClient = Depends(get_github_client),
) -> RecipeGetResponse:
    """Autenticato (non pubblico): serve solo a precompilare l'editor di
    modifica, non è usato dal sito pubblico (che legge da filesystem a build
    time). Legge da GitHub, mai dal checkout locale — resta l'unica fonte di
    verità, coerente con create/update."""
    for stato, cartella in (("pubblicata", "content/ricette"), ("bozza", "content/bozze")):
        path = f"{cartella}/{recipe_id}.md"
        raw = gh.get_file_content(path)
        if raw is not None:
            frontmatter, corpo = parse_recipe_markdown(raw)
            dati_payload = {
                k: v
                for k, v in frontmatter.items()
                if k not in ("autore", "data_inserimento")
            }
            dati_payload["corpo_markdown"] = corpo or None
            return RecipeGetResponse(
                stato=stato,
                payload=RicettaCreateRequest(**dati_payload),
                autore=frontmatter["autore"],
                data_inserimento=date.fromisoformat(str(frontmatter["data_inserimento"])),
            )
    raise HTTPException(
        status_code=404,
        detail={"code": "not_found", "detail": f"Nessuna ricetta o bozza con id '{recipe_id}'"},
    )


@router.post("/recipes/{recipe_id}/pubblica", response_model=RecipePubblicaResponse)
def pubblica_bozza(
    recipe_id: str,
    session: SessionInfo = Depends(require_auth),
    gh: GithubClient = Depends(get_github_client),
) -> RecipePubblicaResponse:
    """Sposta una bozza da content/bozze/ a content/ricette/: legge, ricrea
    altrove, cancella l'originale. Se la cancellazione fallisce dopo che la
    creazione è riuscita, la ricetta resta presente in ENTRAMBE le cartelle —
    stato recuperabile a mano (non distruttivo, coerente con la filosofia git
    del progetto), non gestito con rollback transazionale (sproporzionato per
    il volume d'uso familiare previsto)."""
    bozza_path = f"content/bozze/{recipe_id}.md"
    pubblicata_path = f"content/ricette/{recipe_id}.md"

    contenuto = gh.get_file_content(bozza_path)
    if contenuto is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "detail": f"Nessuna bozza con id '{recipe_id}'"},
        )
    if gh.file_exists(pubblicata_path):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "slug_conflict",
                "detail": f"Esiste già una ricetta pubblicata con id '{recipe_id}'",
            },
        )

    profilo = next(p for p in load_profiles() if p.username == session.username)
    try:
        result = gh.create_file(
            path=pubblicata_path,
            content=contenuto,
            message=f"Pubblica ricetta: {recipe_id}",
            author_name=profilo.nome_autore,
            author_email=profilo.email,
        )
        bozza_sha = gh.get_file_sha(bozza_path)
        gh.delete_file(
            path=bozza_path,
            message=f"Rimuove bozza pubblicata: {recipe_id}",
            sha=bozza_sha,
            author_name=profilo.nome_autore,
            author_email=profilo.email,
        )
    except GithubException as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "github_error", "detail": str(e)},
        )

    return RecipePubblicaResponse(
        id=recipe_id,
        path=pubblicata_path,
        commit_sha=result.commit_sha,
        commit_url=result.commit_url,
        html_url=f"https://github.com/{gh.repo_full_name}/blob/main/{pubblicata_path}",
    )
