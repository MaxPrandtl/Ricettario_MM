# Ricettario — CLAUDE.md

Guida di progetto per chi (o cosa) riprende lo sviluppo. Le decisioni qui dentro sono
**vincoli confermati**, non suggerimenti da ridiscutere senza motivo — tranne dove
esplicitamente marcate come aperte. Se una sezione è in contraddizione col codice
effettivo, il codice vince e questo file va aggiornato.

Fonte originale delle decisioni: [ricettario-project-brief.md](ricettario-project-brief.md)
(mantenuto come riferimento storico, non duplicare le stesse informazioni altrove).

Repo GitHub pubblico: https://github.com/MaxPrandtl/Ricettario_MM

## Stato del progetto

**Fase attuale: prima iterazione funzionante end-to-end.** Backend e generatore
statico sono reali e verificati, non solo bozze. Restano da fare: deploy (sito e
backend ancora solo locali), editor grafico di inserimento ricette nel sito,
PWA/stampa.

**Fatto finora:**
- Scheletro dati in `/content`: `tags.yaml` + `strumenti.yaml` (tassonomie
  canoniche) + 4 ricette d'esempio eterogenee — `tiramisu-al-caffe.md` (caso
  completo, scaling con tutte le forme di `scala`), `ragu-della-domenica.md`
  (caso "orale": racconto + video, senza procedimento scritto), `bruschette-
  pomodoro-basilico.md` (caso minimo), `torta-di-mele.md` (`scalabile: false`).
- **Backend** (`/backend`, FastAPI + PyGithub): login username/PIN (bcrypt, profili
  in `profili.yaml` locale non versionato) + `POST /recipes` che valida
  tag/strumenti contro le tassonomie e scrive una ricetta vera sul repo GitHub
  pubblico via Contents API, con autore/data assegnati **server-side** dal
  profilo autenticato (mai dal client). Verificato end-to-end contro il repo
  reale: creazione, conflitto di slug (409), tag sconosciuto (422), credenziali
  errate (401), autore del commit correttamente attribuito al profilo (non
  all'account del token). Non ancora deployato: gira solo in locale
  (`uvicorn app.main:app`), raggiungibile solo dalla stessa macchina.
- **Generatore sito** (Eleventy 3.x + Nunjucks, root del repo `eleventy.config.js`
  + `package.json`, template in `/site`): pagina singola per ogni ricetta
  (`/ricette/<id>/`) più una pagina indice (`/`) con ricerca (titolo+tag+
  ingredienti) e filtri (categoria, difficoltà, tempo, strumenti esclusi) calcolati
  lato client su un indice JSON generato in build (`/ricette-index.json`) — nessun
  backend coinvolto nella ricerca. `content/ricette/*.md` è letto a mano
  (gray-matter) perché sta fuori dalla input dir di Eleventy: il meccanismo nativo
  `collectionApi.getFilteredByGlob` filtra solo template già scoperti sotto
  `input`, non fa una scansione filesystem indipendente (verificato leggendo il
  sorgente del pacchetto). CSS estratto dalle bozze in un unico foglio condiviso.
  Verificato con build reale: tutte le combinazioni di scaling (lineare, fisso,
  moltiplicatore, scaglioni) corrette nell'HTML prodotto — corretto anche un bug
  della bozza originale che non gestiva affatto `scala: fisso`. Non ancora
  deployato: si avvia in locale con `npm run dev` (http://localhost:8080).
- Bozze visive originali in `/site/preview` mantenute come archivio storico, non
  più la fonte di verità per lo stile (quel ruolo è ora del CSS/template in `/site`).
- **Editor grafico** (`/nuova-ricetta/`, `site/pages/nuova-ricetta.njk` +
  `site/assets/js/editor.js`): login (username+PIN) integrato nella stessa pagina,
  form dinamico (righe ingrediente/passo aggiungibili/rimovibili via
  `<template>` clonati) con controllo completo su tutte e 4 le forme di `scala`
  per ogni ingrediente (lineare/fisso/moltiplicatore/scaglioni, con select +
  sotto-controllo condizionale). Token di sessione solo in memoria JS (mai
  `localStorage`): un refresh riporta al login.
- **Modifica ricette esistenti**: stessa pagina editor, query string
  `?modifica=<id>` (link "✎ Modifica questa ricetta" in ogni pagina ricetta) —
  precompila l'intero form via `GET /recipes/{id}` (autenticato, legge da
  GitHub). Backend: `PUT /recipes/{id}` gestisce lo sha per rilevare conflitti
  di scrittura concorrente (409 `concurrent_edit`), preserva `data_inserimento`
  dall'originale (data di prima creazione, mai resettata da una modifica),
  riassegna sempre `autore` al profilo che sta modificando.
- **Bozze**: nessun campo di stato nello schema — il path stesso è lo stato
  (`content/bozze/{id}.md` vs `content/ricette/{id}.md`, quest'ultima l'unica
  letta dal generatore). Query param `?stato=bozza|pubblicata` su create/update;
  `POST /recipes/{id}/pubblica` sposta bozza→pubblicata (leggi, scrivi altrove,
  cancella l'originale). Due bottoni nel form ("Salva bozza"/"Pubblica"), il
  terzo diventa "Salva modifiche" quando si modifica una ricetta già pubblicata.
- **Anteprima**: bottone che genera una vera build Eleventy della ricetta in
  corso di compilazione e apre il risultato in una nuova scheda — stesso
  HTML/CSS/layout del sito reale, zero riproduzione approssimata (vedi
  sezione "Strumenti di sviluppo locale (dev-tools)" sotto per i dettagli).
- **Difficoltà**: scala numerica 1-5 a step 0.5 (non più facile/medio/
  difficile), mostrata come icone "padella" 🍳 piene/mezza/vuote (filtro
  Nunjucks `difficoltaIcone`, la mezza resa via CSS non Unicode). Filtro di
  ricerca a range numerico (due `<select>` Da/A). Le 4 ricette d'esempio
  convertite (facile→1.5, medio→3).
- **Tag/strumenti liberi**: oltre alle checklist, un campo testo libero per
  categoria e per strumenti. Il backend normalizza (case-insensitive/trim) e
  risolve alla forma canonica esistente se il match c'è; se il valore è
  genuinamente nuovo lo aggiunge a `tags.yaml`/`strumenti.yaml` (gruppo
  "personalizzati") in un commit separato, **prima** di quello della ricetta,
  preservando i commenti editoriali del file (mai un giro yaml.dump).
- **Tempi flessibili**: selettore min/sec accanto a tempo preparazione, tempo
  cottura, e timer di ogni passo — conversione lato client solo al momento
  dell'invio, lo schema dati resta sempre minuti (tempi ricetta) e secondi
  (timer passo). Nuova cella "Totale" (prep+cottura) nella pagina ricetta.
- **Riordino pagina ricetta**: copertina → statistiche → ingredienti →
  strumenti → procedimento → note (strumenti spostato da prima a dopo
  ingredienti).

Verificato end-to-end via API diretta contro GitHub reale: creazione come
bozza, lettura, pubblicazione (bozza→ricette, con verifica che la bozza sia
rimossa), modifica di ricetta pubblicata con preservazione data_inserimento,
tag/strumento scritti con maiuscola diversa risolti alla forma canonica senza
duplicati, tag genuinamente nuovo aggiunto a `tags.yaml` in commit separato,
id_mismatch (422), ricetta inesistente (404), tutte le combinazioni di
`difficoltaIcone` ai valori limite (1, 5, con e senza mezza). Non verificata
da un browser reale l'interazione DOM/JS (righe dinamiche, precompilazione
visuale, modal anteprima) — solo la logica e il contratto dati, identici a
quanto un browser produrrebbe.

**Porte fisse in sviluppo locale** (convenzione, non configurabile da env per
ora): backend FastAPI su `http://localhost:8000`, sito Eleventy su
`http://localhost:8080`. Il backend ha CORS abilitato solo per quell'origin
esplicita (non wildcard, dato che si manda `Authorization: Bearer`) — va
rivisto quando si fa il deploy.

**Strumenti di sviluppo locale (dev-tools)**: due funzionalità dell'editor che
eseguono comandi di sistema (`git`, `npx`) dal backend, dietro il flag
`LOCAL_DEV_TOOLS_ENABLED` (default `false` — se assente/`false`, le route
`/dev/*` non esistono nemmeno, `backend/app/routers/dev_tools.py`):
- **"⟳ Aggiorna sito locale"** (`POST /dev/pull`): esegue `git pull` sulla
  working copy — serve perché il dev server Eleventy (`npm run dev`) non
  osserva `content/` in automatico (nessun `addWatchTarget`, i file ricetta
  sono letti a mano via `fs.readFileSync`, fuori dal grafo di dipendenze che
  Eleventy traccia da solo). Mai operazioni distruttive se il pull fallisce
  (niente `--force`/`reset --hard`).
- **Anteprima reale** (`POST /dev/anteprima`): scrive i dati del form in
  `content/_anteprima/current.md` (gitignored, mai una ricetta vera) con lo
  stesso `render_recipe_markdown` usato per create/update, poi invoca `npx
  eleventy` one-off (build normale, non `--watch`) puntata alla stessa
  `_site/` già servita dal dev server. La pagina fissa `/anteprima/`
  (`site/pages/anteprima.njk` + `anteprima.11tydata.js`) riusa **lo stesso
  layout `layouts/ricetta.njk`** della pagina pubblica — zero duplicazione di
  markup tra sito e anteprima. L'editor apre l'URL risultante in una nuova
  scheda (non un iframe/modal, per evitare problemi di origine incrociata
  tra le porte 8000/8080).

Nota da rivedere al deploy: `/anteprima/` esisterà anche in un'eventuale
build di produzione futura (il file sorgente è gitignored quindi in un
checkout CI pulito la pagina renderizza solo il suo placeholder vuoto —
innocuo, ma da escludere esplicitamente se si vuole essere rigorosi).

**Prossimo passo:** deploy di backend e sito (Render/Railway per il backend,
GitHub Pages per il sito, come da brief) — finché resta tutto locale, l'editor
è utilizzabile solo dalla stessa macchina con entrambi i server avviati.

## Obiettivo del progetto

Ricettario di famiglia con ricette testuali + video + foto dei passaggi, consultabile
come sito/app da telefono, stampabile e rilegabile fisicamente. Sorgente dati su
GitHub.

## Decisioni prese

### Struttura repository
**Monorepo**, un solo repo Git con sottocartelle separate per dominio (man mano che si
inizia a scrivere codice):
```
/content   → ricette pubbliche (markdown + YAML), tags.yaml
/site      → generatore statico (Eleventy) e template
/backend   → API Python (form di inserimento/modifica, auth, scrittura su GitHub)
```
Motivo: più semplice da gestire in questa fase; si può sempre separare in repo
multipli più avanti se i confini pubblico/privato lo richiedono davvero.

### Dati delle ricette: file, non database relazionale
Un file markdown con frontmatter YAML per ricetta — non un DB relazionale/NoSQL
classico. È la scelta giusta per questo caso anche se il volume crescerà, perché:
- il contenuto è per natura testo strutturato (ricetta = campi + testo libero), non
  righe di tabella con query relazionali complesse;
- git dà gratis versionamento, storico autore/data e backup — perdere una ricetta per
  errore è sempre recuperabile dalla history;
- tag/filtri/indici (per categoria, difficoltà, tempo, ecc.) si **generano in fase di
  build** dal generatore statico leggendo tutti i file — non servono query a runtime;
- resta leggibile e modificabile anche a mano, senza strumenti speciali.

Un DB vero (Postgres/SQLite) diventerebbe necessario solo se in futuro servissero
query dinamiche lato server (es. ricerca full-text avanzata, utenti con dati privati
non versionabili) — non è il caso ora, da rivalutare se emerge un bisogno concreto.

**Media (foto/video)**: mai nel repo. Storage esterno (Cloudflare R2 / Backblaze B2 /
YouTube per i video); il repo contiene solo URL. Motivo: repo git non è fatto per
binari pesanti, e la history li accumulerebbe per sempre anche se sostituiti.

**Google Drive valutato e scartato come storage media** (confermato dall'utente): Drive
è pensato per file personali/condivisi, non per servire immagini/video pubblicamente
su un sito ad alto traffico — link diretti meno immediati dei link di condivisione
normali, limiti di traffico legati all'account personale. Resta R2/B2 come da brief
originale.

Schema di riferimento per un file ricetta: vedi
[ricettario-project-brief.md](ricettario-project-brief.md#schema-di-una-ricetta-un-file-per-ricetta)
per la base, **integrata dai due campi sotto** (`strumenti` e lo scaling per
ingrediente) — il brief non li conteneva ancora, questo file è la versione
aggiornata. Punti fermi: `id`/slug stabile come nome file (mai il titolo, che può
cambiare); quantità come numero + unità separati (mai stringa libera tipo "300 g");
tempi in minuti, interi.

### Strumenti di cucina non comuni
Ogni ricetta può dichiarare gli strumenti "non scontati" che richiede (bimby,
impastatrice, frullatore a immersione, ecc.) — non pentole/coltelli/forno, quelli si
danno per scontati. Motivo: non lasciare nulla al caso a chi cucina, chi non ha un
bimby deve saperlo prima di iniziare, non a metà ricetta.

Stesso meccanismo dei tag: lista canonica in `content/strumenti.yaml`, validata dal
backend, estendibile proponendo l'aggiunta invece di crearne varianti silenziose.
Campo nel frontmatter:
```yaml
strumenti: [bimby, "frullatore a immersione"]   # opzionale, [] o assente se nessuno
```
A differenza dei tag (che filtrano per "cosa cucino"), gli strumenti sono pensati per
filtrare per "cosa posso cucinare con l'attrezzatura che ho" — es. "solo ricette senza
bimby". **Fin da subito trattati come filtrabili**, non solo informativi in pagina:
l'implementazione del filtro vera e propria resta parte della decisione aperta su
ricerca/navigazione (vedi sotto), ma il dato va strutturato per quello fin da ora.

**Idea futura (non decisa, non implementata):** l'utente ha suggerito che i nomi di
strumenti specifici (es. "bimby") potrebbero in futuro diventare link di affiliazione
verso i produttori — un'idea "simpatica" ma non banale: comporta obblighi di
disclosure pubblicitaria (in UE/Italia la sponsorizzazione va dichiarata
esplicitamente) e cambia la natura di un progetto finora no-profit/familiare. Lo
schema dati attuale (`strumenti: [bimby, ...]` come stringhe semplici) è comunque
compatibile con questo scenario — se attivato in futuro cambierebbe solo come il sito
*renderizza* quel valore (es. wrapping in un link), non il dato stesso. Da
riprendere con l'utente come discussione a sé, non bloccante per lo sviluppo attuale.

### Scaling delle porzioni

**Livello 1 — interruttore generale per ricetta.** Alcune ricette non sono scalabili
affatto, non a livello di singolo ingrediente ma nel loro complesso: una torta in
teglia da 24 cm cambiata di dose non è la stessa ricetta con numeri diversi — cambiano
teglia, tempi di cottura, tecnica. Forzare uno scaling automatico in questi casi
sarebbe fuorviante quanto non offrirlo affatto. Campo nel frontmatter, a discrezione
di chi inserisce la ricetta (non dedotto automaticamente da nient'altro):

```yaml
scalabile: false                  # default: true se assente
nota_scalabilita: "Ricetta pensata per una teglia da 24 cm: raddoppiando le dosi
  cambiano tempo di cottura e tecnica, non è un semplice ×2. Per una teglia più
  grande serve una ricetta a sé, non ancora presente nel ricettario."
```

- `scalabile: false` → **nasconde del tutto** il selettore porzioni in pagina. Niente
  scorciatoie automatiche: le dosi mostrate sono solo quelle di `porzioni_base`.
- `nota_scalabilita` → testo libero, **facoltativo**, mostrato al posto del selettore.
  Utile per rimandare a una variante già nota (es. "per una teglia più grande vedi la
  ricetta X"), non per calcolare nulla — resta testo scritto da chi conosce la ricetta,
  mai generato.
- Se `scalabile` è assente, si assume `true` e valgono le regole per-ingrediente sotto
  (Livello 2) — compatibile con tutte le ricette d'esempio già esistenti.

**Livello 2 — regola per singolo ingrediente**, solo per ricette scalabili. Anche
quando la ricetta nel suo insieme si può scalare, **non tutti gli ingredienti scalano
linearmente** — il sale "q.b." non si scala affatto, un aroma spesso scala meno che
proporzionalmente. La regola giusta **dipende dalla ricetta e dall'ingrediente
specifico**, non è un'unica modalità globale valida ovunque (confermato dall'utente).

Modello scelto: **lineare per default, con eccezione esplicita per singolo
ingrediente quando serve.** Ogni riga di `ingredienti` può includere un campo opzionale
`scala`:

```yaml
ingredienti:
  - nome: "farina"
    quantita: 300
    unita: g
    # nessun campo `scala` → default: lineare (regola del 3 su porzioni_base)

  - nome: "sale"
    quantita: null
    unita: "q.b."
    scala: fisso              # non cambia mai, qualunque siano le porzioni

  - nome: "peperoncino"
    quantita: 1
    unita: pz
    scala: 0.5                # scala, ma a metà rapporto rispetto alle porzioni
                               # (numero = moltiplicatore applicato al fattore di scala lineare)

  - nome: "uova"
    quantita: 4
    unita: pz
    scala:                    # scaglioni espliciti, per quando né lineare né fisso
      "1-2": 2                # è corretto (es. non ha senso "2.66 uova")
      "4-6": 4
      "8": 6
```

Tre forme ammesse per `scala`, in ordine di complessità crescente — assente/`lineare`
copre la maggioranza dei casi, le altre due sono l'eccezione dichiarata quando serve:
1. **assente** (default) o `lineare` — regola del 3 su `porzioni_base`.
2. `fisso` — quantità identica per qualunque numero di porzioni.
3. **numero** (es. `0.5`, `1.5`) — scala linearmente ma con un moltiplicatore diverso
   da 1 applicato al fattore di scala (utile per aromi/spezie che "pesano" meno del
   piatto principale).
4. **mappa di scaglioni** (chiavi tipo `"1-2"`, `"4-6"`, `"8"`) — per ingredienti a
   unità intere dove l'arrotondamento lineare darebbe risultati assurdi (es. mezzo
   uovo). Chi inserisce la ricetta scrive gli scaglioni solo per gli ingredienti che
   ne hanno davvero bisogno.

Il calcolo dello scaling avviene lato client (JS) sulla pagina già renderizzata, non
in build — servono tutte le combinazioni 1/2/4/6/8 disponibili istantaneamente senza
rigenerare pagine per ogni combinazione porzioni × ricetta.

### Tag / categorie
Niente cartelle per macro-categoria (una ricetta appartiene spesso a più categorie).
Tag multipli per ricetta, validati dal backend contro una lista canonica in
`tags.yaml`. Se un tag non esiste, si propone di aggiungerlo — mai crearne varianti
silenziose (refusi, maiuscole/minuscole, sinonimi).

### Repo pubblico: cosa significa in pratica
Confermato **pubblico** per il repo delle ricette. Chiarimento importante: pubblico su
GitHub significa **leggibile da chiunque, ma scrivibile solo da collaboratori
autorizzati** (push/merge). Chi non è collaboratore può al massimo proporre una pull
request, che va approvata esplicitamente. Cancellazioni o errori non sono distruttivi:
git conserva la history, quindi tutto è recuperabile dai commit precedenti.

Le **credenziali non vanno mai nel repo pubblico** (vedi sotto) — è quello l'unico dato
davvero sensibile in gioco, non le ricette in sé.

### Generatore statico: Eleventy (11ty)
Scelto tra le opzioni valutate (Hugo, Eleventy, Next.js static export). Motivi:
- legge nativamente markdown + frontmatter YAML, lo stesso formato dello schema
  ricette — zero conversioni;
- curva di apprendimento dolce, anche venendo da un background Python/non-JS;
- leggero, buon supporto per generare indici/tag/filtri in build e per un layout di
  stampa separato (`@print` CSS).

Resta da fare in fase di sviluppo: struttura dei template Eleventy, scelta del motore
di templating (Nunjucks è la scelta di default consigliata con 11ty).

### Grafica del sito
Nessun editor drag-and-drop esterno stile Webflow/Framer: questi strumenti assumono
contenuto inserito a mano nel loro editor, e si integrano male con un sito
**generato automaticamente** da centinaia di file ricetta versionati su GitHub —
sarebbe un sistema parallelo da tenere sincronizzato a mano, fonte di disallineamenti.

Approccio scelto: **design curato in codice, iterato in linguaggio naturale.** Si
parte da una bozza concreta (vedi "Fatto finora" sopra); l'utente la vede renderizzata
e chiede modifiche puntuali ("più spazio qui", "colore più caldo", ecc.) senza dover
imparare un editor esterno. Palette colori e stile ("accattivante", da definire nel
dettaglio) si fissano a partire da quella bozza, non in astratto prima di vederla.

**Tema chiaro/scuro**: selettore esplicito nella UI (non solo `prefers-color-scheme`).
Alla primissima visita segue le impostazioni del browser/sistema; se l'utente sceglie
esplicitamente chiaro o scuro, la scelta si salva (`localStorage`) e vince su tutte le
visite successive, anche se il sistema cambia tema nel frattempo.

### Backend
- **Linguaggio: Python** (scelto per familiarità).
- Stack: **FastAPI** (validazione dati) + **PyGithub** (scrittura su GitHub Contents
  API).
- Hosting: Render o Railway (piano gratuito/economico, sempre attivo — evitare
  serverless Python di Vercel per via dei cold start).
- Responsabilità:
  1. Form di inserimento/modifica ricetta
  2. Validazione tag contro `tags.yaml`
  3. Login (username + PIN) contro profili statici
  4. Scrittura/aggiornamento file ricetta su GitHub via Contents API, gestendo lo SHA
     corrente per evitare conflitti di scrittura concorrente
  5. Firma del commit con il nome autore del profilo che ha fatto la modifica

### Autenticazione / profili
- Profili **statici**, aggiunti manualmente dal proprietario del progetto: nome
  autore, username, PIN.
- **PIN sempre hashato** (bcrypt/argon2), mai in chiaro.
- **Credenziali mai nel repo pubblico delle ricette** — storage privato separato (repo
  privato o KV/env var lato backend). Un repo pubblico è leggibile da chiunque e la
  history git non dimentica nulla anche se un file viene poi modificato.
- Storico modifiche ottenuto "gratis" da git (ogni commit tracciato con autore e data).

### Sito e aggiornamento
- Statico con rebuild automatico via **GitHub Actions** a ogni push, pubblicato su
  GitHub Pages. Ritardo tipico di aggiornamento pubblico: 1-2 minuti dopo un salvataggio.
- La pagina di modifica mostra un'**anteprima immediata** del salvataggio (dato già
  disponibile lato backend, non serve aspettare il rebuild).

### App da telefono
PWA (installabile, offline) generata dallo stesso sito. Piena funzionalità su Android;
su iOS limitazioni Apple note (niente presenza App Store, notifiche push limitate).
Una vera app sugli store richiederebbe un wrapper (es. Capacitor) + account sviluppatore
Apple (99$/anno) + revisione — passo successivo, non bloccante per il resto.

**Chiarito con l'utente:** l'app mobile citata qui è per la *consultazione* delle
ricette. Un'app mobile per *inserire/modificare* ricette (non solo leggerle) è stata
proposta e **confermata come passo successivo, non anticipato** — per ora l'editor
web (vedi sezione Backend sotto) copre anche l'uso da telefono, essendo responsive e
raggiungibile da browser mobile senza bisogno di un'app dedicata.

### Stampa / rilegatura
Layout separato (CSS `@print` o PDF via Pandoc/LaTeX) generato dagli stessi file
sorgente delle ricette. Da sviluppare per ultimo.

## Decisioni ancora aperte

1. **Stile visivo definitivo** (palette, font, tono) — bozza iniziale già pubblicata
   (vedi "Fatto finora"), in iterazione con l'utente. Non ancora congelato.
2. **Navigazione/scoperta tra molte ricette.** Un elenco piatto (menu, lista di link)
   non scala oltre poche ricette — con centinaia di ricette serve un sistema di
   ricerca + filtri (es. per tag, tempo, difficoltà) e/o menu a tendina per categoria,
   non ancora progettato. La bozza attuale (`indice.html`) mostra solo un placeholder
   visivo di dove andranno ricerca/filtri, senza logica reale: è un segnaposto, non
   una proposta di soluzione. Da disegnare come passo dedicato, probabilmente insieme
   alla scelta del motore di templating Eleventy (serve sapere se i filtri sono
   calcolati in build — pagine statiche pre-filtrate — o via JS lato client su un
   indice JSON generato in build).
3. Se, dopo aver visto le bozze, serva comunque uno strumento visuale in più oltre
   all'iterazione in linguaggio naturale — e quale, compatibile con un sito
   auto-generato (es. editor di temi limitato, non un builder generico).
4. Motore di templating Eleventy (default consigliato: Nunjucks) e struttura cartelle
   di `/site`.
5. "Aggiornamento istantaneo" del sito pubblico (oltre all'anteprima già prevista lato
   backend) — non richiesto esplicitamente finora, verificare col committente prima di
   costruire qualcosa di più complesso del rebuild in 1-2 minuti.

## Ordine di sviluppo consigliato

1. ~~Scheletro repo pubblico: struttura cartelle `/content`, `tags.yaml`, ricette
   d'esempio.~~ Fatto.
2. ~~Bozza visiva di una pagina ricetta~~ Fatto — vedi "Fatto finora".
3. ~~Struttura di navigazione/ricerca tra ricette.~~ Fatto: ricerca+filtri lato
   client su indice JSON, vedi "Fatto finora".
4. ~~Generatore statico Eleventy che legge `/content` e produce il sito.~~ Fatto,
   verificato in locale.
5. ~~Backend Python (`/backend`): validazione tag, login, scrittura via Contents
   API.~~ Fatto, verificato end-to-end contro GitHub reale.
6. ~~Editor grafico di inserimento ricette nel sito~~ Fatto per la creazione
   (solo locale). La modifica di ricette esistenti non è ancora implementata
   (il backend espone solo `POST /recipes`, non un update).
7. Deploy: backend su Render/Railway, sito su GitHub Pages con rebuild via GitHub
   Actions — prossimo passo concreto.
8. PWA e generazione PDF stampabile — in coda, non bloccanti.

## Convenzioni per chi lavora su questo repo

- Non introdurre un database relazionale "perché sarebbe più solido" senza che sia
  emerso un bisogno concreto — vedi motivazione sopra.
- Non proporre editor visuali drag-and-drop generici (Webflow, Framer, ecc.): sono
  stati scartati per incompatibilità con un sito data-driven generato da file
  versionati.
- Mai committare credenziali, PIN in chiaro, o media binari pesanti nel repo delle
  ricette.
- Ogni nuova decisione presa va aggiunta a questo file (sezione "Decisioni prese"),
  spostandola fuori da "Decisioni ancora aperte" se applicabile.
