/*
 * catalogo.js — progresivo, no bloqueante, dos funciones independientes:
 *
 *  1. Rellena los `data-stat="lineas"` / `data-stat="sublineas"` de la home
 *     con los números reales de data/resumen.json. Si falla el fetch (o no
 *     hay JS), el literal ya escrito en el HTML se queda tal cual — no es
 *     un placeholder vacío, es el valor correcto en el momento en que se
 *     editó index.html a mano.
 *
 *  2. Busca en data/indice.json cuando la página tiene el cuadro de
 *     búsqueda de catalogo/index.html. Se carga una sola vez, perezoso
 *     (solo si el cuadro existe en el DOM). La búsqueda es enlazable:
 *     ?q=término en la URL, sincronizada con history.replaceState (nunca
 *     pushState — cada tecla no debe ensuciar el botón atrás).
 *
 * Cero dependencias, cero build — coherente con el resto del sitio.
 */
(function () {
  'use strict';

  // Rango Unicode 0300-036F (diacríticos combinantes que deja NFKD),
  // construido por código de carácter en vez de como literal de regex:
  // así no hay ningún glifo combinante ni secuencia de escape en el
  // código fuente que un editor o un transporte de texto puedan mutilar.
  var RANGO_DIACRITICOS = new RegExp(
    '[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']', 'g'
  );

  function normalizarBusqueda(texto) {
    return texto.normalize('NFKD').replace(RANGO_DIACRITICOS, '').toLowerCase();
  }

  // Mismo algoritmo que scripts/catalogo_common.py::slugify — grupo/subgrupo
  // ya vienen con tilde y mayúscula inicial desde data/indice.json, pero
  // slugify() descarta acentos y mayúsculas por igual, así que el slug que
  // sale de aquí es IDÉNTICO al que el generador calculó del nombre crudo
  // del CSV para nombrar el fichero/ancla. Evita guardar una URL
  // precalculada por cada una de las 2.877 filas del índice.
  function slugify(texto) {
    var sinTildes = texto.normalize('NFKD').replace(RANGO_DIACRITICOS, '');
    var minusculas = sinTildes.toLowerCase();
    var conGuiones = minusculas.replace(/[^a-z0-9]+/g, '-');
    return conGuiones.replace(/^-+|-+$/g, '');
  }

  function rutaDatos(nombre) {
    // catalogo.js se sirve tanto desde "assets/js/" (home) como desde
    // "../assets/js/" (catalogo/*.html) — la ruta a data/ se resuelve
    // relativa a la posición del propio script, no a la página que lo usa.
    var scripts = document.getElementsByTagName('script');
    var actual = scripts[scripts.length - 1];
    var base = actual && actual.src ? actual.src.replace(/assets\/js\/catalogo\.js.*$/, '') : '';
    return base + 'data/' + nombre;
  }

  function rellenarCifrasHome() {
    var nodos = document.querySelectorAll('[data-stat]');
    if (!nodos.length) return;

    fetch(rutaDatos('resumen.json'))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (resumen) {
        if (!resumen) return;
        nodos.forEach(function (nodo) {
          var clave = nodo.getAttribute('data-stat');
          if (clave === 'lineas' && typeof resumen.num_lineas === 'number') {
            nodo.textContent = resumen.num_lineas;
          } else if (clave === 'sublineas' && typeof resumen.num_sublineas === 'number') {
            nodo.textContent = resumen.num_sublineas;
          }
        });
      })
      .catch(function () {
        // Sin conexión o sin data/resumen.json: se queda el literal escrito
        // a mano en index.html. No es un error del usuario, no se le informa.
      });
  }

  // data/indice.json llega como diccionario ANIDADO grupo -> sublínea ->
  // {código: [descripción, unidad]} (ver generar_catalogo.py::_indice_json)
  // — se aplana UNA vez, en memoria, a un array de filas planas para que el
  // resto de la búsqueda no tenga que conocer la forma de transporte.
  function aplanarIndice(indice) {
    var filas = [];
    Object.keys(indice).forEach(function (grupo) {
      var sublineas = indice[grupo];
      Object.keys(sublineas).forEach(function (subgrupo) {
        var productos = sublineas[subgrupo];
        Object.keys(productos).forEach(function (codigo) {
          var par = productos[codigo];
          filas.push({
            codigo: codigo,
            descripcion: par[0],
            unidad: par[1],
            grupo: grupo,
            subgrupo: subgrupo
          });
        });
      });
    });
    return filas;
  }

  var LIMITE_PAGINA = 50;

  function iniciarBusqueda() {
    var input = document.getElementById('buscar-catalogo');
    var resultados = document.getElementById('resultados-busqueda');
    if (!input || !resultados) return;

    var filas = null;
    var cargando = null;
    var resultadosActuales = [];
    var mostrados = 0;
    var terminoActual = '';

    function cargarIndice() {
      if (filas) return Promise.resolve(filas);
      if (!cargando) {
        cargando = fetch(rutaDatos('indice.json'))
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (indice) { filas = aplanarIndice(indice); return filas; })
          .catch(function () { filas = []; return filas; });
      }
      return cargando;
    }

    function escaparHtml(texto) {
      var div = document.createElement('div');
      div.textContent = String(texto == null ? '' : texto);
      return div.innerHTML;
    }

    function urlProducto(item) {
      return '/catalogo/' + slugify(item.grupo) + '.html#' + slugify(item.subgrupo);
    }

    function renderizarPagina() {
      var lote = resultadosActuales.slice(0, mostrados);
      var lista = lote.map(function (item) {
        return (
          '<a class="cat-search__item" href="' + escaparHtml(urlProducto(item)) + '">' +
          '<span class="cat-search__cod">' + escaparHtml(item.codigo) + '</span>' +
          '<span class="cat-search__desc">' + escaparHtml(item.descripcion) + '</span>' +
          '<span class="cat-search__linea">' + escaparHtml(item.grupo) + ' › ' + escaparHtml(item.subgrupo) + '</span>' +
          '</a>'
        );
      }).join('');

      var quedan = resultadosActuales.length - mostrados;
      var boton = quedan > 0
        ? '<button type="button" class="cat-search__mas" id="cat-search-mas">Mostrar ' +
          Math.min(LIMITE_PAGINA, quedan) + ' más (' + quedan + ' restantes)</button>'
        : '';

      resultados.innerHTML = lista + boton;

      var btn = document.getElementById('cat-search-mas');
      if (btn) {
        btn.addEventListener('click', function () {
          mostrados += LIMITE_PAGINA;
          renderizarPagina();
        });
      }
    }

    function pintar(items, termino) {
      resultadosActuales = items;
      if (!termino) {
        resultados.innerHTML = '';
        resultados.hidden = true;
        return;
      }
      resultados.hidden = false;
      if (!items.length) {
        resultados.innerHTML = '<p class="cat-search__vacio">Sin resultados para "' +
          escaparHtml(termino) + '". Prueba con otra palabra o revisa las líneas abajo.</p>';
        return;
      }
      mostrados = Math.min(LIMITE_PAGINA, items.length);
      renderizarPagina();
    }

    function actualizarUrl(termino) {
      var url = new URL(window.location.href);
      if (termino) {
        url.searchParams.set('q', termino);
      } else {
        url.searchParams.delete('q');
      }
      // replaceState, nunca pushState: cada tecla escrita no debe crear una
      // entrada en el historial — solo se quiere que la URL final, una vez
      // compartida, reabra la misma búsqueda.
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    function ejecutarBusqueda(termino) {
      terminoActual = termino;
      actualizarUrl(termino);
      if (!termino) {
        pintar([], '');
        return;
      }
      cargarIndice().then(function (datos) {
        if (termino !== terminoActual) return; // llegó tarde, ya hay otra búsqueda en curso
        var buscado = normalizarBusqueda(termino);
        var encontrados = datos.filter(function (item) {
          return (
            normalizarBusqueda(item.descripcion).indexOf(buscado) !== -1 ||
            item.codigo.indexOf(termino) !== -1
          );
        });
        pintar(encontrados, termino);
      });
    }

    var temporizador = null;
    input.addEventListener('input', function () {
      var termino = input.value.trim();
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(function () {
        ejecutarBusqueda(termino);
      }, 150);
    });

    // Un enlace compartido con ?q=... llega con la búsqueda ya hecha, sin
    // esperar a que la persona teclee de nuevo lo que ya venía en la URL.
    var qInicial = new URLSearchParams(window.location.search).get('q');
    if (qInicial) {
      input.value = qInicial;
      ejecutarBusqueda(qInicial);
    }
  }

  // Al llegar a catalogo/<linea>.html#<ancla> (por ejemplo desde un
  // resultado de busqueda), el navegador solo hace scroll hasta el
  // <details> -- si esta cerrado (lineas de mas de 25 filas: todas menos
  // Muebles y enseres), el contenido de esa sublinea queda invisible sin
  // que nada lo avise. Forzar `.open = true` es lo que falta.
  function abrirDetallesDesdeAncla() {
    var id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el || el.tagName !== 'DETAILS') return;
    if (!el.open) {
      el.open = true;
      // El navegador ya intento desplazarse con el <details> cerrado (otra
      // altura); una vez abierto, se reencuadra para que quede a la vista.
      el.scrollIntoView({ block: 'start' });
    }
  }

  function iniciar() {
    rellenarCifrasHome();
    iniciarBusqueda();
    abrirDetallesDesdeAncla();
    window.addEventListener('hashchange', abrirDetallesDesdeAncla);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
