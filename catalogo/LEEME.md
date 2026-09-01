# No edites estos ficheros a mano

Todo lo que hay en esta carpeta (`index.html` y cada `<línea>.html`), además
de `data/indice.json`, `data/resumen.json` y `sitemap.xml` en la raíz del
repositorio, se genera automáticamente a partir de `data/catalogo.csv`.

Un `push` que edite estos ficheros a mano se sobrescribe en el siguiente
`push` a `data/catalogo.csv` — el workflow `catalogo` los regenera siempre
desde cero, nunca los combina con ediciones manuales.

## Para cambiar el catálogo

Edita `data/catalogo.csv` y haz `push` a `main`. El workflow `catalogo`
(`.github/workflows/catalogo.yml`) valida el archivo y, si pasa, regenera
todo lo de esta carpeta automáticamente.

Si la validación falla, no se genera nada — el catálogo que ya está
publicado se queda como está. El error aparece en la pestaña *Actions* del
repositorio, en el job `catalogo`.

## Para probarlo en tu máquina antes de hacer push

```
python scripts/validar_catalogo.py
python scripts/generar_catalogo.py
python -m http.server 8000
```

Y abre `http://localhost:8000/catalogo/index.html`.

Detalle completo del pipeline: sección "Catálogo" en el `README.md` de la
raíz del repositorio.
