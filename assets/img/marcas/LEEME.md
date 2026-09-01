# Logotipos de las marcas del riel

## Como se anade uno

1. Consigue el **SVG oficial** en el portal de socios o el kit de prensa de la marca.
   No lo bajes de resultados de busqueda: llegan versiones viejas, redibujos de
   terceros y PNG con fondo blanco.
2. Guardalo aqui con el nombre exacto de la tabla de abajo.
3. En `index.html`, cambia el texto de esa casilla por la imagen:

   ```html
   <!-- antes -->
   <span class="mq-item">3M</span>
   <!-- despues -->
   <span class="mq-item"><img src="assets/img/marcas/3m.svg" alt="3M"></span>
   ```

   Hay que cambiarlo **dos veces**: el riel repite la lista para que el bucle
   sea continuo, y la copia lleva `aria-hidden="true"`.
4. Sube la version del CSS (`main.css?v=N`) solo si tocaste el CSS.

El resto lo hace la hoja de estilo: escala de grises, opacidad al 55 %, color
al pasar el cursor y alineacion con las casillas que sigan siendo texto.
**Se puede migrar de una en una** — texto y logotipo conviven sin desalinearse.

## Antes de anadir ninguno

**Dispromed debe confirmar de cuales es distribuidor autorizado.** Publicar el
logotipo de una marca afirma una relacion comercial, y varias de estas companias
exigen autorizacion escrita a sus distribuidores antes de usar su marca.
Las que no se puedan declarar, se quedan en texto o salen del riel.

## Nombres de archivo esperados

| Marca | Archivo | Autorizado? |
|---|---|---|
| 3M | `3m.svg` | por confirmar |
| Johnson & Johnson | `johnson-johnson.svg` | por confirmar |
| BD | `bd.svg` | por confirmar |
| Kimberly-Clark | `kimberly-clark.svg` | por confirmar |
| ConvaTec | `convatec.svg` | por confirmar |
| BSN Medical | `bsn-medical.svg` | por confirmar |
| Baxter | `baxter.svg` | por confirmar |
| B. Braun | `b-braun.svg` | por confirmar |
| Nipro | `nipro.svg` | por confirmar |
| Smith+Nephew | `smith-nephew.svg` | por confirmar |
| Welch Allyn | `welch-allyn.svg` | por confirmar |
| Corpaul | `corpaul.svg` | por confirmar |
| Covidien | `covidien.svg` | por confirmar |
| Rymco | `rymco.svg` | por confirmar |
| Vital Medic | `vital-medic.svg` | por confirmar |
| Familia | `familia.svg` | por confirmar |
| Elite | `elite.svg` | por confirmar |
| Scott | `scott.svg` | por confirmar |
| WypAll | `wypall.svg` | por confirmar |
| Clorox | `clorox.svg` | por confirmar |
| Fabuloso | `fabuloso.svg` | por confirmar |
| Ansell | `ansell.svg` | por confirmar |
| Showa | `showa.svg` | por confirmar |
| Steelpro | `steelpro.svg` | por confirmar |
| Arseg | `arseg.svg` | por confirmar |
| Workseg | `workseg.svg` | por confirmar |
| Berhlan | `berhlan.svg` | por confirmar |
| Faber-Castell | `faber-castell.svg` | por confirmar |
| BIC | `bic.svg` | por confirmar |
| Pelikan | `pelikan.svg` | por confirmar |
| Sharpie | `sharpie.svg` | por confirmar |
| Epson | `epson.svg` | por confirmar |
| Norma | `norma.svg` | por confirmar |

Si solo hay PNG, que sea a `@2x` (unos 68 px de alto reales) y con fondo
transparente. El riel los sirve a 34 px.
