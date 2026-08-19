// Selettore tema: chiaro / scuro / sistema.
// - "sistema" = nessuna scelta salvata -> segue prefers-color-scheme (default).
// - "chiaro"/"scuro" = scelta esplicita, salvata e riapplicata alle visite successive.
(function () {
  var STORAGE_KEY = 'ricettario-tema';
  var root = document.documentElement;
  var buttons = document.querySelectorAll('[data-theme-choice]');

  function currentChoice() {
    var saved = localStorage.getItem(STORAGE_KEY);
    return (saved === 'light' || saved === 'dark') ? saved : 'system';
  }

  function applyChoice(choice) {
    if (choice === 'system') {
      root.removeAttribute('data-theme');
      localStorage.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute('data-theme', choice);
      localStorage.setItem(STORAGE_KEY, choice);
    }
    buttons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeChoice === choice));
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyChoice(btn.dataset.themeChoice);
    });
  });

  applyChoice(currentChoice());
})();
