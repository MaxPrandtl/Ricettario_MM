/**
 * Legge tutte le ricette da content/ricette/*.md e le espone come oggetti
 * { data, corpoHtml } — replica ciò che Eleventy farebbe nativamente per un
 * file dentro la sua input dir, ma content/ vive fuori da site/pages (per la
 * separazione monorepo pubblico/generatore voluta dal progetto) e Eleventy 3.x
 * non offre un modo nativo di trattare come collection dei file davvero fuori
 * dalla propria input dir (collectionApi.getFilteredByGlob filtra solo tra i
 * template GIÀ scoperti sotto `input`, non fa una scansione filesystem
 * indipendente — verificato leggendo node_modules/@11ty/eleventy/src/
 * TemplateCollection.js). Da qui la lettura manuale con gray-matter.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false });

export function loadRicette(contentDir = "content/ricette") {
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith(".md"));

  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(contentDir, file), "utf8");
      const { data, content } = matter(raw);
      return {
        data,
        corpoHtml: md.render(content.trim()),
      };
    })
    .sort((a, b) => a.data.titolo.localeCompare(b.data.titolo, "it"));
}
