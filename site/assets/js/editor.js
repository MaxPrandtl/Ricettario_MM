// Editor "Nuova ricetta": login + form dinamico + submit verso il backend.
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
          scadeAlle: res.body.scade_alle
        };
        document.getElementById('session-author').textContent = session.nomeAutore;
        loginView.hidden = true;
        recipeView.hidden = false;
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
  // Righe dinamiche — ingredienti (con controllo scala a 4 forme)
  // ---------------------------------------------------------------
  function addIngredienteRow() {
    var node = ingTemplate.content.cloneNode(true);
    var row = node.querySelector('[data-row]');
    wireScalaControl(row);
    wireRemove(row, ingList, row);
    ingList.appendChild(node);
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

  // ---------------------------------------------------------------
  // Righe dinamiche — passi (con rinumerazione automatica)
  // ---------------------------------------------------------------
  function addPassoRow() {
    var node = passoTemplate.content.cloneNode(true);
    var row = node.querySelector('[data-row]');
    row.querySelector('[data-remove-row]').addEventListener('click', function () {
      passiList.removeChild(row);
      renumeraPassi();
    });
    passiList.appendChild(node);
    renumeraPassi();
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
    return {
      numero: index + 1,
      testo: row.querySelector('[data-field="testo"]').value.trim(),
      foto: row.querySelector('[data-field="foto"]').value.trim() || null,
      timer_sec: timerRaw === '' ? null : parseInt(timerRaw, 10)
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
      categorie: checkedValues('categorie'),
      tempo_preparazione_min: parseInt(document.getElementById('f-tempo-prep').value || '0', 10),
      tempo_cottura_min: parseInt(document.getElementById('f-tempo-cottura').value || '0', 10),
      porzioni_base: parseInt(document.getElementById('f-porzioni').value || '0', 10),
      difficolta: document.getElementById('f-difficolta').value,
      immagine_copertina: document.getElementById('f-immagine').value.trim() || null,
      video: document.getElementById('f-video').value.trim() || null,
      racconto: document.getElementById('f-racconto').value.trim() || null,
      strumenti: checkedValues('strumenti'),
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
  // Submit
  // ---------------------------------------------------------------
  function handleSubmit(e) {
    e.preventDefault();
    var submitBtn = document.getElementById('submit-btn');
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Pubblicazione in corso…';

    fetch(API_BASE + '/recipes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.token
      },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (body) { return { status: r.status, body: body }; });
      })
      .then(function (res) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pubblica ricetta';
        if (res.status === 201) {
          mostraSuccesso(payload, res.body);
        } else {
          mostraErroreServer(res.status, res.body, errorEl);
        }
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Pubblica ricetta';
        errorEl.textContent = 'Impossibile contattare il server. Il backend è avviato su ' + API_BASE + '?';
        errorEl.hidden = false;
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
    } else if (status === 422 && detail && (detail.code === 'unknown_tags' || detail.code === 'unknown_tools')) {
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
  // Init
  // ---------------------------------------------------------------
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('recipe-form').addEventListener('submit', handleSubmit);
  document.getElementById('add-ingrediente').addEventListener('click', addIngredienteRow);
  document.getElementById('add-passo').addEventListener('click', addPassoRow);
  wireScalabileToggle();

  // Una riga di partenza per comodità (non obbligatoria, rimovibile)
  addIngredienteRow();
  addPassoRow();
})();
