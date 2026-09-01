#!/usr/bin/env python3
"""test_validar_catalogo.py — demuestra que validar_catalogo.py SÍ falla
cuando debe. Un validador que nadie ha visto fallar es una intención, no un
control: estos casos son fixtures de datos reales guardados en
scripts/fixtures_prueba/, no un `git show` de un commit roto.

Uso: python scripts/test_validar_catalogo.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from validar_catalogo import validar  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FIXTURES = RAIZ / "scripts" / "fixtures_prueba"
CSV_REAL = RAIZ / "data" / "catalogo.csv"

HTML_INDICE_MINIMO = """
<a class="line" href="catalogo/medicoquirurgicos.html">Medicoquirúrgicos</a>
<a class="line" href="catalogo/aseo-y-cafeteria.html">Aseo y cafetería</a>
<a class="line" href="catalogo/seguridad-industrial.html">Seguridad industrial</a>
<a class="line" href="catalogo/papeleria.html">Papelería</a>
<a class="line" href="catalogo/muebles-y-enseres.html">Muebles y enseres</a>
"""


class ValidacionCsvRealTest(unittest.TestCase):
    """El caso de control positivo: el CSV real debe pasar limpio."""

    def test_csv_real_no_tiene_errores_ni_advertencias_inesperadas(self) -> None:
        resultado = validar(
            datos_csv=CSV_REAL.read_bytes(),
            html_index=HTML_INDICE_MINIMO,
            total_anterior=None,
        )
        self.assertEqual(resultado.errores, [])
        self.assertEqual(resultado.advertencias, [])
        self.assertEqual(len(resultado.filas), 2877)


class CasoTruncadoTest(unittest.TestCase):
    """Fixture: CSV cortado a la mitad de las filas. Debe BLOQUEAR por la
    guardia de variación de truncamiento."""

    def test_truncamiento_50_por_ciento_bloquea(self) -> None:
        datos = (FIXTURES / "catalogo_truncado_50.csv").read_bytes()
        resultado = validar(datos_csv=datos, html_index=None, total_anterior=2877)
        self.assertFalse(resultado.ok)
        self.assertTrue(
            any("truncad" in e.lower() or "menos que la última" in e.lower() for e in resultado.errores),
            resultado.errores,
        )

    def test_truncamiento_se_puede_forzar_como_advertencia(self) -> None:
        datos = (FIXTURES / "catalogo_truncado_50.csv").read_bytes()
        resultado = validar(
            datos_csv=datos, html_index=None, total_anterior=2877, forzar_truncamiento=True
        )
        self.assertTrue(resultado.ok)
        self.assertTrue(resultado.advertencias)


class CasoCp1252Test(unittest.TestCase):
    """Fixture: mismo contenido, guardado de verdad en cp1252 (no UTF-8).
    Debe pasar (no bloquea) pero con advertencia — es el fallback, no un
    error."""

    def test_cp1252_da_advertencia_no_error(self) -> None:
        datos = (FIXTURES / "catalogo_cp1252.csv").read_bytes()
        resultado = validar(datos_csv=datos, html_index=None, total_anterior=None)
        self.assertTrue(resultado.ok, resultado.errores)
        self.assertTrue(
            any("cp1252" in a for a in resultado.advertencias), resultado.advertencias
        )
        self.assertGreater(len(resultado.filas), 0)


class CasoColumnaPrecioTest(unittest.TestCase):
    """Fixture: una columna 'Precio' de más. Debe BLOQUEAR — el CSV vive en
    un repo público."""

    def test_columna_precio_bloquea(self) -> None:
        datos = (FIXTURES / "catalogo_columna_precio.csv").read_bytes()
        resultado = validar(datos_csv=datos, html_index=None, total_anterior=None)
        self.assertFalse(resultado.ok)
        self.assertTrue(any("Precio" in e for e in resultado.errores), resultado.errores)


class CasoGrupoRenombradoTest(unittest.TestCase):
    """Fixture: el grupo PAPELERIA se renombra a PAPELERIA Y OFICINA en
    todas sus filas. El slug cambia, y el href estático de index.html
    ('catalogo/papeleria.html') queda huérfano. Debe BLOQUEAR."""

    def test_grupo_renombrado_deja_enlace_muerto_y_bloquea(self) -> None:
        datos = (FIXTURES / "catalogo_grupo_renombrado.csv").read_bytes()
        resultado = validar(datos_csv=datos, html_index=HTML_INDICE_MINIMO, total_anterior=None)
        self.assertFalse(resultado.ok)
        self.assertTrue(
            any("papeleria.html" in e and "enlace muerto" in e for e in resultado.errores),
            resultado.errores,
        )

    def test_sin_index_html_no_revienta_solo_no_revisa_enlaces(self) -> None:
        datos = (FIXTURES / "catalogo_grupo_renombrado.csv").read_bytes()
        resultado = validar(datos_csv=datos, html_index=None, total_anterior=None)
        self.assertTrue(resultado.ok, resultado.errores)


if __name__ == "__main__":
    unittest.main(verbosity=2)
