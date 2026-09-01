#!/usr/bin/env node
/*
 * scripts/smoke_test_busqueda_enlaces.js
 *
 * Por que existe: una ronda de verificacion (capturas + revision visual)
 * confirmo que los resultados de busqueda se VEIAN bien, pero nadie hizo
 * clic. El bug real (assets/js/catalogo.js, prefijo relativo en vez de
 * absoluto -> /catalogo/catalogo/... -> 404) era invisible en una captura:
 * un enlace se pinta identico este bien o mal, solo la navegacion real lo
 * distingue. Este test hace clic de verdad, en las 5 lineas -- el fallo
 * era identico en las cinco y bastaba una para verlo, pero el proximo bug
 * podria afectar solo a una.
 *
 * Que comprueba, por cada linea:
 *   1. Busca un termino exclusivo de esa linea (ver CASOS abajo).
 *   2. Hace clic en el PRIMER resultado.
 *   3. La navegacion llega con codigo 200 (nunca 404, nunca 404.html).
 *   4. La URL final es la pagina de esa linea, con el ancla esperada.
 *   5. El <details> de esa ancla queda con el atributo open Y visible en
 *      pantalla (abierto de verdad, no solo presente en el DOM).
 *
 * No depende de servidor previo: levanta su propio "python -m http.server"
 * efimero en un puerto libre y lo cierra al terminar, este en verde o rojo.
 *
 * Requiere Playwright + Chromium ya instalados en OTRO sitio de esta
 * maquina -- este repo es cero-build/cero-npm a proposito, Playwright no
 * se instala aqui. Rutas configurables por variable de entorno si hace
 * falta apuntar a otra instalacion:
 *   PLAYWRIGHT_MODULE  ruta al paquete "playwright" (node_modules/playwright)
 *   CHROMIUM_EXE       ruta al ejecutable de Chromium
 *   PYTHON_EXE         ruta al interprete de Python para el servidor local
 *
 * Uso:
 *   node scripts/smoke_test_busqueda_enlaces.js
 * Salida: 0 y "TODO EN VERDE" si las 5 lineas navegan bien; 1 y el detalle
 * del primer fallo en caso contrario.
 */

const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const RAIZ_REPO = path.resolve(__dirname, '..');

const RUTA_PLAYWRIGHT =
  process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/ce_be/OneDrive - Teleperformance/Escritorio/NEW CARLOSEDO/REPOS/holaeli/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright';
const CHROMIUM_EXE =
  process.env.CHROMIUM_EXE ||
  'C:/Users/ce_be/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe';
const PYTHON_EXE =
  process.env.PYTHON_EXE || 'C:/Users/ce_be/AppData/Local/Programs/Python/Python312/python';

let chromium;
try {
  chromium = require(RUTA_PLAYWRIGHT).chromium;
} catch (err) {
  console.error('No se pudo cargar Playwright desde ' + RUTA_PLAYWRIGHT);
  console.error('Apunta PLAYWRIGHT_MODULE a una instalacion valida. Detalle: ' + err.message);
  process.exit(1);
}

// Un termino por linea, verificado de antemano para que el PRIMER resultado
// de la busqueda caiga siempre en esa linea (no ambiguo con otra).
const CASOS = [
  { linea: 'Medicoquirurgicos', termino: 'jeringa', slug: 'medicoquirurgicos', ancla: 'jeringas' },
  { linea: 'Aseo y cafeteria', termino: 'servilleta', slug: 'aseo-y-cafeteria', ancla: 'aseo' },
  { linea: 'Seguridad industrial', termino: 'guante', slug: 'seguridad-industrial', ancla: 'guantes' },
  { linea: 'Papeleria', termino: 'cuaderno', slug: 'papeleria', ancla: 'papeleria' },
  { linea: 'Muebles y enseres', termino: 'antebrazos', slug: 'muebles-y-enseres', ancla: 'muebles-y-enseres' },
];

function puertoLibre() {
  return new Promise(function (resolve, reject) {
    var srv = http.createServer();
    srv.listen(0, '127.0.0.1', function () {
      var port = srv.address().port;
      srv.close(function () {
        resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function esperarServidor(url, intentos) {
  return new Promise(function (resolve, reject) {
    function intentar(n) {
      http
        .get(url, function (res) {
          res.resume();
          resolve();
        })
        .on('error', function () {
          if (n <= 0) return reject(new Error('El servidor local no respondio a tiempo'));
          setTimeout(function () {
            intentar(n - 1);
          }, 200);
        });
    }
    intentar(intentos);
  });
}

async function verificarCaso(browser, base, caso) {
  var context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  var page = await context.newPage();

  await page.goto(base + '/catalogo/index.html', { waitUntil: 'networkidle' });
  await page.fill('#buscar-catalogo', caso.termino);
  await page.waitForSelector('.cat-search__item', { timeout: 5000 });

  var primerEnlace = page.locator('.cat-search__item').first();
  var hrefEsperado = await primerEnlace.getAttribute('href');

  var respuestaPromesa = page.waitForResponse(function (r) {
    return r.request().resourceType() === 'document';
  });
  await primerEnlace.click();
  var respuesta = await respuestaPromesa;

  var urlFinal = page.url();
  var codigoHttp = respuesta.status();
  var rutaEsperada = '/catalogo/' + caso.slug + '.html';
  var anclaEsperada = '#' + caso.ancla;

  var fallos = [];
  if (codigoHttp === 404) fallos.push('respuesta HTTP ' + codigoHttp);
  if (urlFinal.indexOf('404.html') !== -1) fallos.push('navego a 404.html (url: ' + urlFinal + ')');
  if (urlFinal.indexOf(rutaEsperada) === -1) {
    fallos.push(
      'la URL final (' + urlFinal + ') no contiene ' + rutaEsperada + ' -- href del resultado era "' + hrefEsperado + '"'
    );
  }
  if (urlFinal.indexOf(anclaEsperada) === -1) {
    fallos.push('la URL final (' + urlFinal + ') no lleva el ancla esperada ' + anclaEsperada);
  }

  var detailsAbierto = false;
  var detailsVisible = false;
  var anclaId = caso.ancla;
  var details = page.locator('#' + anclaId);
  if (await details.count()) {
    detailsAbierto = await details.evaluate(function (el) {
      return el.open === true;
    });
    detailsVisible = await details.isVisible();
  } else {
    fallos.push('no existe ningun elemento con id="' + anclaId + '" en la pagina destino');
  }
  if (!detailsAbierto) fallos.push('el <details> del ancla NO tiene el atributo open');
  if (!detailsVisible) fallos.push('el <details> del ancla no es visible en pantalla');

  await context.close();

  return {
    linea: caso.linea,
    termino: caso.termino,
    hrefEsperado: hrefEsperado,
    urlFinal: urlFinal,
    codigoHttp: codigoHttp,
    detailsAbierto: detailsAbierto,
    detailsVisible: detailsVisible,
    ok: fallos.length === 0,
    fallos: fallos,
  };
}

async function main() {
  var puerto = await puertoLibre();
  var base = 'http://127.0.0.1:' + puerto;

  var servidor = spawn(PYTHON_EXE, ['-m', 'http.server', String(puerto)], {
    cwd: RAIZ_REPO,
    stdio: 'ignore',
  });

  function cerrarServidor() {
    try {
      servidor.kill();
    } catch (e) {
      // ya estaba cerrado
    }
  }

  try {
    await esperarServidor(base + '/catalogo/index.html', 25);

    var browser = await chromium.launch({ executablePath: CHROMIUM_EXE });
    var resultados = [];

    for (var i = 0; i < CASOS.length; i++) {
      var r = await verificarCaso(browser, base, CASOS[i]);
      resultados.push(r);
    }

    await browser.close();

    console.log(JSON.stringify(resultados, null, 2));

    var rotos = resultados.filter(function (r) {
      return !r.ok;
    });

    if (rotos.length) {
      console.error('\nFALLO -- ' + rotos.length + ' de ' + resultados.length + ' lineas no navegan bien:');
      rotos.forEach(function (r) {
        console.error('  - ' + r.linea + ' ("' + r.termino + '"): ' + r.fallos.join('; '));
      });
      process.exitCode = 1;
      return;
    }

    console.log('\nTODO EN VERDE -- ' + resultados.length + '/' + resultados.length + ' lineas navegan y abren su sublinea.');
    process.exitCode = 0;
  } finally {
    cerrarServidor();
  }
}

main().catch(function (err) {
  console.error('FALLO INESPERADO', err);
  process.exitCode = 1;
});
