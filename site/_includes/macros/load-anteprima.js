/**
 * Legge il file temporaneo di anteprima (content/_anteprima/current.md,
 * scritto da backend/app/routers/dev_tools.py) e lo espone nella stessa
 * forma { data, corpoHtml } prodotta da loadRicette() — così la pagina
 * /anteprima/ può riusare tale e quale layouts/ricetta.njk, zero
 * duplicazione di markup tra sito reale e anteprima.
 *
 * Ritorna un placeholder se il file non esiste ancora (nessuna anteprima
 * generata in questa sessione di build, o build di produzione dove
 * content/_anteprima/ non esiste mai — è gitignored) invece di rompere la
 * build: layouts/ricetta.njk referenzia ricetta.data.* senza guardie,
 * quindi la forma del placeholder deve avere tutti i campi minimi usati.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false });

const PLACEHOLDER = {
  data: {
    id: "anteprima",
    titolo: "Nessuna anteprima disponibile",
    categorie: [],
    tempo_preparazione_min: 0,
    tempo_cottura_min: 0,
    porzioni_base: 1,
    difficolta: 1,
    autore: "",
    data_inserimento: "",
    immagine_copertina: null,
    video: null,
    racconto: null,
    strumenti: [],
    scalabile: false,
    nota_scalabilita: "Genera un'anteprima dall'editor per vederla qui.",
    ingredienti: [],
    passi: [],
  },
  corpoHtml: "",
};

export function loadAnteprima(filePath = "content/_anteprima/current.md") {
  if (!fs.existsSync(filePath)) {
    return PLACEHOLDER;
  }
  const raw = fs.readFileSync(path.normalize(filePath), "utf8");
  const { data, content } = matter(raw);
  return { data, corpoHtml: md.render(content.trim()) };
}
