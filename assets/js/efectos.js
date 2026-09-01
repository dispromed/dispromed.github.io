/*
 * efectos.js — el movimiento de la portada, en cuatro piezas independientes.
 *
 * Lo que NO hace: animar. Las animaciones viven en main.css y las gobierna el
 * propio scroll vía `animation-timeline: view()`. Este fichero solo prepara el
 * terreno (parte los titulares en palabras, marca la sección activa) y cubre a
 * los navegadores que todavía no saben ligar animación y scroll.
 *
 * Contrato de seguridad, en dos direcciones:
 *
 *   · Sin este fichero, la página se ve entera. En los navegadores con scroll
 *     timelines porque esconder y revelar son la misma regla CSS; en los demás
 *     porque el escondido cuelga de `html.js`, la clase que ponemos abajo en la
 *     primera línea ejecutable.
 *   · Sin conexión a data/resumen.json, las cifras se quedan con el literal del
 *     HTML. El contador nunca inventa un número: lo lee del DOM.
 *
 * Convive con catalogo.js, que escribe las cifras de forma asíncrona. Ver
 * `contarCifra` para cómo se resuelve esa carrera sin que ninguno de los dos
 * tenga que conocer al otro.
 *
 * Cero dependencias, cero build — coherente con el resto del sitio.
 */
(function () {
  'use strict';

  var raiz = document.documentElement;

  // Primera línea ejecutable, y va antes que nada: es la que autoriza al CSS a
  // esconder contenido en la rama sin scroll timelines. Si este fichero fallara
  // más abajo, ya da igual — pero si fallara ANTES de aquí, nada se esconde.
  raiz.classList.add('js');

  var MENOS_MOVIMIENTO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HAY_SCROLL_TIMELINE = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));


  /* ===========================================================================
     1 · Titulares partidos en palabras
     ===========================================================================
     El troceado ocurre AQUÍ, en el navegador, y no en index.html a propósito:
     .github/workflows/verificar-sitio.yml comprueba que el titular aparezca
     como frase contigua en el HTML servido. Partirlo en el fichero pondría ese
     control en rojo con la página perfecta.

     Se recorren solo nodos de texto, así que un <br> o un <strong> dentro del
     titular sobreviven intactos. */
  var titulares = [];

  function partirEnPalabras(elemento) {
    var indice = 0;
    var pendientes = [];

    (function recorrer(nodo) {
      Array.prototype.slice.call(nodo.childNodes).forEach(function (hijo) {
        if (hijo.nodeType === 3) { pendientes.push(hijo); return; }
        if (hijo.nodeType === 1) recorrer(hijo);
      });
    })(elemento);

    var palabras = [];

    pendientes.forEach(function (textoNodo) {
      var trozos = textoNodo.nodeValue.split(/(\s+)/);
      var fragmento = document.createDocumentFragment();

      trozos.forEach(function (trozo) {
        if (trozo === '') return;
        if (/^\s+$/.test(trozo)) {
          fragmento.appendChild(document.createTextNode(trozo));
          return;
        }
        var palabra = document.createElement('span');
        palabra.className = 'w';
        palabra.style.setProperty('--i', indice++);
        palabra.textContent = trozo;
        fragmento.appendChild(palabra);
        palabras.push(palabra);
      });

      textoNodo.parentNode.replaceChild(fragmento, textoNodo);
    });

    if (palabras.length) titulares.push({ nodo: elemento, palabras: palabras });
  }

  if (!MENOS_MOVIMIENTO) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-palabras]'), partirEnPalabras);
  }

  /* ===========================================================================
     2 · Cifras que cuentan
     ===========================================================================
     La carrera con catalogo.js: aquel hace fetch de data/resumen.json y escribe
     el textContent cuando llega. Si el fetch aterriza a media animación, los
     dos estarían escribiendo el mismo nodo.

     No se resuelve coordinando (ninguno de los dos debería conocer al otro),
     sino RE-APUNTANDO: un MutationObserver vigila el nodo, y si alguien que no
     somos nosotros cambia el texto, ese valor pasa a ser el nuevo destino de la
     cuenta. El último en hablar tiene razón, y la animación va hacia allí en
     vez de pelearse. Para saber si el cambio es nuestro basta comparar con lo
     último que escribimos — no hace falta desconectar y reconectar. */
  function separarMiles(numero) {
    return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function leerNumero(texto) {
    var limpio = String(texto).replace(/[^\d]/g, '');
    return limpio === '' ? null : parseInt(limpio, 10);
  }

  function contarCifra(nodo) {
    if (MENOS_MOVIMIENTO || nodo.dataset.contando === '1') return;

    var destino = leerNumero(nodo.textContent);
    if (destino === null) return;

    nodo.dataset.contando = '1';

    var vigilante = new MutationObserver(function () {
      if (nodo.textContent === nodo.dataset.ultimo) return;   // lo escribimos nosotros
      var nuevo = leerNumero(nodo.textContent);
      if (nuevo !== null) destino = nuevo;                    // manda el recién llegado
    });
    vigilante.observe(nodo, { childList: true, characterData: true, subtree: true });

    function escribir(valor) {
      var texto = separarMiles(valor);
      nodo.dataset.ultimo = texto;
      nodo.textContent = texto;
    }

    var inicio = null;
    var DURACION = 1200;

    function paso(marca) {
      if (inicio === null) inicio = marca;
      var avance = Math.min((marca - inicio) / DURACION, 1);
      escribir(Math.round(destino * (1 - Math.pow(1 - avance, 3))));
      if (avance < 1) {
        requestAnimationFrame(paso);
      } else {
        escribir(destino);
        vigilante.disconnect();
        nodo.dataset.contando = '0';
      }
    }

    escribir(0);
    requestAnimationFrame(paso);
  }

  /* ===========================================================================
     3 · Entrada en pantalla
     ===========================================================================
     Dos trabajos distintos con el mismo observador:
       · disparar las cifras — siempre, en todos los navegadores;
       · revelar bloques y encender palabras — solo donde el CSS no puede
         hacerlo ligado al scroll. */
  var bloques = Array.prototype.slice.call(document.querySelectorAll('[data-anima]'));

  if (!HAY_SCROLL_TIMELINE && !MENOS_MOVIMIENTO) {
    bloques.forEach(function (bloque) {
      var hermanos = Array.prototype.filter.call(bloque.parentNode.children, function (n) {
        return n.hasAttribute && n.hasAttribute('data-anima');
      });
      bloque.style.transitionDelay = Math.min(hermanos.indexOf(bloque), 6) * 70 + 'ms';
    });
  }

  var alEntrar = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('is-in');
      var cifra = entrada.target.querySelector('[data-stat]');
      if (cifra) contarCifra(cifra);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  bloques.forEach(function (bloque) { alEntrar.observe(bloque); });

  if (!HAY_SCROLL_TIMELINE && !MENOS_MOVIMIENTO) {
    var alEntrarTitular = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        var titular = titulares.filter(function (t) { return t.nodo === entrada.target; })[0];
        if (!titular) return;
        titular.palabras.forEach(function (palabra, i) {
          palabra.style.transitionDelay = Math.min(i, 18) * 45 + 'ms';
          palabra.classList.add('is-lit');
        });
        alEntrarTitular.unobserve(entrada.target);
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -10% 0px' });

    titulares.forEach(function (t) { alEntrarTitular.observe(t.nodo); });
  }

  /* ===========================================================================
     4 · Cabecera, foco del cursor y sección activa
     =========================================================================== */
  var cabecera = document.querySelector('.site-header');
  if (cabecera) {
    var alDesplazar = function () {
      cabecera.classList.toggle('is-stuck', window.scrollY > 40);
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    alDesplazar();
  }

  // El foco de las tarjetas se dibuja con un degradado centrado en --mx/--my.
  // pointermove cubre ratón y lápiz; en táctil no hay hover y no se activa.
  if (!MENOS_MOVIMIENTO) {
    Array.prototype.forEach.call(document.querySelectorAll('.line'), function (tarjeta) {
      tarjeta.addEventListener('pointermove', function (evento) {
        var caja = tarjeta.getBoundingClientRect();
        tarjeta.style.setProperty('--mx', (evento.clientX - caja.left) + 'px');
        tarjeta.style.setProperty('--my', (evento.clientY - caja.top) + 'px');
      });
    });
  }

  var enlaces = {};
  Array.prototype.forEach.call(document.querySelectorAll('.nav a[href^="#"]'), function (a) {
    enlaces[a.getAttribute('href').slice(1)] = a;
  });

  if (Object.keys(enlaces).length) {
    // La franja -45%/-50% deja activa la sección que ocupa la banda central de
    // la pantalla, no la que asoma por abajo: si no, el subrayado va siempre
    // una sección por delante de lo que el visitante está leyendo.
    var seccionActiva = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        var a = enlaces[entrada.target.id];
        if (!a || !entrada.isIntersecting) return;
        Object.keys(enlaces).forEach(function (k) { enlaces[k].classList.remove('is-active'); });
        a.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Object.keys(enlaces).forEach(function (id) {
      var seccion = document.getElementById(id);
      if (seccion) seccionActiva.observe(seccion);
    });
  }
})();
