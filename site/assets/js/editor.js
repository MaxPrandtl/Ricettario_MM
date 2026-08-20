// Editor "Nuova ricetta": login + form dinamico + submit verso il backend.
// Gestisce sia la creazione di ricette nuove sia la modifica di ricette
// esistenti (query string ?modifica=<id>), bozze/pubblicazione, anteprima.
// Stile coerente col resto del progetto (vedi theme.js/search.js): IIFE,
// vanilla JS, fetch().then() a catena, niente dipendenze esterne.
(function () {
  var API_BASE = 'http://localhost:8000';

  var loginView = document.getElementById('login-view');
  if (!loginView) return; // non siamo sulla pagina editor

  var recipeView = document.getElementById('recipe-view');
  var successView = document.getElementById('success-view');

  // Token SOLO in memoria di modulo, mai localStorage: scade in 1h lato
  // server e le sessioni non sopravvivono comunque a un riavvio del backend
  // — persisterlo darebbe una falsa sensazione di sessione salvata che poi
  // fallisce silenziosamente al primo submit dopo la riapertura. Un refresh
  // pagina riporta sempre al login, accettato come corretto per un editor
  // ad uso familiare breve e mirato.
  var session = null;

  // Modalità crea (null) o modifica (id della ricetta), letta dalla query
  // string. Stessa pagina per entrambe: il form è identico, cambia solo
  // precompilazione ed endpoint/verbo del submit.
  var params = new URLSearchParams(window.location.search);
  var modificaId = params.get('modifica');
  var recipeStatoOriginale = null; // 'bozza' | 'pubblicata' | null, popolato dopo il GET

  var ingList = document.getElementById('ingredienti-list');
  var ingTemplate = document.getElementById('ingrediente-row-template');
  var scaglioneTemplate = document.getElementById('scaglione-row-template');
  var passiList = document.getElementById('passi-list');
  var passoTemplate = document.getElementById('passo-row-template');

  // ---------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------
  function handleLogin(e) {
    e.preventDefault();
    var username = document.getElementById('login-username').value.trim();
    var pin = document.getElementById('login-pin').value;
    var errorEl = document.getElementById('login-error');
    errorEl.hidden = true;

    fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, pin: pin })
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (!res.ok) {
          errorEl.textContent = (res.body.detail && res.body.detail.detail) || 'Credenziali non valide.';
          errorEl.hidden = false;
          return;
        }
        session = {
          token: res.body.token,
          nomeAutore: res.body.nome_autore,
          scadeAlle: res.body.scade_alle,
          devToolsAbilitati: !!res.body.dev_tools_abilitati
        };
        document.getElementById('session-author').textContent = session.nomeAutore;
        document.getElementById('pull-locale-btn').hidden = !session.devToolsAbilitati;

        if (modificaId) {
          caricaRicettaEsistente(modificaId);
        } else {
          loginView.hidden = true;
          recipeView.hidden = false;
        }
      })
      .catch(function () {
        errorEl.textContent = 'Impossibile contattare il server. Il backend è avviato su ' + API_BASE + '?';
        errorEl.hidden = false;
      });
  }

  function handleLogout() {
    session = null;
    recipeView.hidden = true;
    loginView.hidden = false;
  }

  // ---------------------------------------------------------------
  // Modalità modifica: carica la ricetta esistente e precompila il form
  // ---------------------------------------------------------------
  function caricaRicettaEsistente(id) {
    var errorEl = document.getElementById('login-error');
    fetch(API_BASE + '/recipes/' + encodeURIComponent(id), {
      headers: { 'Authorization': 'Bearer ' + session.token }
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
      })
      .then(function (res) {
        if (!res.ok) {
          mostraErroreServer(res.status, res.body, errorEl);
          return;
        }
        recipeStatoOriginale = res.body.stato;
        precompilaForm(res.body.payload);
        document.getElementById('editor-title').textContent = 'Modifica ricetta';
        var idInput = document.getElementById('f-id');
        idInput.value = res.body.payload.id;
        idInput.readOnly = true;
        aggiornaBottoniStato();
        loginView.hidden = true;
        recipeView.hidden = false;
      })
      .catch(function () {
        errorEl.textContent = 'Impossibile contattare il server. Il backend è avviato su ' + API_BASE + '?';
        errorEl.hidden = false;
      });
  }

  function aggiornaBottoniStato() {
    var bozzaBtn = document.getElementById('submit-bozza-btn');
    var pubblicaBtn = document.getElementById('submit-pubblica-btn');
    if (!modificaId) {
      // Creazione nuova: entrambi i bottoni visibili, testi di default.
      return;
    }
    if (recipeStatoOriginale === 'pubblicata') {
      // Non ha senso "retrocedere" a bozza una ricetta già pubblicata.
      bozzaBtn.hidden = true;
      pubblicaBtn.textContent = 'Salva modifiche';
    } else {
      bozzaBtn.hidden = false;
      pubblicaBtn.textContent = 'Pubblica ricetta';
    }
  }

  // ---------------------------------------------------------------
  // Righe dinamiche — ingredienti (con controllo scala a 4 forme)
  // ---------------------------------------------------------------
  function addIngredienteRow(valoriIniziali) {
    var node = ingTemplate.content.cloneNode(true);
    var row = node.querySelector('[data-row]');
    wireScalaControl(row);
    wireRemove(row, ingList, row);
    ingList.appendChild(row);
    if (valoriIniziali) popolaRigaIngrediente(row, valoriIniziali);
  }

  function wireScalaControl(row) {
    var select = row.querySelector('[data-field="scala-tipo"]');
    var subs = row.querySelectorAll('[data-scala-sub]');

    function sync() {
      subs.forEach(function (el) {
        el.hidden = el.dataset.scalaSub !== select.value;
      });
    }
    select.addEventListener('change', sync);
    sync();

    var addScaglioneBtn = row.querySelector('[data-add-scaglione]');
    var scaglioniRows = row.querySelector('[data-scaglioni-rows]');
    addScaglioneBtn.addEventListener('click', function () {
      var node = scaglioneTemplate.content.cloneNode(true);
      var sRow = node.querySelector('[data-scaglione-row]');
      wireRemove(sRow, scaglioniRows, sRow, 'data-remove-scaglione');
      scaglioniRows.appendChild(node);
    });
  }

  function wireRemove(el, parent, rowEl, attr) {
    var selector = attr ? '[' + attr + ']' : '[data-remove-row]';
    var btn = el.querySelector(selector);
    btn.addEventListener('click', function () { parent.removeChild(rowEl); });
  }

  function popolaRigaIngrediente(row, ing) {
    row.querySelector('[data-field="nome"]').value = ing.nome;
    row.querySelector('[data-field="quantita"]').value = ing.quantita === null ? '' : ing.quantita;
    row.querySelector('[data-field="unita"]').value = ing.unita;

    var tipoSelect = row.querySelector('[data-field="scala-tipo"]');
    if (ing.scala === null || ing.scala === undefined) {
      tipoSelect.value = 'lineare';
    } else if (ing.scala === 'fisso') {
      tipoSelect.value = 'fisso';
    } else if (typeof ing.scala === 'number') {
      tipoSelect.value = 'moltiplicatore';
      row.querySelector('[data-field="scala-moltiplicatore"]').value = ing.scala;
    } else if (typeof ing.scala === 'object') {
      tipoSelect.value = 'scaglioni';
      var scaglioniRows = row.querySelector('[data-scaglioni-rows]');
      Object.keys(ing.scala).forEach(function (chiave) {
        var node = scaglioneTemplate.content.cloneNode(true);
        var sRow = node.querySelector('[data-scaglione-row]');
        sRow.querySelector('[data-field="scaglione-chiave"]').value = chiave;
        sRow.querySelector('[data-field="scaglione-valore"]').value = ing.scala[chiave];
        wireRemove(sRow, scaglioniRows, sRow, 'data-remove-scaglione');
        scaglioniRows.appendChild(node);
      });
    }
    tipoSelect.dispatchEvent(new Event('change')); // mostra/nasconde i sub-controlli corretti
  }

  // ---------------------------------------------------------------
  // Righe dinamiche — passi (con rinumerazione automatica)
  // ---------------------------------------------------------------
  function addPassoRow(valoriIniziali) {
    var node = passoTemplate.content.cloneNode(true);
    var row = node.querySelector('[data-row]');
    row.querySelector('[data-remove-row]').addEventListener('click', function () {
      passiList.removeChild(row);
      renumeraPassi();
    });
    passiList.appendChild(row);
    renumeraPassi();
    if (valoriIniziali) popolaRigaPasso(row, valoriIniziali);
  }

  function popolaRigaPasso(row, passo) {
    row.querySelector('[data-field="testo"]').value = passo.testo;
    row.querySelector('[data-field="foto"]').value = passo.foto || '';
    // I dati sono sempre salvati in secondi; l'informazione su come
    // l'utente li aveva originariamente inseriti non sopravvive, quindi
    // mostrare in secondi è la scelta più diretta senza inferenze.
    row.querySelector('[data-field="timer_sec"]').value = passo.timer_sec === null ? '' : passo.timer_sec;
    row.querySelector('[data-field="timer-unita"]').value = 'sec';
  }

  function renumeraPassi() {
    var rows = passiList.querySelectorAll('[data-row]');
    rows.forEach(function (row, i) {
      row.querySelector('[data-passo-num]').textContent = String(i + 1);
    });
  }

  // ---------------------------------------------------------------
  // Toggle scalabilità: la nota ha senso solo se la ricetta NON scala
  // ---------------------------------------------------------------
  function wireScalabileToggle() {
    var checkbox = document.getElementById('f-scalabile');
    var notaWrap = document.getElementById('nota-scalabilita-wrap');
    checkbox.addEventListener('change', function () {
      notaWrap.hidden = checkbox.checked;
    });
  }

  // ---------------------------------------------------------------
  // Conversione tempi min/sec — lo schema/backend restano sempre e
  // solo in minuti (tempi ricetta) o secondi (timer passo): la
  // conversione avviene solo al momento di costruire il payload, mai
  // mentre si digita, per non confondere cosa si sta effettivamente
  // scrivendo.
  // ---------------------------------------------------------------
  function leggiTempoInMinuti(inputId, unitaSelectId) {
    var raw = document.getElementById(inputId).value;
    if (raw === '') return 0;
    var valore = parseFloat(raw);
    var unita = document.getElementById(unitaSelectId).value;
    var minuti = unita === 'sec' ? valore / 60 : valore;
    return Math.round(minuti);
  }

  function impostaTempoConUnita(inputId, minuti) {
    // I dati sono sempre salvati in minuti: mostrare sempre in minuti in
    // precompilazione è la scelta più diretta (stessa logica del timer passo).
    document.getElementById(inputId).value = minuti;
  }

  // ---------------------------------------------------------------
  // Tag/strumenti liberi: uniti ai valori spuntati dalla checklist,
  // deduplicati lato client come cortesia UX — il backend fa comunque
  // la normalizzazione/dedup definitiva (case-insensitive/trim).
  // ---------------------------------------------------------------
  function valoriLiberi(inputId) {
    var raw = document.getElementById(inputId).value.trim();
    if (!raw) return [];
    return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function unisciSenzaDuplicati(a, b) {
    var norm = a.map(function (v) { return v.toLowerCase(); });
    var extra = b.filter(function (v) { return norm.indexOf(v.toLowerCase()) === -1; });
    return a.concat(extra);
  }

  // ---------------------------------------------------------------
  // Raccolta dati DOM -> oggetto conforme a RicettaCreateRequest
  // ---------------------------------------------------------------
  function raccogliIngrediente(row) {
    var nome = row.querySelector('[data-field="nome"]').value.trim();
    var quantitaRaw = row.querySelector('[data-field="quantita"]').value;
    var unita = row.querySelector('[data-field="unita"]').value.trim();
    var tipo = row.querySelector('[data-field="scala-tipo"]').value;

    var scala = null;
    if (tipo === 'fisso') {
      scala = 'fisso';
    } else if (tipo === 'moltiplicatore') {
      var m = row.querySelector('[data-field="scala-moltiplicatore"]').value;
      scala = m === '' ? null : parseFloat(m);
    } else if (tipo === 'scaglioni') {
      scala = {};
      row.querySelectorAll('[data-scaglione-row]').forEach(function (sRow) {
        var chiave = sRow.querySelector('[data-field="scaglione-chiave"]').value.trim();
        var valoreRaw = sRow.querySelector('[data-field="scaglione-valore"]').value;
        if (chiave === '' || valoreRaw === '') return;
        scala[chiave] = parseInt(valoreRaw, 10);
      });
    }
    // tipo === 'lineare' -> scala resta null (default server)

    return {
      nome: nome,
      quantita: quantitaRaw === '' ? null : parseFloat(quantitaRaw),
      unita: unita,
      scala: scala
    };
  }

  function raccogliPasso(row, index) {
    var timerRaw = row.querySelector('[data-field="timer_sec"]').value;
    var timerUnita = row.querySelector('[data-field="timer-unita"]').value;
    var timerSec = null;
    if (timerRaw !== '') {
      var valore = parseFloat(timerRaw);
      timerSec = Math.round(timerUnita === 'min' ? valore * 60 : valore);
    }
    return {
      numero: index + 1,
      testo: row.querySelector('[data-field="testo"]').value.trim(),
      foto: row.querySelector('[data-field="foto"]').value.trim() || null,
      timer_sec: timerSec
    };
  }

  function checkedValues(name) {
    return Array.prototype.map.call(
      document.querySelectorAll('input[name="' + name + '"]:checked'),
      function (el) { return el.value; }
    );
  }

  function raccogliPayload() {
    var scalabile = document.getElementById('f-scalabile').checked;
    return {
      id: document.getElementById('f-id').value.trim(),
      titolo: document.getElementById('f-titolo').value.trim(),
      categorie: unisciSenzaDuplicati(checkedValues('categorie'), valoriLiberi('f-categorie-libere')),
      tempo_preparazione_min: leggiTempoInMinuti('f-tempo-prep', 'f-tempo-prep-unita'),
      tempo_cottura_min: leggiTempoInMinuti('f-tempo-cottura', 'f-tempo-cottura-unita'),
      porzioni_base: parseInt(document.getElementById('f-porzioni').value || '0', 10),
      difficolta: parseFloat(document.getElementById('f-difficolta').value),
      immagine_copertina: document.getElementById('f-immagine').value.trim() || null,
      video: document.getElementById('f-video').value.trim() || null,
      racconto: document.getElementById('f-racconto').value.trim() || null,
      strumenti: unisciSenzaDuplicati(checkedValues('strumenti'), valoriLiberi('f-strumenti-liberi')),
      scalabile: scalabile,
      nota_scalabilita: scalabile ? null : (document.getElementById('f-nota-scalabilita').value.trim() || null),
      ingredienti: Array.prototype.map.call(
        ingList.querySelectorAll('[data-row]'), raccogliIngrediente
      ),
      passi: Array.prototype.map.call(
        passiList.querySelectorAll('[data-row]'), raccogliPasso
      ),
      corpo_markdown: document.getElementById('f-corpo').value.trim() || null
    };
  }

  // ---------------------------------------------------------------
  // Precompilazione (modalità modifica) — inversa di raccogliPayload()
  // ---------------------------------------------------------------
  function precompilaForm(payload) {
    document.getElementById('f-titolo').value = payload.titolo;
    impostaTempoConUnita('f-tempo-prep', payload.tempo_preparazione_min);
    impostaTempoConUnita('f-tempo-cottura', payload.tempo_cottura_min);
    document.getElementById('f-porzioni').value = payload.porzioni_base;
    document.getElementById('f-difficolta').value = payload.difficolta;
    document.getElementById('f-immagine').value = payload.immagine_copertina || '';
    document.getElementById('f-video').value = payload.video || '';
    document.getElementById('f-racconto').value = payload.racconto || '';
    document.getElementById('f-scalabile').checked = payload.scalabile;
    document.getElementById('nota-scalabilita-wrap').hidden = payload.scalabile;
    document.getElementById('f-nota-scalabilita').value = payload.nota_scalabilita || '';
    document.getElementById('f-corpo').value = payload.corpo_markdown || '';

    spuntaChecklist('categorie', payload.categorie, 'f-categorie-libere');
    spuntaChecklist('strumenti', payload.strumenti, 'f-strumenti-liberi');

    ingList.innerHTML = '';
    payload.ingredienti.forEach(function (ing) { addIngredienteRow(ing); });

    passiList.innerHTML = '';
    payload.passi.forEach(function (p) { addPassoRow(p); });
  }

  function spuntaChecklist(name, valori, inputLiberiId) {
    var set = {};
    valori.forEach(function (v) { set[v] = true; });
    var trovati = {};
    document.querySelectorAll('input[name="' + name + '"]').forEach(function (cb) {
      cb.checked = !!set[cb.value];
      if (set[cb.value]) trovati[cb.value] = true;
    });
    // Valori presenti nel payload ma NON tra le checkbox canoniche (es. un
    // tag "personalizzato" aggiunto in una sessione precedente, non ancora
    // nella checklist statica generata a build time) vanno nel campo libero
    // invece di sparire silenziosamente.
    var mancanti = valori.filter(function (v) { return !trovati[v]; });
    if (mancanti.length) {
      document.getElementById(inputLiberiId).value = mancanti.join(', ');
    }
  }

  // ---------------------------------------------------------------
  // Validazione client leggera — replica i vincoli server più comuni
  // da sbagliare, per dare feedback immediato. Il server resta l'unica
  // fonte di verità completa: ogni caso di errore 4xx/5xx è comunque
  // gestito dopo l'invio (vedi mostraErroreServer).
  // ---------------------------------------------------------------
  var SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  function validaPayload(payload) {
    var errori = [];

    if (!SLUG_RE.test(payload.id)) {
      errori.push('ID non valido: solo minuscole, numeri e trattini singoli (es. torta-di-mele).');
    }
    if (!payload.titolo) errori.push('Titolo obbligatorio.');
    if (payload.ingredienti.length === 0) errori.push('Serve almeno un ingrediente.');

    payload.ingredienti.forEach(function (ing, i) {
      if (!ing.nome) errori.push('Ingrediente #' + (i + 1) + ': nome mancante.');
      if (!ing.unita) errori.push('Ingrediente #' + (i + 1) + ': unità mancante.');
      if (ing.quantita === null && ing.unita.trim().toLowerCase() !== 'q.b.') {
        errori.push('Ingrediente #' + (i + 1) + ' ("' + ing.nome + '"): quantità vuota ammessa solo con unità "q.b.".');
      }
      if (typeof ing.scala === 'object' && ing.scala !== null && Object.keys(ing.scala).length === 0) {
        errori.push('Ingrediente #' + (i + 1) + ' ("' + ing.nome + '"): scaglioni scelti ma nessuna fascia inserita.');
      }
      if (typeof ing.scala === 'number' && (isNaN(ing.scala) || ing.scala <= 0)) {
        errori.push('Ingrediente #' + (i + 1) + ' ("' + ing.nome + '"): moltiplicatore deve essere un numero positivo.');
      }
    });

    payload.passi.forEach(function (p, i) {
      if (!p.testo) errori.push('Passo #' + (i + 1) + ': testo mancante.');
    });

    return errori;
  }

  // ---------------------------------------------------------------
  // Submit — crea, modifica, o modifica+pubblica (bozza -> pubblicata)
  // ---------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    var statoTarget = e.submitter && e.submitter.dataset.stato; // 'bozza' | 'pubblicata'
    var errorEl = document.getElementById('submit-error');
    errorEl.hidden = true;

    var payload = raccogliPayload();
    var erroriClient = validaPayload(payload);
    if (erroriClient.length) {
      errorEl.innerHTML = '<strong>Correggi prima di inviare:</strong><ul>' +
        erroriClient.map(function (m) { return '<li>' + escapeHtml(m) + '</li>'; }).join('') +
        '</ul>';
      errorEl.hidden = false;
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    impostaBottoniInCorso(true);

    var promessa;
    if (statoTarget === 'pubblicata' && modificaId && recipeStatoOriginale === 'bozza') {
      // Prima salva le modifiche correnti nella bozza, POI pubblica — mai
      // pubblicare ignorando eventuali modifiche non ancora salvate.
      promessa = salvaBozzaESuccessivamentePubblica(payload);
    } else if (modificaId) {
      promessa = inviaAggiornamento(payload, statoTarget);
    } else {
      promessa = inviaCreazione(payload, statoTarget);
    }

    promessa
      .then(function (res) {
        impostaBottoniInCorso(false);
        if (res.status === 200 || res.status === 201) {
          mostraSuccesso(payload, res.body);
        } else {
          mostraErroreServer(res.status, res.body, errorEl);
        }
      })
      .catch(function () {
        impostaBottoniInCorso(false);
        errorEl.textContent = 'Impossibile contattare il server. Il backend è avviato su ' + API_BASE + '?';
        errorEl.hidden = false;
      });
  }

  function impostaBottoniInCorso(inCorso) {
    document.getElementById('submit-bozza-btn').disabled = inCorso;
    document.getElementById('submit-pubblica-btn').disabled = inCorso;
  }

  function rispostaJson(r) {
    return r.json().then(function (body) { return { status: r.status, body: body }; });
  }

  function inviaCreazione(payload, stato) {
    return fetch(API_BASE + '/recipes?stato=' + stato, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.token },
      body: JSON.stringify(payload)
    }).then(rispostaJson);
  }

  function inviaAggiornamento(payload, stato) {
    return fetch(API_BASE + '/recipes/' + encodeURIComponent(payload.id) + '?stato=' + stato, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.token },
      body: JSON.stringify(payload)
    }).then(rispostaJson);
  }

  function salvaBozzaESuccessivamentePubblica(payload) {
    return inviaAggiornamento(payload, 'bozza').then(function (res) {
      if (res.status !== 200) return res; // errore nel salvataggio bozza: non provare a pubblicare
      return fetch(API_BASE + '/recipes/' + encodeURIComponent(payload.id) + '/pubblica', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + session.token }
      }).then(rispostaJson);
    });
  }

  // ---------------------------------------------------------------
  // Gestione di tutti i casi di errore del contratto API
  // ---------------------------------------------------------------
  function mostraErroreServer(status, body, errorEl) {
    var detail = body && body.detail;

    if (status === 401) {
      errorEl.textContent = 'Sessione scaduta o non valida: effettua di nuovo il login.';
      session = null;
      recipeView.hidden = true;
      loginView.hidden = false;
    } else if (status === 409 && detail && detail.code === 'slug_conflict') {
      errorEl.textContent = 'Esiste già una ricetta con questo ID: scegline uno diverso. (' + detail.detail + ')';
    } else if (status === 409 && detail && detail.code === 'concurrent_edit') {
      errorEl.textContent = 'Questa ricetta è stata modificata da qualcun altro nel frattempo. Ricarica la pagina (i tuoi dati non salvati andranno persi) e riapplica le modifiche.';
    } else if (status === 404 && detail && detail.code === 'not_found') {
      errorEl.textContent = 'Ricetta non trovata: ' + detail.detail;
    } else if (status === 422 && detail && detail.code === 'id_mismatch') {
      errorEl.textContent = 'Errore interno: id non coerente tra form e URL. Ricarica la pagina.';
    } else if (status === 422 && detail && (detail.code === 'unknown_tags' || detail.code === 'unknown_tools')) {
      // Fallback difensivo: con la normalizzazione/auto-estensione lato
      // server questo ramo non dovrebbe più attivarsi nel flusso normale.
      var label = detail.code === 'unknown_tags' ? 'Tag' : 'Strumenti';
      errorEl.innerHTML = '<strong>' + label + ' non riconosciuti:</strong> ' +
        escapeHtml(detail.unknown_values.join(', ')) +
        '<br>' + escapeHtml(detail.suggestion || '');
    } else if (status === 422 && Array.isArray(detail)) {
      // Errore standard di validazione Pydantic/FastAPI: array di {loc, msg, type}
      errorEl.innerHTML = '<strong>Dati non validi:</strong><ul>' +
        detail.map(function (e) {
          var campo = Array.isArray(e.loc) ? e.loc.join(' -> ') : '';
          return '<li>' + escapeHtml(campo) + ': ' + escapeHtml(e.msg) + '</li>';
        }).join('') + '</ul>';
    } else if (status === 500 && detail && detail.code === 'serialization_error') {
      errorEl.textContent = 'Errore interno del server durante il salvataggio: ' + detail.detail;
    } else if (status === 502 && detail && detail.code === 'github_error') {
      errorEl.textContent = 'Errore comunicando con GitHub: ' + detail.detail + '. Riprova tra poco.';
    } else if (status === 502 && detail && (detail.code === 'build_failed' || detail.code === 'build_timeout')) {
      errorEl.textContent = 'Errore nella generazione dell\'anteprima: ' + detail.detail;
    } else if (status === 502 && detail && detail.code === 'npx_not_found') {
      errorEl.textContent = 'Comando "npx" non trovato: il backend non riesce ad avviare la build Eleventy per l\'anteprima.';
    } else {
      errorEl.textContent = 'Errore imprevisto (HTTP ' + status + ').';
    }
    errorEl.hidden = false;
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------------------------------------------------------------
  // Vista di successo — costruita dal payload già in mano, mai una
  // nuova fetch per rileggere la ricetta appena creata.
  // ---------------------------------------------------------------
  function mostraSuccesso(payload, res) {
    recipeView.hidden = true;
    successView.hidden = false;
    document.getElementById('success-title').textContent =
      modificaId ? 'Ricetta salvata' : 'Ricetta pubblicata';
    document.getElementById('success-github-link').href = res.html_url;
    var dl = document.getElementById('success-summary');
    dl.innerHTML =
      '<dt>Titolo</dt><dd>' + escapeHtml(payload.titolo) + '</dd>' +
      '<dt>ID</dt><dd>' + escapeHtml(payload.id) + '</dd>' +
      '<dt>Porzioni base</dt><dd>' + payload.porzioni_base + '</dd>' +
      '<dt>Ingredienti</dt><dd>' + payload.ingredienti.length + '</dd>' +
      '<dt>Passi</dt><dd>' + payload.passi.length + '</dd>';
  }

  // ---------------------------------------------------------------
  // Anteprima — solo se il backend ha i dev-tools abilitati (endpoint
  // /dev/anteprima). Riusa raccogliPayload() già esistente, invariato.
  // Il backend genera l'HTML con una build Eleventy vera (stesso layout/
  // CSS del sito reale, zero duplicazione di markup qui) e restituisce
  // l'URL della pagina, aperta in una nuova scheda — niente iframe/modal
  // con i dati dentro, evita ogni problema di origine incrociata tra
  // :8000 (backend) e :8080 (sito) ed è garantito identico al sito vero.
  // ---------------------------------------------------------------
  function mostraAnteprima() {
    if (!session || !session.devToolsAbilitati) return; // bottone nascosto in questo caso, difensivo
    var modal = document.getElementById('anteprima-modal');
    var stato = document.getElementById('anteprima-stato');
    var btn = document.getElementById('anteprima-btn');
    var errorEl = document.getElementById('submit-error');

    stato.textContent = 'Generazione anteprima…';
    modal.hidden = false;
    btn.disabled = true;

    fetch(API_BASE + '/dev/anteprima', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.token },
      body: JSON.stringify(raccogliPayload())
    })
      .then(rispostaJson)
      .then(function (res) {
        modal.hidden = true;
        btn.disabled = false;
        if (res.status === 200) {
          window.open(res.body.url, '_blank');
        } else {
          errorEl.hidden = true; // reset, poi mostraErroreServer lo riapre se serve
          mostraErroreServer(res.status, res.body, errorEl);
        }
      })
      .catch(function () {
        modal.hidden = true;
        btn.disabled = false;
        errorEl.textContent = 'Impossibile contattare il server. Il backend è avviato su ' + API_BASE + '?';
        errorEl.hidden = false;
      });
  }

  // ---------------------------------------------------------------
  // Aggiorna sito locale — esegue git pull sulla working copy tramite il
  // backend (solo se dev-tools abilitati), così il sito in npm run dev
  // (che non osserva content/ in automatico) vede le ricette appena
  // salvate senza un comando manuale.
  // ---------------------------------------------------------------
  function aggiornaSitoLocale() {
    var btn = document.getElementById('pull-locale-btn');
    var esitoEl = document.getElementById('pull-locale-esito');
    btn.disabled = true;
    esitoEl.hidden = true;

    fetch(API_BASE + '/dev/pull', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.token }
    })
      .then(rispostaJson)
      .then(function (res) {
        btn.disabled = false;
        if (res.status === 200) {
          esitoEl.textContent = res.body.aggiornato
            ? 'Sito locale aggiornato: ' + res.body.dettaglio
            : 'Il sito locale era già aggiornato.';
        } else {
          var detail = res.body && res.body.detail;
          esitoEl.textContent = 'Errore durante l\'aggiornamento: ' +
            ((detail && detail.detail) || 'errore imprevisto (HTTP ' + res.status + ')');
        }
        esitoEl.hidden = false;
      })
      .catch(function () {
        btn.disabled = false;
        esitoEl.textContent = 'Impossibile contattare il server. Il backend è avviato su ' + API_BASE + '?';
        esitoEl.hidden = false;
      });
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('recipe-form').addEventListener('submit', handleSubmit);
  document.getElementById('add-ingrediente').addEventListener('click', function () { addIngredienteRow(); });
  document.getElementById('add-passo').addEventListener('click', function () { addPassoRow(); });
  document.getElementById('anteprima-btn').addEventListener('click', mostraAnteprima);
  document.getElementById('pull-locale-btn').addEventListener('click', aggiornaSitoLocale);
  wireScalabileToggle();

  if (!modificaId) {
    // Modalità creazione: una riga di partenza per comodità (non
    // obbligatoria, rimovibile). In modalità modifica le righe arrivano
    // dalla precompilazione dopo il login (caricaRicettaEsistente).
    addIngredienteRow();
    addPassoRow();
  } else {
    document.getElementById('editor-title').textContent = 'Modifica ricetta';
  }
})();
