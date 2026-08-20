// Dato calcolato per site/pages/anteprima.njk: inietta la variabile `ricetta`
// (stessa forma { data, corpoHtml } usata da ogni elemento di `ricette`) nel
// contesto, così il layout layouts/ricetta.njk — condiviso con le pagine
// ricetta vere — funziona identico senza alcuna modifica.
export default {
  eleventyComputed: {
    ricetta: (data) => data.anteprimaRicetta,
  },
};
