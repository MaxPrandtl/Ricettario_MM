"""Modelli Pydantic dello schema ricetta — vedi CLAUDE.md per la fonte di verità
dello schema dati.

Il punto delicato è il campo `scala` su ogni ingrediente: nei file reali assume
4 forme diverse nello stesso campo YAML (assente, "fisso", un numero, o una mappa
di scaglioni con chiavi tipo "1-2"/"8"). Verificato sugli esempi esistenti
(content/ricette/tiramisu-al-caffe.md, torta-di-mele.md) prima di modellarlo.
"""
import re
from datetime import date
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator

Difficolta = float  # 1.0-5.0, step 0.5 — vedi validator su RicettaCreateRequest

# Chiavi ammesse nella mappa di scaglioni: "8" oppure "4-6"
_SCAGLIONE_KEY_RE = re.compile(r"^\d+(-\d+)?$")

ScagliomeMap = dict[str, int]


class Ingrediente(BaseModel):
    nome: str
    quantita: Optional[float] = None  # None ammesso solo per unita "q.b."
    unita: str
    scala: Union[Literal["fisso"], float, ScagliomeMap, None] = None

    @field_validator("scala")
    @classmethod
    def valida_forma_scala(cls, v):
        if v is None or v == "fisso":
            return v
        if isinstance(v, bool):  # bool è sottoclasse di int in Python — escluderlo esplicitamente
            raise ValueError("scala non può essere un booleano")
        if isinstance(v, (int, float)):
            if v <= 0:
                raise ValueError("scala numerico deve essere maggiore di 0")
            return float(v)
        if isinstance(v, dict):
            if not v:
                raise ValueError("scala a scaglioni non può essere una mappa vuota")
            for k, val in v.items():
                if not isinstance(k, str) or not _SCAGLIONE_KEY_RE.match(k):
                    raise ValueError(
                        f"chiave scaglione non valida: {k!r} (atteso es. '4' o '4-6')"
                    )
                if not isinstance(val, int) or val < 0:
                    raise ValueError(f"valore scaglione non valido per {k!r}: {val!r}")
            return v
        raise ValueError(
            f"scala deve essere 'fisso', un numero positivo, o una mappa di scaglioni "
            f"— ricevuto {type(v).__name__}"
        )

    @model_validator(mode="after")
    def valida_quantita_vs_unita(self):
        if self.quantita is None and self.unita.strip().lower() != "q.b.":
            raise ValueError(
                f"ingrediente '{self.nome}': quantita mancante ma unita non è 'q.b.'"
            )
        return self


class Passo(BaseModel):
    numero: int = Field(gt=0)
    testo: str
    foto: Optional[str] = None
    timer_sec: Optional[int] = Field(default=None, ge=0)


class RicettaCreateRequest(BaseModel):
    """Ciò che il client invia. NIENTE autore/data_inserimento: vengono assegnati
    server-side dal profilo autenticato, mai fidandosi del client — altrimenti
    chiunque potrebbe firmare una ricetta col nome di un altro profilo."""

    id: str = Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    titolo: str
    categorie: list[str] = Field(default_factory=list)
    tempo_preparazione_min: int = Field(ge=0)
    tempo_cottura_min: int = Field(ge=0)
    porzioni_base: int = Field(gt=0)
    difficolta: Difficolta = Field(ge=1, le=5)
    immagine_copertina: Optional[str] = None
    video: Optional[str] = None
    racconto: Optional[str] = None
    strumenti: list[str] = Field(default_factory=list)
    scalabile: bool = True
    nota_scalabilita: Optional[str] = None
    ingredienti: list[Ingrediente]
    passi: list[Passo] = Field(default_factory=list)
    corpo_markdown: Optional[str] = None

    @field_validator("difficolta")
    @classmethod
    def valida_step_difficolta(cls, v: float) -> float:
        if (v * 2) != int(v * 2):
            raise ValueError("difficolta deve essere un multiplo di 0.5 (es. 1, 1.5, 2, ..., 5)")
        return v


class RicettaIn(RicettaCreateRequest):
    """Modello completo, pronto per la serializzazione su file: aggiunge i campi
    assegnati server-side."""

    autore: str
    data_inserimento: date
