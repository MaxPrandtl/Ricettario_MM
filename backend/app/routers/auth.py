from fastapi import APIRouter, HTTPException

from app.auth import authenticate, create_session
from app.schemas.auth import LoginRequest, LoginResponse

router = APIRouter()


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    profilo = authenticate(payload.username, payload.pin)
    if profilo is None:
        raise HTTPException(
            status_code=401,
            detail={"code": "unauthorized", "detail": "Credenziali non valide"},
        )
    token, scade_alle = create_session(profilo)
    return LoginResponse(token=token, nome_autore=profilo.nome_autore, scade_alle=scade_alle)
