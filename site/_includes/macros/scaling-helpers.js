/**
 * Serializza il campo `scala` di un ingrediente (vedi CLAUDE.md, sezione
 * "Scaling delle porzioni" — Livello 2) negli attributi data-* HTML che
 * site/assets/js/scaling.js legge a runtime per ricalcolare le quantità.
 *
 * Le 4 forme ammesse per `scala`:
 *   - assente (default)      -> data-scale="linear" data-base="<quantita>"
 *   - "fisso"                -> data-scale="fisso"  data-base="<quantita>"
 *   - numero (es. 0.7)       -> data-scale="0.7"    data-base="<quantita>"
 *   - mappa scaglioni        -> data-scale="steps"  data-steps='{"1-2":2,...}'
 *
 * NOTA sul caso "fisso": la bozza HTML originale (site/preview/*.html) non
 * gestiva affatto questo caso nel JS — un ingrediente `scala: fisso` finiva
 * nel branch "moltiplicatore numerico" con parseFloat("fisso") = NaN. Qui è
 * gestito esplicitamente, corrispondente al branch dedicato in scaling.js.
 *
 * `quantita: null` (ammesso solo con unita "q.b.") viene serializzato come
 * data-base vuoto — scaling.js lo riconosce e non prova a fare aritmetica.
 */
export function scalingAttrs(ing) {
  const base = ing.quantita === null || ing.quantita === undefined ? "" : String(ing.quantita);
  const attrs = {};

  if (ing.scala === null || ing.scala === undefined) {
    attrs["data-scale"] = "linear";
    attrs["data-base"] = base;
  } else if (ing.scala === "fisso") {
    attrs["data-scale"] = "fisso";
    attrs["data-base"] = base;
  } else if (typeof ing.scala === "number") {
    attrs["data-scale"] = String(ing.scala);
    attrs["data-base"] = base;
  } else if (typeof ing.scala === "object") {
    attrs["data-scale"] = "steps";
    attrs["data-steps"] = JSON.stringify(ing.scala);
  } else {
    // forma non riconosciuta: fallback sicuro, non blocca il build
    attrs["data-scale"] = "linear";
    attrs["data-base"] = base;
  }

  return Object.entries(attrs)
    .map(([k, v]) => `${k}='${v}'`)
    .join(" ");
}
