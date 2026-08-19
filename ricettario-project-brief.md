# Ricettario — Brief di progetto

Contesto per chi (o cosa) riprende lo sviluppo: decisioni prese finora, da trattare come vincoli, non come suggerimenti da ridiscutere senza motivo.

## Obiettivo
Ricettario con ricette testuali + video + foto dei passaggi, visualizzabile come sito/app da telefono, stampabile e rilegabile fisicamente. Sorgente dati su GitHub.

## Architettura generale
- **Repo ricette**: pubblico su GitHub. Contiene solo testo/metadati (markdown + YAML frontmatter), mai media pesanti.
- **Media (foto/video)**: storage esterno (es. Cloudflare R2 / Backblaze B2 / YouTube per i video). Il repo contiene solo URL, mai i file binari.
- **Sito**: generazione statica (generatore da scegliere — vedi "Decisioni aperte") + **GitHub Actions** che ricostruisce e pubblica su GitHub Pages a ogni push. Statico ≠ mai aggiornato: il rebuild automatico aggiorna il sito in ~1-2 minuti da ogni modifica.
- **App da telefono**: PWA (installabile, funziona offline) generata dallo stesso sito. Su Android piena funzionalità; su iOS Apple limita le PWA (niente presenza App Store, notifiche push limitate). Per una vera app sugli store serve un wrapper (es. Capacitor) + account sviluppatore Apple (99$/anno) + revisione — passo successivo, non bloccante per il resto.
- **Stampa/rilegatura**: layout separato (CSS `@print` o PDF via Pandoc/LaTeX) generato dagli stessi file sorgente delle ricette. Da sviluppare per ultimo.

## Backend
- **Linguaggio: Python** (scelto per familiarità, JS/Node è terreno nuovo).
- Stack proposto: **FastAPI** (validazione dati) + **PyGithub** (scrittura su GitHub Contents API).
- Hosting proposto: Render o Railway (piano gratuito/economico, sempre attivi — evitare funzioni serverless Python di Vercel per i cold start).
- Compiti del backend:
  1. Ricevere il form di inserimento/modifica ricetta
  2. Validare i tag contro `tags.yaml` (vedi sotto)
  3. Gestire login (username + PIN) contro i profili statici
  4. Scrivere/aggiornare il file della ricetta su GitHub via Contents API, gestendo lo SHA corrente per evitare conflitti di scrittura concorrente
  5. Firmare il commit con il nome autore del profilo che ha fatto la modifica

## Autenticazione / profili
- Profili **statici**, aggiunti manualmente dal proprietario del progetto: nome autore, username, PIN.
- **PIN sempre hashato** (bcrypt/argon2), mai in chiaro.
- **Credenziali MAI nel repo pubblico delle ricette** — repo pubblico per le ricette, storage privato separato (repo privato o KV/env var lato backend) per le credenziali. Motivo: un repo pubblico su GitHub è leggibile da chiunque, e la cronologia git non dimentica nulla anche se il file viene poi modificato.
- Storico modifiche/note ottenuto "gratis" grazie a git (ogni commit è tracciato con autore e data).

## Tag / categorie
- Niente cartelle per macro-categoria (una ricetta appartiene spesso a più categorie insieme).
- **Tag multipli per ricetta**, indicizzati per i filtri del sito.
- Lista **canonica** in `tags.yaml` nel repo: il backend valida ogni tag inserito contro questa lista, propone di aggiungerlo se non esiste invece di crearlo silenziosamente con varianti diverse (refusi, maiuscole/minuscole, sinonimi).
- Tassonomia estendibile nel tempo, senza bisogno di modificare schema o codice.

## Schema di una ricetta (un file per ricetta)

```yaml
---
id: tiramisu-al-caffe
titolo: "Tiramisù al caffè"
categorie: [dolce, senza cottura]
tempo_preparazione_min: 30
tempo_cottura_min: 0
porzioni_base: 6
difficolta: facile            # facile | medio | difficile
autore: "nome autore"
data_inserimento: 2026-08-17
immagine_copertina: "URL storage esterno"
video: "URL esterno (opzionale)"
racconto: null                 # storytelling opzionale, a scelta di chi inserisce
ingredienti:
  - nome: "savoiardi"
    quantita: 300
    unita: g
passi:
  - numero: 1
    testo: "..."
    foto: "URL storage esterno"
    timer_sec: null
---
Note libere, varianti.
```

Punti fermi sullo schema:
- `id`/slug stabile come nome file (non il titolo, che può cambiare)
- quantità: numero + unità separati (mai stringa libera tipo "300 g")
- tempi in minuti, interi

## Editing / aggiornamento in tempo reale
- Il sito pubblico resta statico con rebuild automatico (1-2 min di ritardo dopo un salvataggio).
- La pagina di modifica mostra un'**anteprima immediata** del salvataggio (dato già disponibile lato backend, non serve aspettare il rebuild).
- **Aperto**: se serve un aggiornamento istantaneo anche per chi guarda il sito senza modificare nulla (non ancora richiesto esplicitamente — verificare col committente prima di costruire qualcosa di più complesso).

## Decisioni ancora aperte
1. Generatore statico: Hugo vs Eleventy vs Next.js (static export) — da scegliere
2. Repo pubblico vs privato per le ricette: confermato **pubblico**
3. Ordine di sviluppo consigliato:
   1. Scheletro repo pubblico (struttura cartelle, `tags.yaml`, 2-3 ricette d'esempio)
   2. Generatore statico che le legge e produce il sito
   3. Backend Python (validazione tag, login, scrittura via Contents API)
   4. PWA e generazione PDF stampabile (in coda, non bloccanti)
