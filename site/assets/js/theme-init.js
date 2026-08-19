// Applica il tema salvato PRIMA del paint, per evitare un lampo del tema
// sbagliato. Va incluso come <script> inline in <head> (non defer), non come
// file esterno — deve girare prima che il browser dipinga la pagina.
// Vedi site/_includes/layouts/base.njk.
(function () {
  var saved = localStorage.getItem('ricettario-tema');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
})();
