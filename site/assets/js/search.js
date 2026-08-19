// Ricerca + filtri lato client sulla pagina indice. Nessuna richiesta al
// backend: legge /ricette-index.json (generato in build da Eleventy) e mostra/
// nasconde le card già renderizzate nel DOM in base ai filtri correnti.
//
// Combinazione: OR dentro lo stesso filtro, AND tra filtri diversi
// (es. "dolce OR primo" AND "facile" AND "senza bimby").
(function () {
  var grid = document.getElementById('recipe-grid');
  if (!grid) return; // non siamo sulla pagina indice

  var cards = Array.from(grid.querySelectorAll('.card'));
  var searchBox = document.getElementById('search-box');
  var noResults = document.getElementById('no-results');
  var index = [];
  var indexById = {};

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function checkedValues(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (el) { return el.value; });
  }

  function radioValue(name) {
    var checked = document.querySelector('input[name="' + name + '"]:checked');
    return checked && checked.value ? parseInt(checked.value, 10) : null;
  }

  function selectValue(name) {
    var el = document.querySelector('select[name="' + name + '"]');
    return el ? parseFloat(el.value) : null;
  }

  function currentFilters() {
    return {
      testo: (searchBox ? searchBox.value : '').trim().toLowerCase(),
      categorie: checkedValues('categoria'),
      difficoltaMin: selectValue('difficolta-min'),
      difficoltaMax: selectValue('difficolta-max'),
      tempoMax: radioValue('tempo'),
      strumentiEsclusi: checkedValues('strumento-escludi'),
    };
  }

  function matches(ricetta, f) {
    if (f.testo) {
      var haystack = [ricetta.titolo]
        .concat(ricetta.categorie, ricetta.ingredienti)
        .join(' ')
        .toLowerCase();
      if (haystack.indexOf(f.testo) === -1) return false;
    }
    if (f.categorie.length && !f.categorie.some(function (c) { return ricetta.categorie.indexOf(c) !== -1; })) {
      return false;
    }
    if (f.difficoltaMin !== null && ricetta.difficolta < f.difficoltaMin) {
      return false;
    }
    if (f.difficoltaMax !== null && ricetta.difficolta > f.difficoltaMax) {
      return false;
    }
    if (f.tempoMax !== null && ricetta.tempo_totale_min > f.tempoMax) {
      return false;
    }
    if (f.strumentiEsclusi.some(function (s) { return ricetta.strumenti.indexOf(s) !== -1; })) {
      return false;
    }
    return true;
  }

  function applyFilters() {
    var f = currentFilters();
    var visibleCount = 0;
    cards.forEach(function (card) {
      var ricetta = indexById[card.dataset.id];
      var visible = !!ricetta && matches(ricetta, f);
      card.hidden = !visible;
      if (visible) visibleCount++;
    });
    if (noResults) noResults.hidden = visibleCount > 0;
  }

  function loadIndex() {
    return fetch('/ricette-index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        index = data;
        indexById = {};
        data.forEach(function (r) { indexById[r.id] = r; });
      });
  }

  document.addEventListener('change', function (e) {
    if (e.target.matches('input[name="categoria"], select[name="difficolta-min"], select[name="difficolta-max"], input[name="tempo"], input[name="strumento-escludi"]')) {
      applyFilters();
    }
  });
  if (searchBox) searchBox.addEventListener('input', debounce(applyFilters, 120));

  loadIndex().then(applyFilters);
})();
