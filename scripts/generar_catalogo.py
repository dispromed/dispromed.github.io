#!/usr/bin/env python3
"""generar_catalogo.py — construye el catálogo publicado a partir de
data/catalogo.csv, ya validado.

No lee reglas de negocio propias: primero corre la MISMA validación que
scripts/validar_catalogo.py (import directo, no un segundo parser) y aborta
sin escribir nada si hay errores. index.html NUNCA se toca aquí — lo edita
un humano, no este script — para no romper el hash que compara
verificar-sitio.yml.

Determinista a propósito: dos ejecuciones seguidas sobre el mismo CSV deben
producir bytes idénticos (ni timestamps ni orden dependiente de hash), para
que el workflow de CI pueda usar `git diff` como prueba de "no hay nada que
commitear".

Uso:
    python scripts/generar_catalogo.py [--csv RUTA] [--index-html RUTA]
                                        [--out-root RUTA] [--forzar-truncamiento]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from html import escape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from catalogo_common import (  # noqa: E402
    GRUPO_DISPLAY,
    SUBGRUPO_DISPLAY,
    FilaCatalogo,
    formatear_miles,
    slugify,
    titulo_es,
)
from validar_catalogo import (  # noqa: E402
    RUTA_CSV_POR_DEFECTO,
    RUTA_INDEX_POR_DEFECTO,
    RUTA_RESUMEN_POR_DEFECTO,
    _leer_total_anterior,
    validar,
)

RAIZ_REPO = Path(__file__).resolve().parent.parent
DIR_CATALOGO = RAIZ_REPO / "catalogo"
DIR_DATA = RAIZ_REPO / "data"

CORREO_CONTACTO = "comercial1@dispromed.com.co"

# Las 5 variantes de color que ya existen en main.css (.line--brand/--ink/
# --pale/--mid/--soft). Se ciclan por ÍNDICE, no se asignan por nombre fijo:
# así una 6.a línea (o una 10.a) siempre cae en una variante con fondo
# declarado — nunca en ".line" a secas, que en main.css no trae fondo propio
# (solo min-height/maquetación) y deja el bloque transparente.
VARIANTES_LINEA = ("line--brand", "line--ink", "line--pale", "line--mid", "line--soft")

# Icono por línea, copiado tal cual del index.html aprobado (mismos paths,
# mismo viewBox 24x24) para que catalogo/index.html se vea como la home.
# Una línea que no esté en este mapa (una 6.a línea nueva en el CSV) usa
# ICONO_GENERICO — nunca se queda sin icono, igual que nunca se queda sin
# variante de color.
ICONOS_LINEA = {
    "MEDICOQUIRURGICOS": '<rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M12 8v8"/>',
    "ASEO Y CAFETERIA": (
        '<path d="M9 9h6v11a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>'
        '<path d="M10 9V6h4v3"/><path d="M14 5h3l2-2"/><path d="M11 13h2"/>'
    ),
    "SEGURIDAD INDUSTRIAL": (
        '<path d="M4 17a8 8 0 0 1 16 0"/>'
        '<path d="M9 17V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9"/><path d="M2.5 17h19"/>'
    ),
    "PAPELERIA": (
        '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>'
        '<path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>'
    ),
    "MUEBLES Y ENSERES": (
        '<path d="M6 5h12v7H6z"/><path d="M4.5 12h15"/><path d="M7.5 12v7"/><path d="M16.5 12v7"/>'
    ),
}
ICONO_GENERICO = '<path d="M12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>'

# El símbolo de flecha que usan las tarjetas vive en el sprite inline de la
# home (index.html) — catalogo/index.html es OTRO documento y un <use
# href="#flecha"> sin el <symbol> correspondiente no pinta nada (200 OK,
# cero errores de consola, invisible: el mismo fallo de los logotipos que ya
# costó una sesión aparte). Este sprite se repite aquí, mínimo, solo con lo
# que esta página usa.
SPRITE_FLECHA = """<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="flecha" viewBox="0 0 24 24">
    <g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
    </g>
  </symbol>
</svg>
"""


def _pluralizar(n: int, singular: str, plural: str) -> str:
    return f"{formatear_miles(n)} {singular if n == 1 else plural}"


@dataclass
class Subgrupo:
    nombre_original: str
    slug: str
    nombre_display: str
    filas: list[FilaCatalogo]


@dataclass
class Linea:
    nombre_original: str
    slug: str
    nombre_display: str
    subgrupos: list[Subgrupo]

    @property
    def total_productos(self) -> int:
        return sum(len(sg.filas) for sg in self.subgrupos)


def agrupar(filas: list[FilaCatalogo]) -> list[Linea]:
    por_grupo: dict[str, dict[str, list[FilaCatalogo]]] = defaultdict(lambda: defaultdict(list))
    for fila in filas:
        por_grupo[fila.grupo][fila.subgrupo].append(fila)

    lineas: list[Linea] = []
    # Orden fijo: el mismo orden visual que las 5 tarjetas de la home
    # (index.html #lineas), no alfabético — así los ficheros generados y el
    # sitemap presentan las líneas en el mismo orden que ve el visitante.
    for nombre_grupo in GRUPO_DISPLAY:
        subgrupos_dict = por_grupo.get(nombre_grupo)
        if not subgrupos_dict:
            continue
        subgrupos: list[Subgrupo] = []
        for nombre_sub, filas_sub in subgrupos_dict.items():
            filas_ordenadas = sorted(filas_sub, key=lambda f: (f.descripcion.lower(), f.codigo))
            subgrupos.append(
                Subgrupo(
                    nombre_original=nombre_sub,
                    slug=slugify(nombre_sub),
                    nombre_display=SUBGRUPO_DISPLAY.get(nombre_sub, titulo_es(nombre_sub)),
                    filas=filas_ordenadas,
                )
            )
        subgrupos.sort(key=lambda sg: sg.nombre_display)
        lineas.append(
            Linea(
                nombre_original=nombre_grupo,
                slug=slugify(nombre_grupo),
                nombre_display=GRUPO_DISPLAY[nombre_grupo],
                subgrupos=subgrupos,
            )
        )
    return lineas


# ---------------------------------------------------------------------------
# Fragmentos HTML compartidos
# ---------------------------------------------------------------------------

def _cabecera(titulo_boton_volver: str, href_boton_volver: str) -> str:
    return f"""<header class="site-header">
  <div class="wrap site-header__inner">
    <a class="logo" href="../index.html" aria-label="Dispromed — inicio">
      <span class="logo__mark">
        <svg viewBox="0 0 100 100" aria-hidden="true" style="color:#fff">
          <g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round">
            <path d="M 59.27 21.47 A 30 30 0 0 1 78.53 40.73"/><path d="M 78.53 59.27 A 30 30 0 0 1 59.27 78.53"/>
            <path d="M 40.73 78.53 A 30 30 0 0 1 21.47 59.27"/><path d="M 21.47 40.73 A 30 30 0 0 1 40.73 21.47"/>
          </g>
          <g fill="currentColor"><circle cx="50" cy="20" r="10"/><circle cx="80" cy="50" r="10"/><circle cx="50" cy="80" r="10"/><circle cx="20" cy="50" r="10"/></g>
        </svg>
      </span>
      <span class="logo__word">DISPROMED</span>
    </a>
    <div style="flex:1"></div>
    <a class="btn btn--outline btn--sm" href="{href_boton_volver}">{escape(titulo_boton_volver)}</a>
  </div>
</header>
"""


def _pie() -> str:
    return f"""<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__legal" style="border-top:0;margin-top:0">
      <span>© 2026 Dispromed S.A.S. · NIT 830.502.109 · Medellín, Antioquia</span>
      <span class="powered">Powered by
        <a href="https://holaeli.app" target="_blank" rel="noopener"><img src="../assets/img/holaeli-wordmark-white.png" width="53" height="14" alt="Holaeli" loading="lazy"></a>
      </span>
    </div>
  </div>
</footer>
"""


def _head(titulo: str, descripcion: str, ruta_canonica: str, incluir_script: bool) -> str:
    script = (
        '\n<script defer src="../assets/js/catalogo.js?v=2"></script>' if incluir_script else ""
    )
    return f"""<!doctype html>
<html lang="es-CO">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(titulo)}</title>
<meta name="description" content="{escape(descripcion)}">
<link rel="canonical" href="https://dispromed.com.co/{ruta_canonica}">
<link rel="icon" href="../assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="../assets/css/main.css?v=12">{script}
<script defer src="../assets/js/efectos.js?v=1"></script>
</head>
<body>
"""


def _tabla_productos(filas: list[FilaCatalogo]) -> str:
    filas_html = "\n".join(
        f'      <tr><td>{escape(f.codigo)}</td><td>{escape(f.descripcion)}</td><td>{escape(titulo_es(f.unidad))}</td></tr>'
        for f in filas
    )
    return f"""    <div class="cat-tabla-wrap">
    <table class="cat-tabla">
      <thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th></tr></thead>
      <tbody>
{filas_html}
      </tbody>
    </table>
    </div>
"""


def _render_pagina_linea(linea: Linea) -> str:
    abrir = " open" if linea.total_productos <= 25 else ""
    resumen = (
        f"{_pluralizar(linea.total_productos, 'producto', 'productos')} en "
        f"{_pluralizar(len(linea.subgrupos), 'sublínea', 'sublíneas')}."
    )
    bloques_subgrupo = []
    for sg in linea.subgrupos:
        etiqueta = f"{escape(sg.nombre_display)} ({formatear_miles(len(sg.filas))})"
        bloques_subgrupo.append(
            f"""    <details class="cat-grupo" id="{sg.slug}"{abrir}>
      <summary>{etiqueta}</summary>
{_tabla_productos(sg.filas)}    </details>
"""
        )

    descripcion_meta = (
        f"{linea.nombre_display} — {resumen} Distribución de insumos institucionales, Dispromed S.A.S."
    )

    return (
        _head(
            titulo=f"{linea.nombre_display} — Catálogo Dispromed",
            descripcion=descripcion_meta,
            ruta_canonica=f"catalogo/{linea.slug}.html",
            incluir_script=True,  # abre el <details> de la sublinea si la URL trae #ancla
        )
        + _cabecera("‹ Todo el catálogo", "index.html")
        + f"""
<main class="wrap doc" style="max-width:920px">
  <p class="eyebrow">Catálogo</p>
  <h1>{escape(linea.nombre_display)}</h1>
  <p class="doc__meta">{resumen}</p>

{"".join(bloques_subgrupo)}
  <div class="note-bar" style="margin-top:32px">
    <p class="note-bar__text"><strong>¿No encuentras algo de esta línea?</strong> Pregúntanos — buena parte de lo que hoy manejamos empezó siendo el pedido especial de un cliente.</p>
    <a class="btn btn--outline btn--sm" href="mailto:{CORREO_CONTACTO}?subject=Consulta%20de%20cat%C3%A1logo">Consultar disponibilidad</a>
  </div>
</main>
"""
        + _pie()
        + "</body>\n</html>\n"
    )


def _render_pagina_indice(lineas: list[Linea]) -> str:
    total = sum(l.total_productos for l in lineas)
    tarjetas = []
    for i, linea in enumerate(lineas):
        variante = VARIANTES_LINEA[i % len(VARIANTES_LINEA)]
        icono_paths = ICONOS_LINEA.get(linea.nombre_original, ICONO_GENERICO)
        tarjetas.append(
            f"""      <a class="line {variante}" href="{linea.slug}.html">
        <svg class="line__icon" viewBox="0 0 24 24" fill="none" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{icono_paths}</svg>
        <span class="line__name">{escape(linea.nombre_display)}</span>
        <span class="line__more line__count">{_pluralizar(linea.total_productos, "producto", "productos")} <svg aria-hidden="true"><use href="#flecha"/></svg></span>
      </a>"""
        )

    return (
        _head(
            titulo="Catálogo completo — Dispromed",
            descripcion=(
                f"Las {len(lineas)} líneas de Dispromed, {formatear_miles(total)} referencias — "
                "busca por código o descripción."
            ),
            ruta_canonica="catalogo/index.html",
            incluir_script=True,
        )
        + SPRITE_FLECHA
        + _cabecera("Volver al inicio", "../index.html")
        + f"""
<main class="wrap" style="padding-top:56px;padding-bottom:88px">
  <p class="eyebrow">Catálogo completo</p>
  <h1 style="font-size:clamp(28px,3.4vw,40px);line-height:1.15;color:var(--ink);margin:14px 0 0">El catálogo completo de Dispromed</h1>
  <p style="font-size:16px;color:var(--muted);max-width:640px;margin:14px 0 0">
    {_pluralizar(total, "referencia", "referencias")} en {_pluralizar(len(lineas), "línea", "líneas")}.
    ¿No encuentras lo que buscas? Usa el buscador o pregúntale directo a un asesor.
  </p>

  <div class="cat-search">
    <label for="buscar-catalogo">Buscar por código o descripción</label>
    <input id="buscar-catalogo" type="search" placeholder="Ej: guante, jeringa, 2797…" autocomplete="off">
    <div id="resultados-busqueda" class="cat-search__resultados" aria-live="polite"></div>
    <noscript><p class="footnote">La búsqueda necesita JavaScript. Mientras tanto, entra directo a cada línea abajo.</p></noscript>
  </div>

  <div class="lines" style="margin-top:32px">
{chr(10).join(tarjetas)}
  </div>
</main>
"""
        + _pie()
        + "</body>\n</html>\n"
    )


def _resumen_json(lineas: list[Linea]) -> dict:
    return {
        "total_productos": sum(l.total_productos for l in lineas),
        "num_lineas": len(lineas),
        "num_sublineas": sum(len(l.subgrupos) for l in lineas),
        "lineas": [
            {
                "grupo": l.nombre_display,
                "slug": l.slug,
                "productos": l.total_productos,
                "sublineas": len(l.subgrupos),
            }
            for l in lineas
        ],
    }


def _indice_json(lineas: list[Linea]) -> dict:
    """Diccionario ANIDADO grupo -> sublínea -> {código: [descripción,
    unidad]} — la forma que mide más pequeña de las evaluadas (grupo y
    sublínea se escriben UNA vez por sublínea, no una vez por cada una de
    las 2.877 filas; código es la propia clave, no un valor repetido junto
    a ella). Sin campo `url`: es derivable en el cliente con la MISMA
    slugify (el nombre de grupo/sublínea con tilde y el nombre crudo del
    CSV en mayúsculas reducen al mismo slug, porque slugify() descarta
    acentos y mayúsculas por igual)."""
    indice: dict[str, dict[str, dict[str, list[str]]]] = {}
    for l in lineas:
        indice[l.nombre_display] = {
            sg.nombre_display: {f.codigo: [f.descripcion, titulo_es(f.unidad)] for f in sg.filas}
            for sg in l.subgrupos
        }
    return indice


def _sitemap_xml(lineas: list[Linea]) -> str:
    urls = ["", "catalogo/index.html"] + [f"catalogo/{l.slug}.html" for l in lineas] + [
        "politica-de-datos.html"
    ]
    entradas = "\n".join(
        f"  <url><loc>https://dispromed.com.co/{u}</loc></url>" for u in urls
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entradas}\n"
        "</urlset>\n"
    )


def _escribir(ruta: Path, contenido: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with ruta.open("w", encoding="utf-8", newline="\n") as f:
        f.write(contenido)


def generar(lineas: list[Linea], dir_catalogo: Path, dir_data: Path, raiz: Path) -> None:
    _escribir(dir_catalogo / "index.html", _render_pagina_indice(lineas))
    for linea in lineas:
        _escribir(dir_catalogo / f"{linea.slug}.html", _render_pagina_linea(linea))

    _escribir(
        dir_data / "resumen.json",
        json.dumps(_resumen_json(lineas), ensure_ascii=False, indent=2, sort_keys=False) + "\n",
    )
    _escribir(
        dir_data / "indice.json",
        # Compacto a propósito (sin indent, separadores sin espacio): este
        # fichero lo descarga el navegador para poder buscar, no lo lee una
        # persona. `resumen.json` (36 líneas) sí se queda legible arriba.
        json.dumps(_indice_json(lineas), ensure_ascii=False, separators=(",", ":")) + "\n",
    )
    _escribir(raiz / "sitemap.xml", _sitemap_xml(lineas))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=RUTA_CSV_POR_DEFECTO)
    parser.add_argument("--index-html", type=Path, default=RUTA_INDEX_POR_DEFECTO)
    parser.add_argument("--out-root", type=Path, default=RAIZ_REPO)
    parser.add_argument("--forzar-truncamiento", action="store_true")
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: no existe el archivo {args.csv}")
        return 1

    datos_csv = args.csv.read_bytes()
    html_index = args.index_html.read_text(encoding="utf-8") if args.index_html.exists() else None
    ruta_resumen = args.out_root / "data" / "resumen.json"
    total_anterior = _leer_total_anterior(ruta_resumen)

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

    if not resultado.ok:
        print("BLOQUEADO — no se genera nada. El catálogo publicado no cambia.")
        return 1

    lineas = agrupar(resultado.filas)
    generar(
        lineas,
        dir_catalogo=args.out_root / "catalogo",
        dir_data=args.out_root / "data",
        raiz=args.out_root,
    )

    print(
        f"Generado — {formatear_miles(sum(l.total_productos for l in lineas))} productos en "
        f"{len(lineas)} líneas."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
