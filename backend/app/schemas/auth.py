from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    pin: str = Field(min_length=4, max_length=8)


class LoginResponse(BaseModel):
    token: str
    nome_autore: str
    scade_alle: datetime
    dev_tools_abilitati: bool = False  # editor: mostra/nasconde i bottoni
    # "Aggiorna sito locale"/anteprima-reale in base a questo, invece di
    # lasciarli lì rotti se il backend non ha il flag attivo.
