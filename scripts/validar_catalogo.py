#!/usr/bin/env python3
"""validar_catalogo.py — puerta de CI para data/catalogo.csv.

Bloquea lo que deja el sitio MAL (enlace muerto, mojibake, fuga de columna
sensible, catálogo mutilado). Advierte lo que solo lo deja INCOMPLETO
(código duplicado, descripción larga). Porque bloquear significa que el
catálogo anterior sigue publicado: viejo-y-correcto gana a nuevo-y-roto,
pero solo cuando lo nuevo está roto de verdad.

Salida: imprime cada hallazgo con su severidad y termina con código 0 si no
hubo errores (puede haber advertencias), o 1 si hubo al menos un error.

Uso:
    python scripts/validar_catalogo.py [--csv RUTA] [--index-html RUTA]
                                        [--resumen-anterior RUTA]
                                        [--forzar-truncamiento]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catalogo_common import (  # noqa: E402
    UMBRAL_DESCRIPCION_LARGA,
    UMBRAL_TRUNCAMIENTO,
    CsvParseado,
    FilaCatalogo,
    contiene_mojibake,
    decodificar_csv,
    parsear_csv,
    slugify,
)

RAIZ_REPO = Path(__file__).resolve().parent.parent
RUTA_CSV_POR_DEFECTO = RAIZ_REPO / "data" / "catalogo.csv"
RUTA_INDEX_POR_DEFECTO = RAIZ_REPO / "index.html"
RUTA_RESUMEN_POR_DEFECTO = RAIZ_REPO / "data" / "resumen.json"


class ResultadoValidacion:
    def __init__(self) -> None:
        self.errores: list[str] = []
        self.advertencias: list[str] = []
        self.filas: list[FilaCatalogo] = []

    @property
    def ok(self) -> bool:
        return not self.errores

    def error(self, mensaje: str) -> None:
        self.errores.append(mensaje)

    def advertir(self, mensaje: str) -> None:
        self.advertencias.append(mensaje)


class _ExtractorHrefsCatalogo(HTMLParser):
    """Recoge los href="catalogo/<slug>.html" que index.html declara hoy,
    para poder comprobar que cada uno tendrá página generada."""

    def __init__(self) -> None:
        super().__init__()
        self.slugs_referenciados: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href") or ""
        if href.startswith("catalogo/") and href.endswith(".html") and href != "catalogo/index.html":
            slug = href[len("catalogo/") : -len(".html")]
            self.slugs_referenciados.add(slug)


def extraer_slugs_referenciados(html_texto: str) -> set[str]:
    extractor = _ExtractorHrefsCatalogo()
    extractor.feed(html_texto)
    return extractor.slugs_referenciados


def validar(
    datos_csv: bytes,
    html_index: str | None,
    total_anterior: int | None,
    forzar_truncamiento: bool = False,
) -> ResultadoValidacion:
    resultado = ResultadoValidacion()

    decodificado = decodificar_csv(datos_csv)
    if decodificado.advertencia:
        resultado.advertir(decodificado.advertencia)

    trigrama = contiene_mojibake(decodificado.texto)
    if trigrama:
        resultado.error(
            f"El contenido tiene mojibake (se encontró la secuencia '{trigrama}'). "
            "El archivo probablemente se guardó con una codificación equivocada "
            "y luego se reinterpretó como UTF-8. Vuelve a exportarlo desde el "
            "origen en UTF-8."
        )
        return resultado

    parseado: CsvParseado = parsear_csv(decodificado.texto)

    if parseado.columna_prohibida:
        resultado.error(
            f"La columna '{parseado.columna_prohibida}' no puede publicarse: "
            "el CSV vive en un repositorio público y esa columna se filtraría "
            "aunque la web nunca la muestre. Quita la columna del archivo."
        )
        return resultado

    if parseado.columnas_faltantes:
        resultado.error(
            "Faltan columnas requeridas: " + ", ".join(parseado.columnas_faltantes)
        )
        return resultado

    for columna in parseado.columnas_extra:
        resultado.advertir(
            f"La columna '{columna}' no es una de las columnas esperadas y se "
            "ignoró al generar el catálogo."
        )

    if not parseado.filas:
        resultado.error("El archivo no tiene filas de producto.")
        return resultado

    resultado.filas = parseado.filas

    total_actual = len(parseado.filas)
    if total_anterior and total_anterior > 0:
        minimo_aceptable = total_anterior * (1 - UMBRAL_TRUNCAMIENTO)
        if total_actual < minimo_aceptable:
            mensaje = (
                f"El archivo tiene {total_actual} filas, un "
                f"{(1 - total_actual / total_anterior) * 100:.0f}% menos que la "
                f"última generación exitosa ({total_anterior}). Esto huele a "
                "archivo truncado o mal exportado."
            )
            if forzar_truncamiento:
                resultado.advertir(
                    mensaje + " Se continúa porque se forzó explícitamente "
                    "(workflow_dispatch)."
                )
            else:
                resultado.error(
                    mensaje + " Si de verdad el catálogo se redujo así de "
                    "golpe, vuelve a ejecutar el workflow manualmente forzando "
                    "el paso."
                )
                return resultado

    codigos = Counter(fila.codigo for fila in parseado.filas)
    for codigo, veces in codigos.items():
        if veces > 1:
            resultado.advertir(f"El código '{codigo}' aparece {veces} veces.")

    for fila in parseado.filas:
        if len(fila.descripcion) > UMBRAL_DESCRIPCION_LARGA:
            resultado.advertir(
                f"Descripción larga ({len(fila.descripcion)} caracteres) en el "
                f"código '{fila.codigo}': puede no verse bien en la página."
            )

    if html_index is not None:
        slugs_generados = {slugify(fila.grupo) for fila in parseado.filas}
        slugs_referenciados = extraer_slugs_referenciados(html_index)
        huerfanos = slugs_referenciados - slugs_generados
        for slug in sorted(huerfanos):
            resultado.error(
                f"index.html enlaza a 'catalogo/{slug}.html' pero ningún grupo "
                "del CSV genera ese slug. Es un enlace muerto — probablemente "
                "un Grupo cambió de nombre en el origen."
            )

    return resultado


def _leer_total_anterior(ruta_resumen: Path) -> int | None:
    if not ruta_resumen.exists():
        return None
    try:
        datos = json.loads(ruta_resumen.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    total = datos.get("total_productos")
    return total if isinstance(total, int) else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=RUTA_CSV_POR_DEFECTO)
    parser.add_argument("--index-html", type=Path, default=RUTA_INDEX_POR_DEFECTO)
    parser.add_argument("--resumen-anterior", type=Path, default=RUTA_RESUMEN_POR_DEFECTO)
    parser.add_argument(
        "--forzar-truncamiento",
        action="store_true",
        help="Convierte el bloqueo por truncamiento en advertencia (solo workflow_dispatch).",
    )
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: no existe el archivo {args.csv}")
        return 1

    datos_csv = args.csv.read_bytes()
    html_index = args.index_html.read_text(encoding="utf-8") if args.index_html.exists() else None
    total_anterior = _leer_total_anterior(args.resumen_anterior)

    resultado = validar(
        datos_csv=datos_csv,
        html_index=html_index,
        total_anterior=total_anterior,
        forzar_truncamiento=args.forzar_truncamiento,
    )

    for advertencia in resultado.advertencias:
        print(f"ADVERTENCIA: {advertencia}")
    for error in resultado.errores:
        print(f"ERROR: {error}")

    if resultado.ok:
        print(
            f"OK — {len(resultado.filas)} filas válidas, "
            f"{len(resultado.errores)} errores, {len(resultado.advertencias)} advertencias."
        )
        return 0

    print(
        f"BLOQUEADO — {len(resultado.errores)} errores, "
        f"{len(resultado.advertencias)} advertencias. No se regenera el catálogo."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
