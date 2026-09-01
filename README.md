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
assets/img/                favicon y, más adelante, las fotos
robots.txt                 TEMPORAL: bloquea la indexación mientras no haya dominio propio
.nojekyll                  Pages sirve los ficheros tal cual, sin procesarlos
```

Tras cada `push`, el workflow **`verificar-sitio`** pide la página por HTTPS desde fuera y compara su huella con la del `index.html` de ese commit. Existe porque el fallo peligroso de Pages no es el ruidoso: es el despliegue que **termina en verde y no cambia lo que ve el usuario**. La consola informa de la intención; solo un `curl` desde fuera informa del resultado.

---

## Lista de go-live — nada de esto está hecho

**Contenido** — los `[CORCHETES]` de `index.html` los completa Dispromed:

- [ ] `[N]` referencias · `[AÑOS]` de operación
- [ ] `[NIT]` · `[DIRECCIÓN]` · `[CIUDAD]`
- [ ] `[TELÉFONO]` · `[WHATSAPP]` · `[HORARIO DE ATENCIÓN]`
- [ ] Foto real del banner — horizontal, con espacio libre a la izquierda para el texto
- [ ] Confirmar los 8 sectores: los deduje del catálogo, no de una lista suya
- [ ] Confirmar qué marcas se pueden declarar como **distribución autorizada** (estar en el catálogo no basta) y conseguir sus logotipos en SVG
- [ ] Redactar la **política de tratamiento de datos** (Ley 1581 de 2012). Hoy es un marcador.

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
