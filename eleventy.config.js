import fs from "node:fs";
import yaml from "js-yaml";
import { scalingAttrs } from "./site/_includes/macros/scaling-helpers.js";
import { loadRicette } from "./site/_includes/macros/load-recipes.js";

export default function (eleventyConfig) {
  // Asset statici copiati 1:1 in _site/assets/...
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });

  // Ricette come dato globale (non una vera Eleventy collection): content/
  // vive fuori dalla input dir di Eleventy (site/pages), e
  // collectionApi.getFilteredByGlob filtra solo tra i template GIÀ scoperti
  // sotto `input` — non fa una scansione filesystem indipendente. Lette a
  // mano con gray-matter, vedi site/_includes/macros/load-recipes.js.
  eleventyConfig.addGlobalData("ricette", () => loadRicette());

  // Tassonomie canoniche come dati globali — vivono in content/, non in una
  // cartella _data/ di Eleventy, quindi vanno lette a mano con js-yaml.
  // NOTA: il nome "tags" è riservato da Eleventy (sistema di collection/tag
  // automatiche) — usare "tagsCanonici" per evitare il conflitto.
  eleventyConfig.addGlobalData("tagsCanonici", () =>
    yaml.load(fs.readFileSync("content/tags.yaml", "utf8"))
  );
  eleventyConfig.addGlobalData("strumentiCanonici", () =>
    yaml.load(fs.readFileSync("content/strumenti.yaml", "utf8"))
  );

  // Serializza il campo `scala` di un ingrediente (4 forme possibili) negli
  // attributi data-* che site/assets/js/scaling.js legge a runtime.
  eleventyConfig.addFilter("scalingAttrs", scalingAttrs);

  // "180" -> "3 h", "45" -> "45 min", "0" -> "—" (usato per tempo di cottura
  // spesso 0 quando la ricetta non prevede cottura, es. tiramisù).
  eleventyConfig.addFilter("formatTempo", (min) => {
    if (!min || min <= 0) return "—";
    if (min < 60) return `${min} min`;
    const ore = Math.floor(min / 60);
    const resto = min % 60;
    return resto === 0 ? `${ore} h` : `${ore} h ${resto}`;
  });

  // "14400" -> "4 h di riposo", "300" -> "5 min" — per i timer dei singoli passi.
  eleventyConfig.addFilter("formatTimerSec", (sec) => {
    if (!sec || sec <= 0) return "";
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min`;
    const ore = Math.floor(min / 60);
    const restoMin = min % 60;
    return restoMin === 0 ? `${ore} h` : `${ore} h ${restoMin} min`;
  });

  eleventyConfig.addFilter("json", (obj) => JSON.stringify(obj));

  // Estrae solo i nomi degli ingredienti (per l'indice di ricerca) — Nunjucks
  // non ha "map"/"list" nativi come Jinja2, quindi si usa un filtro dedicato.
  eleventyConfig.addFilter("nomiIngredienti", (ingredienti) =>
    (ingredienti || []).map((i) => i.nome)
  );

  // Difficoltà 1-5 (step 0.5) -> sequenza di 5 "padelle" piene/mezze/vuote in
  // markup HTML. Nessun carattere Unicode "mezza padella" esiste in modo
  // affidabile cross-piattaforma: la mezza padella è resa con due span 🍳
  // sovrapposti, uno pieno tagliato al 50% via CSS sopra uno vuoto in scala
  // di grigi (vedi .difficolta-icone/.padella--* in style.css).
  eleventyConfig.addFilter("difficoltaIcone", (valore) => {
    const piene = Math.floor(valore);
    const mezza = valore - piene === 0.5;
    const vuote = 5 - piene - (mezza ? 1 : 0);

    let html = `<span class="difficolta-icone" aria-hidden="true">`;
    for (let i = 0; i < piene; i++) html += `<span class="padella padella--piena">🍳</span>`;
    if (mezza) {
      html +=
        `<span class="padella padella--mezza">` +
        `<span class="padella-piena">🍳</span>` +
        `<span class="padella-vuota">🍳</span>` +
        `</span>`;
    }
    for (let i = 0; i < vuote; i++) html += `<span class="padella padella--vuota">🍳</span>`;
    html += `</span>`;
    return html;
  });

  return {
    dir: {
      input: "site/pages",
      includes: "../_includes",
      output: "_site",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
