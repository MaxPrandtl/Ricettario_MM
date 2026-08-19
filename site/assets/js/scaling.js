// Scaling porzioni: legge data-scale/data-base/data-steps (scritti dal template
// tramite site/_includes/macros/scaling-helpers.js) e ricalcola le quantità al
// click sui bottoni 1/2/4/6/8.
//
// CORREZIONE rispetto alla bozza originale (site/preview/*.html): quella
// versione non gestiva affatto data-scale="fisso" — un ingrediente fisso
// (es. sale "q.b.", basilico, aglio) finiva nel branch "moltiplicatore
// numerico" con parseFloat("fisso") = NaN, rompendo la quantità mostrata.
// Qui "fisso" ha un branch dedicato: mostra sempre data-base, o "q.b." se
// data-base è vuoto (quantita: null nel frontmatter).
(function () {
  var container = document.querySelector('[data-ricetta-scalabile]');
  if (!container) return; // ricetta non scalabile: nessun toggle in pagina

  var porzioniBase = parseFloat(container.dataset.porzioniBase);
  var buttons = container.querySelectorAll('.pill-group [data-servings]');
  var righe = container.querySelectorAll('.ingredienti li[data-scale]');
  var displayPorzioni = document.querySelector('[data-live="porzioni"]');

  function formatQty(n) {
    var r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
  }

  function ricalcola(porzioni) {
    var fattore = porzioni / porzioniBase;

    righe.forEach(function (li) {
      var tipo = li.dataset.scale;
      var qtyEl = li.querySelector('[data-qty]');
      var base = li.dataset.base;
      var valore;

      if (tipo === 'steps') {
        var scaglioni = JSON.parse(li.dataset.steps);
        valore = scaglioni[String(porzioni)];
        if (valore === undefined) valore = '?';
      } else if (tipo === 'fisso') {
        valore = base === '' ? 'q.b.' : formatQty(parseFloat(base));
      } else if (tipo === 'linear') {
        valore = base === '' ? 'q.b.' : formatQty(parseFloat(base) * fattore);
      } else {
        // moltiplicatore numerico esplicito (es. "0.7")
        var moltiplicatore = parseFloat(tipo);
        valore = base === '' ? 'q.b.' : formatQty(parseFloat(base) * fattore * moltiplicatore);
      }

      qtyEl.textContent = valore;
    });

    if (displayPorzioni) displayPorzioni.textContent = porzioni;
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      buttons.forEach(function (b) { b.setAttribute('aria-current', 'false'); });
      btn.setAttribute('aria-current', 'true');
      ricalcola(parseInt(btn.dataset.servings, 10));
    });
  });

  ricalcola(porzioniBase);
})();
