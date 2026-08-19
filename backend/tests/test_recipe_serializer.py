"""Test del serializer: verifica che il contenuto generato sia YAML valido e
torni equivalente al modello originale (lo stesso controllo di sicurezza usato
prima di scrivere su GitHub, vedi recipe_serializer.verify_roundtrip)."""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.recipe_serializer import render_recipe_markdown, verify_roundtrip
from app.schemas.recipe import Ingrediente, Passo, RicettaIn


def _ricetta_completa() -> RicettaIn:
    """Ricalca tiramisu-al-caffe.md: copre tutte e 4 le forme di `scala`."""
    return RicettaIn(
        id="tiramisu-al-caffe",
        titolo="Tiramisù al caffè",
        categorie=["dolce", "senza cottura", "tradizione di famiglia", "festivo"],
        tempo_preparazione_min=30,
        tempo_cottura_min=0,
        porzioni_base=6,
        difficolta=1.5,
        autore="Mary",
        data_inserimento=date(2026, 8, 17),
        immagine_copertina="https://example-storage.com/tiramisu/copertina.jpg",
        video=None,
        racconto=None,
        strumenti=["planetaria"],
        ingredienti=[
            Ingrediente(nome="savoiardi", quantita=300, unita="g"),  # assente -> lineare
            Ingrediente(
                nome="uova", quantita=4, unita="pz",
                scala={"1-2": 2, "4": 4, "6": 6, "8": 8},  # scaglioni
            ),
            Ingrediente(nome="cacao amaro in polvere", quantita=20, unita="g", scala=0.7),  # moltiplicatore
            Ingrediente(nome="sale", quantita=None, unita="q.b.", scala="fisso"),  # fisso
        ],
        passi=[
            Passo(numero=1, testo="Montare i tuorli con lo zucchero.", foto=None, timer_sec=None),
            Passo(numero=2, testo="Riposo in frigo.", foto=None, timer_sec=14400),
        ],
        corpo_markdown="Ricetta di casa.",
    )


def test_roundtrip_ricetta_completa():
    r = _ricetta_completa()
    rendered = render_recipe_markdown(r)
    verify_roundtrip(rendered, r)  # non deve sollevare


def test_scaglioni_presenti_nel_rendered():
    r = _ricetta_completa()
    rendered = render_recipe_markdown(r)
    assert '"1-2": 2' in rendered
    assert '"8": 8' in rendered


def test_fisso_presente_nel_rendered():
    r = _ricetta_completa()
    rendered = render_recipe_markdown(r)
    assert "scala: fisso" in rendered


def test_moltiplicatore_presente_nel_rendered():
    r = _ricetta_completa()
    rendered = render_recipe_markdown(r)
    assert "scala: 0.7" in rendered


def test_ricetta_senza_passi():
    """Come ragu-della-domenica.md: passi assente/vuoto deve essere ammesso."""
    r = RicettaIn(
        id="ragu-test",
        titolo="Ragù di prova",
        categorie=["primo"],
        tempo_preparazione_min=20,
        tempo_cottura_min=180,
        porzioni_base=8,
        difficolta=3,
        autore="Nonna Anna",
        data_inserimento=date(2026, 8, 17),
        strumenti=[],
        ingredienti=[Ingrediente(nome="carne", quantita=600, unita="g")],
        passi=[],
        corpo_markdown="Note.",
    )
    rendered = render_recipe_markdown(r)
    verify_roundtrip(rendered, r)
    assert "passi:" not in rendered


def test_ricetta_non_scalabile():
    r = RicettaIn(
        id="torta-test",
        titolo="Torta di prova",
        categorie=["dolce"],
        tempo_preparazione_min=25,
        tempo_cottura_min=45,
        porzioni_base=8,
        difficolta=1.5,
        autore="Mary",
        data_inserimento=date(2026, 8, 19),
        strumenti=[],
        scalabile=False,
        nota_scalabilita="Teglia fissa da 24cm.",
        ingredienti=[Ingrediente(nome="farina", quantita=300, unita="g")],
        passi=[],
        corpo_markdown="Note.",
    )
    rendered = render_recipe_markdown(r)
    verify_roundtrip(rendered, r)
    assert "scalabile: false" in rendered
    assert "nota_scalabilita:" in rendered


if __name__ == "__main__":
    # Esecuzione manuale senza pytest: python tests/test_recipe_serializer.py
    import traceback

    test_fns = [v for k, v in list(globals().items()) if k.startswith("test_")]
    passed, failed = 0, 0
    for fn in test_fns:
        try:
            fn()
            print(f"OK   {fn.__name__}")
            passed += 1
        except Exception:
            print(f"FAIL {fn.__name__}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passati, {failed} falliti")
    sys.exit(1 if failed else 0)
