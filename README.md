# dispromed.github.io

Sitio público de **Dispromed** — distribución de insumos institucionales.

Estático, sin backend. Se sirve con GitHub Pages desde la rama `main`, carpeta raíz.

- **Hoy:** <https://dispromed.github.io/>
- **Destino:** <https://dispromed.com.co/> — todavía **no** activo

---

## Cómo se trabaja

No hay compilación ni dependencias. Se edita HTML y CSS, se hace `push` a `main`, y GitHub publica.

```
index.html                 la página
politica-de-datos.html     documento legal (PENDIENTE de redacción)
404.html
assets/css/main.css        todo el estilo
assets/js/catalogo.js      progresivo: cifras reales + buscador del catálogo
assets/img/                favicon y, más adelante, las fotos
data/catalogo.csv          fuente del catálogo — únicos ficheros que edita Dispromed (ver "Catálogo" abajo)
catalogo/                  GENERADO, no se edita a mano — catalogo/LEEME.md explica por qué
scripts/                   el pipeline que valida y genera el catálogo
robots.txt                 TEMPORAL: bloquea la indexación mientras no haya dominio propio
.nojekyll                  Pages sirve los ficheros tal cual, sin procesarlos
```

Tras cada `push`, el workflow **`verificar-sitio`** pide la página por HTTPS desde fuera y compara su huella con la del `index.html` de ese commit. Existe porque el fallo peligroso de Pages no es el ruidoso: es el despliegue que **termina en verde y no cambia lo que ve el usuario**. La consola informa de la intención; solo un `curl` desde fuera informa del resultado.

---

## Catálogo

El catálogo público (`catalogo/*.html`) **no se edita a mano** y la web
**nunca lee `data/catalogo.csv` directamente**. El único fichero que cambia
un cliente o un asesor es `data/catalogo.csv`; todo lo demás lo genera CI.

```
data/catalogo.csv          la fuente — lo único que se edita a mano
      ↓ push a main
.github/workflows/catalogo.yml
      ↓ valida (scripts/validar_catalogo.py)
      │   si falla: el job termina aquí, no se genera nada,
      │   el catálogo publicado sigue siendo el de antes
      ↓ genera (scripts/generar_catalogo.py)
catalogo/index.html, catalogo/<línea>.html,
data/indice.json, data/resumen.json, sitemap.xml
      ↓ el propio bot hace commit + push si algo cambió
```

**Por qué es así:** GitHub Pages publica lo que hay en `main` sin esperar a
ningún workflow. Si la web leyera el CSV directamente, un CSV roto ya
estaría publicado en el momento en que la validación se pusiera en rojo —
el control llegaría tarde. Generando el artefacto en CI, un CSV roto nunca
llega a convertirse en página: el `push` se queda validado-y-rechazado, y el
catálogo anterior sigue siendo lo que ve el visitante.

**index.html nunca lo toca el bot.** Si lo tocara, `verificar-sitio`
(que compara el sha256 del `index.html` de cada commit contra el publicado)
fallaría en rojo aunque todo estuviera bien. Las 5 tarjetas y los 5 enlaces
del pie que apuntan a `catalogo/<línea>.html` se editan a mano si el nombre
de un Grupo cambia — y el validador bloquea el `push` si detecta que un
enlace de `index.html` quedó apuntando a un slug que ya no existe.

**Qué bloquea la validación (el `push` no publica nada) y qué solo
advierte** (se publica igual, queda avisado): ver los comentarios de
`scripts/catalogo_common.py` y `scripts/validar_catalogo.py` — en resumen,
bloquea lo que deja el sitio mal (enlace muerto, mojibake, una columna de
precio/costo/margen — el CSV vive en un repo **público** —, una caída de más
del 30% en el número de filas); advierte lo que solo lo deja incompleto
(código duplicado, descripción larga).

**Prerrequisito de configuración — no es código, hay que activarlo en
Settings:** el workflow `catalogo` necesita permiso de escritura
(`permissions: contents: write`, ya declarado en el YAML) para poder hacer
el commit del catálogo regenerado. Si la organización tiene las
*Workflow permissions* del repositorio en solo lectura, el paso de commit
fallará con 403. Revisar en *Settings → Actions → General → Workflow
permissions → Read and write permissions* antes de fiarse de que el
pipeline completo funciona de punta a punta.

Para probarlo en tu máquina, sin tocar nada en remoto:

```
python scripts/test_validar_catalogo.py   # el validador SÍ falla cuando debe
python scripts/validar_catalogo.py
python scripts/generar_catalogo.py
python -m http.server 8000
```

**Test de humo del buscador (Playwright):** un resultado de búsqueda que se
ve bien pintado no prueba que el enlace navegue a alguna parte — un bug real
en producción (prefijo relativo en vez de absoluto en la URL construida por
`assets/js/catalogo.js`, `/catalogo/catalogo/...` → 404) se coló así, con
capturas correctas y cero errores de consola. `scripts/smoke_test_busqueda_enlaces.js`
hace clic de verdad en el primer resultado de una búsqueda en cada una de las
5 líneas, y comprueba que la página de destino responde 200 (no 404) y que el
`<details>` de esa sublínea queda abierto y visible — no solo que el enlace
se pinte. Levanta su propio servidor local, no hace falta arrancar nada a
mano:

```
node scripts/smoke_test_busqueda_enlaces.js
```

Requiere Playwright + Chromium ya instalados en otro sitio de esta máquina
(este repo sigue siendo cero-build/cero-npm; Playwright no se instala aquí).
Rutas configurables con las variables de entorno `PLAYWRIGHT_MODULE`,
`CHROMIUM_EXE` y `PYTHON_EXE` si hace falta apuntar a otra instalación —ver
los valores por defecto al principio del script.

Detalle de por qué cada fichero generado tiene la forma que tiene:
`catalogo/LEEME.md`.

---

## Lista de go-live — nada de esto está hecho

**Contenido:**

- [x] Razón social, NIT, dirección, ciudad, teléfono y horario — confirmados por el cliente el 2026-08-31
- [x] 23 años de operación
- [ ] **WhatsApp** — el cliente no lo dio; hoy la web no lo ofrece
- [ ] **Número real de referencias** — la cifra sale de contar el catálogo, no de estimarla
- [ ] Foto del banner — horizontal, con espacio libre a la izquierda para el texto
- [ ] Confirmar los 8 sectores: los deduje del catálogo, no de una lista suya
- [ ] Confirmar qué marcas se pueden declarar como **distribución autorizada** (estar en el catálogo no basta) y conseguir sus logotipos en SVG
- [ ] Redactar la **política de tratamiento de datos** (Ley 1581 de 2012). Hoy es un marcador, y el pie ya la enlaza.

**Publicación:**

- [ ] Quitar el `Disallow: /` de `robots.txt` ← si se olvida, Google nunca indexa el sitio
- [ ] Crear el fichero `CNAME` con `dispromed.com.co` (el workflow lo detecta solo)
- [ ] *Settings → Pages → Custom domain* y, cuando emita el certificado, **Enforce HTTPS**
- [ ] Segundo propietario de la organización, de parte de Dispromed

**DNS en GoDaddy — en este orden, y el orden importa:**

1. **Exportar la zona completa antes de tocar nada.** Es el único plan de contingencia.
2. Enviar y recibir un correo de prueba: hay que saber que funcionaba *antes*.
3. Quitar el reenvío de dominio, si existe.
4. Desconectar *Websites + Marketing* del dominio. **Nunca aceptar «restaurar la configuración DNS predeterminada»** — ahí es donde se pierde el correo.
5. Reemplazar los 2 registros `A` del parqueo por los de GitHub · añadir los `AAAA` · reapuntar el `CNAME` de `www`.
6. **Verificar los `MX` y el `SPF` en el minuto siguiente**, no al final del día. Otro correo de prueba.
7. Solo entonces mirar si la web se ve.

> **No tocar nunca:** los registros `MX`, el `TXT` de SPF y el `TXT` de `_dmarc`.
> Sostienen los seis buzones de `@dispromed.com.co` y no tienen nada que ver con la web.

---

## Decisiones tomadas

| | |
|---|---|
| Dominio | `dispromed.com.co` — es donde están los seis buzones. `dispromed.co` no se usa. |
| DNS | Se queda en GoDaddy. **No** se mueven los nameservers. |
| Nombre del repositorio | `dispromed.github.io` a propósito: como sitio de organización se sirve siempre en la raíz, así que las rutas de CSS e imágenes no se rompen si el dominio propio falla. |
| Botón «Entrar al portal» | Apunta a `app.holaeli.app`. El módulo de pedidos llega después. |
| Correo de contacto | `comercial1@dispromed.com.co` |
| Tipografía | Space Grotesk (titulares) + IBM Plex Sans (texto), vía Google Fonts |
| Azul de marca | `#12A5DC` — **nunca con texto blanco encima** (2,8:1, no pasa AA). Los botones van en `#0A6E9E`. |

Maqueta de origen y sistema de marca: `holaeli/docs/design/dispromed-web/`.
