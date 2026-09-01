"""catalogo_common.py — pieza compartida del pipeline de catálogo de Dispromed.

Única copia del parser delicado (slugify, nombres de línea, detección de
codificación, patrones de bloqueo). La importan tanto `validar_catalogo.py`
como `generar_catalogo.py` — si existieran dos copias podrían divergir y un
slug válido para uno dejaría de serlo para el otro. Solo librería estándar:
el sitio no tiene build ni dependencias, y este pipeline tampoco las tiene.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Columnas del CSV de origen
# ---------------------------------------------------------------------------

COLUMNAS_REQUERIDAS = ("Código", "Descripción", "Unidad", "Sub Grupo", "Grupo")

# Cualquier nombre de columna que normalice a uno de estos términos bloquea
# la validación entera: el CSV vive en un repositorio público, así que una
# columna de precio/costo/margen quedaría publicada aunque la web nunca la
# pinte. Esto es el hallazgo de seguridad central del contrato del dato.
PATRON_COLUMNA_PROHIBIDA = re.compile(r"precio|costo|valor|iva|utilidad|margen")

# Trigramas de mojibake tal como los fija el contrato del dato: bytes cp1252
# reinterpretados como UTF-8 producen secuencias válidas pero garabateadas.
TRIGRAMAS_MOJIBAKE = ("Ã©", "Ã±", "Â")

# Umbral de la guardia de truncamiento: una caída de más del 30% en el número
# de filas respecto de la última generación exitosa bloquea la validación.
UMBRAL_TRUNCAMIENTO = 0.30

# Los 5 nombres de línea ya están aprobados y en prosa en index.html
# (nav, tarjetas de #lineas, pie). El CSV los trae en MAYÚSCULAS ASCII sin
# tildes — no se pueden reconstruir tildes por algoritmo sin arriesgar una
# ortografía distinta a la ya publicada, así que este mapa es literal.
GRUPO_DISPLAY = {
    "MEDICOQUIRURGICOS": "Medicoquirúrgicos",
    "ASEO Y CAFETERIA": "Aseo y cafetería",
    "SEGURIDAD INDUSTRIAL": "Seguridad industrial",
    "PAPELERIA": "Papelería",
    "MUEBLES Y ENSERES": "Muebles y enseres",
}

# Mismo motivo que GRUPO_DISPLAY (el CSV no trae tildes) pero para las 24
# Sub Grupo. Un title-case algorítmico no puede reconstruir una tilde que
# nunca estuvo en el origen ("LIQUIDOS" -> "Liquidos", ortografía incorrecta
# en español) — por eso es un mapa literal cerrado, igual que el de Grupo,
# revisado a mano una vez. Censo: 11 Medicoquirúrgicos + 7 Aseo y cafetería +
# 4 Seguridad industrial + 1 Papelería + 1 Muebles y enseres = 24.
SUBGRUPO_DISPLAY = {
    # Medicoquirúrgicos
    "AGUJAS": "Agujas",
    "DESECHABLES": "Desechables",
    "EQUIPOS": "Equipos",
    "ESPARADRAPOS": "Esparadrapos",
    "GASAS": "Gasas",
    "JERINGAS": "Jeringas",
    "LABORATORIO": "Laboratorio",
    "LIQUIDOS": "Líquidos",
    "MEDICAMENTOS": "Medicamentos",
    "SOLUCIONES": "Soluciones",
    "SUTURAS": "Suturas",
    # Aseo y cafetería
    "ASEO": "Aseo",
    "BOLSA BASURA": "Bolsa basura",
    "CAFETERIA": "Cafetería",
    "ELITE": "Elite",
    "EMPAQUES": "Empaques",
    "FAMILIA": "Familia",
    "TISSUE": "Tissue",
    # Seguridad industrial
    "DOTACIONES": "Dotaciones",
    "FERRETERIA": "Ferretería",
    "GUANTES": "Guantes",
    "SEGURIDAD INDUSTRIAL": "Seguridad industrial",
    # Papelería
    "PAPELERIA": "Papelería",
    # Muebles y enseres
    "MUEBLES Y ENSERES": "Muebles y enseres",
}

# Palabras cortas que van en minúscula dentro de un título en español,
# salvo que sean la primera palabra. Solo sirve de REPLIEGUE si el CSV trae
# un Sub Grupo nuevo que SUBGRUPO_DISPLAY todavía no tiene mapeado — nunca
# reconstruye tildes, así que un subgrupo nuevo con tilde debe añadirse a
# mano al mapa de arriba (ver README.md, sección Catálogo).
_PALABRAS_MENORES = {"y", "de", "del", "la", "el", "en", "al", "a"}

# Máximo de caracteres de descripción antes de advertir. El máximo medido en
# el CSV real es 63; se deja margen amplio para no generar ruido en cada fila
# ligeramente más larga que la de hoy.
UMBRAL_DESCRIPCION_LARGA = 80


def normalizar_encabezado(texto: str) -> str:
    """minúsculas, sin tildes, espacios colapsados — para comparar nombres
    de columna sin depender de mayúsculas/acentos/espacios sobrantes."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )
    return re.sub(r"\s+", " ", sin_tildes.strip().lower())


def es_columna_prohibida(nombre_encabezado: str) -> bool:
    return bool(PATRON_COLUMNA_PROHIBIDA.search(normalizar_encabezado(nombre_encabezado)))


def slugify(texto: str) -> str:
    """Slug determinista y sin dependencias: minúsculas, sin tildes,
    todo lo que no sea alfanumérico se vuelve guion, sin guiones dobles ni
    en los extremos. Es la ÚNICA función de slug del pipeline: la usan
    tanto el generador (nombres de fichero) como el validador (comprobar
    que los href de index.html siguen vivos)."""
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c)
    )
    minusculas = sin_tildes.lower()
    con_guiones = re.sub(r"[^a-z0-9]+", "-", minusculas)
    return con_guiones.strip("-")


def titulo_es(texto: str) -> str:
    """Title case con minúscula en conjunciones/preposiciones cortas,
    salvo en la primera palabra. Sin inventar tildes: el texto de origen
    no las trae y no hay forma segura de reconstruirlas."""
    palabras = texto.lower().split()
    resultado = []
    for i, palabra in enumerate(palabras):
        if i > 0 and palabra in _PALABRAS_MENORES:
            resultado.append(palabra)
        else:
            resultado.append(palabra.capitalize())
    return " ".join(resultado)


def formatear_miles(numero: int) -> str:
    """1234567 -> 1.234.567 (separador de miles colombiano) sin depender
    del módulo locale, poco fiable entre runners de CI."""
    return f"{numero:,}".replace(",", ".")


@dataclass
class ResultadoDecodificacion:
    texto: str
    codificacion: str
    advertencia: str | None = None


def decodificar_csv(datos: bytes) -> ResultadoDecodificacion:
    """UTF-8 estricto primero; cp1252 solo como fallback, con advertencia.
    El orden importa: un UTF-8 válido siempre gana."""
    try:
        return ResultadoDecodificacion(texto=datos.decode("utf-8-sig"), codificacion="utf-8")
    except UnicodeDecodeError:
        texto = datos.decode("cp1252")
        return ResultadoDecodificacion(
            texto=texto,
            codificacion="cp1252",
            advertencia=(
                "El archivo no es UTF-8 valido; se leyo como cp1252. "
                "Vuelve a guardarlo como UTF-8 para evitar este aviso."
            ),
        )


def contiene_mojibake(texto: str) -> str | None:
    """Devuelve el primer trigrama de mojibake encontrado, o None."""
    for trigrama in TRIGRAMAS_MOJIBAKE:
        if trigrama in texto:
            return trigrama
    return None


@dataclass
class FilaCatalogo:
    codigo: str
    descripcion: str
    unidad: str
    subgrupo: str
    grupo: str


@dataclass
class CsvParseado:
    filas: list[FilaCatalogo] = field(default_factory=list)
    columnas_extra: list[str] = field(default_factory=list)
    columnas_faltantes: list[str] = field(default_factory=list)
    columna_prohibida: str | None = None


def parsear_csv(texto: str) -> CsvParseado:
    """Parsea el texto ya decodificado con el csv de stdlib (delimitador
    ';'). No valida reglas de negocio: solo mapea columnas por NOMBRE
    normalizado, nunca por posición, y reporta que falta/sobra/esta
    prohibido para que el llamador decida si eso es error o advertencia."""
    lector = csv.DictReader(io.StringIO(texto), delimiter=";")
    encabezados_originales = lector.fieldnames or []

    resultado = CsvParseado()

    mapa_normalizado_a_original: dict[str, str] = {}
    for encabezado in encabezados_originales:
        if es_columna_prohibida(encabezado):
            resultado.columna_prohibida = encabezado
        mapa_normalizado_a_original[normalizar_encabezado(encabezado)] = encabezado

    requeridas_normalizadas = {normalizar_encabezado(c): c for c in COLUMNAS_REQUERIDAS}
    for normalizado, original in requeridas_normalizadas.items():
        if normalizado not in mapa_normalizado_a_original:
            resultado.columnas_faltantes.append(original)

    for normalizado, original in mapa_normalizado_a_original.items():
        if normalizado not in requeridas_normalizadas:
            resultado.columnas_extra.append(original)

    if resultado.columnas_faltantes or resultado.columna_prohibida:
        return resultado

    col_codigo = mapa_normalizado_a_original[normalizar_encabezado("Código")]
    col_desc = mapa_normalizado_a_original[normalizar_encabezado("Descripción")]
    col_unidad = mapa_normalizado_a_original[normalizar_encabezado("Unidad")]
    col_subgrupo = mapa_normalizado_a_original[normalizar_encabezado("Sub Grupo")]
    col_grupo = mapa_normalizado_a_original[normalizar_encabezado("Grupo")]

    for fila in lector:
        resultado.filas.append(
            FilaCatalogo(
                codigo=(fila.get(col_codigo) or "").strip(),
                descripcion=(fila.get(col_desc) or "").strip(),
                unidad=(fila.get(col_unidad) or "").strip(),
                subgrupo=(fila.get(col_subgrupo) or "").strip(),
                grupo=(fila.get(col_grupo) or "").strip(),
            )
        )

    return resultado
