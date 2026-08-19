"""Wrapper sottile su PyGithub: non conosce nulla di ricette/Pydantic, riceve solo
path/contenuto/messaggio/autore e parla con la Contents API.

`update_file` accetta uno `sha` esplicito fin da questa versione anche se nessun
router lo usa ancora — è la base naturale per l'update di ricette esistenti in
futuro, senza dover rifare il client.
"""
from dataclasses import dataclass

from github import Github, GithubException, InputGitAuthor
from github.ContentFile import ContentFile

from app.config import settings


@dataclass
class CommitResult:
    commit_sha: str
    commit_url: str


class GithubClient:
    def __init__(self, token: str, repo_full_name: str):
        self._gh = Github(token)
        self._repo = self._gh.get_repo(repo_full_name)
        self.repo_full_name = repo_full_name

    def file_exists(self, path: str) -> bool:
        try:
            self._repo.get_contents(path)
            return True
        except GithubException as e:
            if e.status == 404:
                return False
            raise

    def get_file_sha(self, path: str) -> str | None:
        try:
            content = self._repo.get_contents(path)
            if isinstance(content, list):
                raise ValueError(f"{path} è una directory, non un file")
            return content.sha
        except GithubException as e:
            if e.status == 404:
                return None
            raise

    def get_file_content(self, path: str) -> str | None:
        """Ritorna il contenuto testuale decodificato del file, o None se non
        esiste. Usato da GET /recipes/{id} e da PUT /recipes/{id} (per
        recuperare data_inserimento dall'originale) e dalla logica di
        pubblicazione bozze/tassonomia libera."""
        try:
            content = self._repo.get_contents(path)
            if isinstance(content, list):
                raise ValueError(f"{path} è una directory, non un file")
            return content.decoded_content.decode("utf-8")
        except GithubException as e:
            if e.status == 404:
                return None
            raise

    def create_file(
        self,
        path: str,
        content: str,
        message: str,
        author_name: str,
        author_email: str,
    ) -> CommitResult:
        author = InputGitAuthor(author_name, author_email)
        result = self._repo.create_file(
            path=path,
            message=message,
            content=content,
            author=author,
            committer=author,
        )
        commit = result["commit"]
        return CommitResult(commit_sha=commit.sha, commit_url=commit.html_url)

    def update_file(
        self,
        path: str,
        content: str,
        message: str,
        sha: str,
        author_name: str,
        author_email: str,
    ) -> CommitResult:
        """Non ancora usata da nessun router — pronta per il futuro endpoint di
        modifica ricette esistenti (gestisce lo sha per evitare conflitti di
        scrittura concorrente, come da CLAUDE.md)."""
        author = InputGitAuthor(author_name, author_email)
        result = self._repo.update_file(
            path=path,
            message=message,
            content=content,
            sha=sha,
            author=author,
            committer=author,
        )
        commit = result["commit"]
        return CommitResult(commit_sha=commit.sha, commit_url=commit.html_url)

    def delete_file(
        self,
        path: str,
        message: str,
        sha: str,
        author_name: str,
        author_email: str,
    ) -> None:
        """Usata dal flusso di pubblicazione bozze: rimuove il file da
        content/bozze/ dopo averlo ricreato in content/ricette/."""
        author = InputGitAuthor(author_name, author_email)
        self._repo.delete_file(
            path=path,
            message=message,
            sha=sha,
            author=author,
            committer=author,
        )


def get_github_client() -> GithubClient:
    """Dependency FastAPI — istanzia il client a ogni richiesta. Per il volume
    d'uso previsto (familiare, bassa frequenza) il costo è trascurabile; se
    servisse ottimizzare si può cachare con functools.lru_cache in futuro."""
    return GithubClient(settings.github_token, settings.github_repo)
