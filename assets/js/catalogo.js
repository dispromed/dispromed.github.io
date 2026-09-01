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

  // Mismo algoritmo que scripts/catalogo_common.py::formatear_miles — no usa
  // toLocaleString()/Intl.NumberFormat porque ese separador depende del
  // locale configurado en el navegador del visitante (no siempre es-CO); el
  // resto del sitio ya usa el punto de miles colombiano como literal fijo.
  function formatearMiles(numero) {
    var texto = String(Math.trunc(numero));
    var negativo = texto.charAt(0) === '-';
    if (negativo) texto = texto.slice(1);
    var conPuntos = texto.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return negativo ? '-' + conPuntos : conPuntos;
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

  // El <script> de ESTE fichero, capturado en el momento en que se ejecuta.
  // `document.currentScript` es fiable aqui, incluido con `defer`.
  //
  // Antes se cogia el ULTIMO <script> del documento dando por hecho que era
  // este. Bastaba anadir cualquier otro script detras para que la ruta a data/
  // se calculara sobre el fichero equivocado ---y el `.catch()` de mas abajo,
  // que existe para no molestar al visitante sin conexion, escondia el fallo
  // sin un solo error en consola: la home se quedaba con los literales
  // escritos a mano y el buscador no encontraba nada. Paso de verdad al
  // anadir efectos.js. El fail-soft es correcto; la suposicion no lo era.
  // El guardia de `typeof document` no es defensivo porque si: scripts/
  // test_calculo_anios.js hace require() de este fichero en Node, donde no hay
  // DOM. La version anterior sobrevivia a eso por accidente ---leia el DOM
  // dentro de una funcion que el test nunca llama---; capturarlo aqui arriba
  // lo rompia. Se captura arriba a proposito: `document.currentScript` solo es
  // valido MIENTRAS el script se ejecuta, y para cuando alguien llama a
  // rutaDatos() ya vale null.
  var ESTE_SCRIPT = typeof document !== 'undefined'
    ? (document.currentScript || document.querySelector('script[src*="catalogo.js"]'))
    : null;

  function rutaDatos(nombre) {
    // catalogo.js se sirve tanto desde "assets/js/" (home) como desde
    // "../assets/js/" (catalogo/*.html) — la ruta a data/ se resuelve
    // relativa a la posición del propio script, no a la página que lo usa.
    var base = ESTE_SCRIPT && ESTE_SCRIPT.src
      ? ESTE_SCRIPT.src.replace(/assets\/js\/catalogo\.js.*$/, '')
      : '';
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
          } else if (clave === 'referencias' && typeof resumen.total_productos === 'number') {
            nodo.textContent = formatearMiles(resumen.total_productos);
          }
        });
      })
      .catch(function () {
        // Sin conexión o sin data/resumen.json: se queda el literal escrito
        // a mano en index.html. No es un error del usuario, no se le informa.
      });
  }

  // La fecha de fundación vive UNA sola vez, declarada en el propio HTML
  // (data-desde="2003-09-01" en el nodo data-stat="anios") — el JS no la
  // repite como constante aparte.
  //
  // "Hoy" se ancla explícitamente a America/Bogota vía Intl con el parámetro
  // timeZone, en vez de restar milisegundos o leer new Date().getFullYear()
  // (que usa la zona horaria LOCAL del dispositivo del visitante). Sin este
  // anclaje, alguien viendo el sitio desde Asia el 31 de agosto por la tarde
  // -hora de Colombia- ya estaria en 1 de septiembre en su reloj local y
  // veria un año de más.
  function fechaBogotaHoy(instante) {
    var formateador = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    var partes = {};
    formateador.formatToParts(instante || new Date()).forEach(function (parte) {
      partes[parte.type] = parte.value;
    });
    return {
      anio: parseInt(partes.year, 10),
      mes: parseInt(partes.month, 10),
      dia: parseInt(partes.day, 10)
    };
  }

  // Años cumplidos entre `desdeISO` (YYYY-MM-DD) y `hoy` ({anio,mes,dia}),
  // comparando componentes de calendario -- no aritmética de milisegundos,
  // que arrastra el huso horario del objeto Date de vuelta al cálculo.
  // El aniversario cuenta el mismo día: 2027-09-01 ya son 24, no hace falta
  // esperar al 2.
  function aniosDesde(desdeISO, hoy) {
    var partes = desdeISO.split('-');
    var anioFundacion = parseInt(partes[0], 10);
    var mesFundacion = parseInt(partes[1], 10);
    var diaFundacion = parseInt(partes[2], 10);

    var anios = hoy.anio - anioFundacion;
    var aunNoLlegaElAniversarioEsteAnio =
      hoy.mes < mesFundacion ||
      (hoy.mes === mesFundacion && hoy.dia < diaFundacion);
    if (aunNoLlegaElAniversarioEsteAnio) {
      anios -= 1;
    }
    return anios;
  }

  function calcularAniosFundacion() {
    var nodo = document.querySelector('[data-stat="anios"]');
    if (!nodo) return;
    var desde = nodo.getAttribute('data-desde');
    if (!desde) return;
    try {
      nodo.textContent = aniosDesde(desde, fechaBogotaHoy());
    } catch (e) {
      // Intl.DateTimeFormat con timeZone no disponible (navegador muy
      // antiguo): se queda el literal escrito a mano en index.html.
    }
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
    calcularAniosFundacion();
    iniciarBusqueda();
    abrirDetallesDesdeAncla();
    window.addEventListener('hashchange', abrirDetallesDesdeAncla);
  }

  // Guard: este mismo fichero se importa desde Node (scripts/test_calculo_anios.js)
  // para probar aniosDesde()/fechaBogotaHoy()/formatearMiles() SIN reimplementarlas
  // -- un test que copia la lógica en vez de ejecutar la real nunca detecta un bug
  // en esa lógica. `document` no existe en Node, así que el arranque de DOM se
  // salta por completo ahí; en el navegador esta condición es siempre verdadera.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', iniciar);
    } else {
      iniciar();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      formatearMiles: formatearMiles,
      fechaBogotaHoy: fechaBogotaHoy,
      aniosDesde: aniosDesde
    };
  }
})();
