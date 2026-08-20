"""Configurazione applicativa, letta da backend/.env.

Fail-fast: se mancano variabili obbligatorie, l'app non si avvia — meglio un
errore chiaro allo startup che un 500 confuso alla prima richiesta.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    github_token: str
    github_repo: str
    content_dir: str = "../content"
    local_dev_tools_enabled: bool = False  # git pull + anteprima via build Eleventy —
    # SOLO sviluppo locale, mai in produzione. Vedi routers/dev_tools.py.

    @property
    def content_path(self) -> Path:
        """Path assoluto della cartella content/, risolto relativamente a backend/
        (mai un path assoluto Windows hardcoded — portabile su altri ambienti/deploy)."""
        p = Path(self.content_dir)
        if not p.is_absolute():
            p = (BACKEND_DIR / p).resolve()
        return p

    @property
    def profili_path(self) -> Path:
        return BACKEND_DIR / "profili.yaml"


settings = Settings()
