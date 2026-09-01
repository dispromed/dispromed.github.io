/*
 * test_calculo_anios.js — prueba con fechas simuladas el calculo de "años
 * abasteciendo instituciones" de la home.
 *
 * Ejecuta las funciones REALES de assets/js/catalogo.js (via module.exports,
 * guardado bajo `typeof module !== 'undefined'`) -- no las reimplementa. Un
 * test que copia la logica no puede detectar un bug en esa logica.
 *
 * Uso: node scripts/test_calculo_anios.js
 */
'use strict';

var path = require('path');
var assert = require('assert');

var catalogo = require(path.join(__dirname, '..', 'assets', 'js', 'catalogo.js'));

var FUNDACION = '2003-09-01';
var fallos = [];

function verificar(descripcion, real, esperado) {
  if (real === esperado) {
    console.log('OK   ' + descripcion + ' -> ' + real);
  } else {
    console.log('FALLO ' + descripcion + ' -> obtenido ' + real + ', esperado ' + esperado);
    fallos.push(descripcion);
  }
}

console.log('--- aniosDesde() con fechas simuladas (aritmetica de calendario) ---');

// Caso pedido explicitamente por el coordinador: la vispera del aniversario.
verificar(
  '31/08/2027 (un dia antes del aniversario)',
  catalogo.aniosDesde(FUNDACION, { anio: 2027, mes: 8, dia: 31 }),
  23
);

// Caso pedido explicitamente por el coordinador: el mismo dia del aniversario.
verificar(
  '01/09/2027 (el mismo dia del aniversario)',
  catalogo.aniosDesde(FUNDACION, { anio: 2027, mes: 9, dia: 1 }),
  24
);

// El dia mismo de la fundacion: 0 años cumplidos, no negativo ni 1.
verificar(
  '01/09/2003 (dia de fundacion)',
  catalogo.aniosDesde(FUNDACION, { anio: 2003, mes: 9, dia: 1 }),
  0
);

// Un dia antes de fundarse la empresa no deberia poder pasar en produccion,
// pero la funcion debe seguir siendo coherente (no explotar) si algo la
// llama con una fecha absurda.
verificar(
  '31/08/2003 (un dia antes de fundarse)',
  catalogo.aniosDesde(FUNDACION, { anio: 2003, mes: 8, dia: 31 }),
  -1
);

// Sanity check contra el literal "23" que ya esta escrito a mano en
// index.html como respaldo sin JS -- hoy (1-sep-2026) debe coincidir.
verificar(
  '01/09/2026 (hoy real, sanity check contra el literal del HTML)',
  catalogo.aniosDesde(FUNDACION, { anio: 2026, mes: 9, dia: 1 }),
  23
);
verificar(
  '31/08/2026 (la vispera de hoy, un año menos)',
  catalogo.aniosDesde(FUNDACION, { anio: 2026, mes: 8, dia: 31 }),
  22
);

console.log('');
console.log('--- fechaBogotaHoy() con instantes UTC fijos que cruzan la frontera real del dia ---');

// El caso explicito pedido por el coordinador: un instante UTC en el que
// Bogota (UTC-5) y UTC ya estan en DIAS DISTINTOS. 2027-09-01T02:00:00Z son
// las 21:00 del 31 de agosto en Bogota -- si el calculo NO ancla a Bogota
// (por ejemplo si usara new Date().getUTCFullYear()/getUTCMonth()/getUTCDate()
// o los metodos LOCALES del Date, que en un runner con TZ=UTC coinciden con
// los UTC) el resultado saldria en 1 de septiembre, un año de mas.
var instanteFrontera = new Date('2027-09-01T02:00:00Z');
var hoyBogota = catalogo.fechaBogotaHoy(instanteFrontera);

verificar(
  'fechaBogotaHoy(2027-09-01T02:00:00Z).dia -- Bogota aun esta en 31/08',
  hoyBogota.dia,
  31
);
verificar(
  'fechaBogotaHoy(2027-09-01T02:00:00Z).mes',
  hoyBogota.mes,
  8
);
verificar(
  'fechaBogotaHoy(2027-09-01T02:00:00Z).anio',
  hoyBogota.anio,
  2027
);
verificar(
  'aniosDesde() compuesto con ese instante -- debe dar 23, NO 24',
  catalogo.aniosDesde(FUNDACION, hoyBogota),
  23
);

// Demuestra que el timeZone SI hace el trabajo: el equivalente "ingenuo" que
// lee los componentes UTC del mismo instante (lo que se obtendria sin anclar
// a America/Bogota) cae del lado equivocado de la frontera y da 24. Si
// alguien quita el parametro timeZone de fechaBogotaHoy(), este assert deja
// de ser una comparacion entre dos valores DISTINTOS (23 vs 24) y pasa a
// comparar dos iguales -- la prueba de mas abajo lo detectaria porque
// entonces "ingenuoDia" y "hoyBogota.dia" coincidirian.
var ingenuoDia = instanteFrontera.getUTCDate();
var ingenuoAnios = catalogo.aniosDesde(FUNDACION, {
  anio: instanteFrontera.getUTCFullYear(),
  mes: instanteFrontera.getUTCMonth() + 1,
  dia: ingenuoDia
});
verificar(
  'control: el calculo SIN anclar a Bogota (naive UTC) da 24 (el bug que el anclaje evita)',
  ingenuoAnios,
  24
);
assert.notStrictEqual(
  ingenuoAnios,
  catalogo.aniosDesde(FUNDACION, hoyBogota),
  'el resultado anclado a Bogota y el ingenuo deberian diferir en la frontera -- si coinciden, el anclaje dejo de estar haciendo algo'
);
console.log('OK   el resultado anclado a Bogota (23) difiere del ingenuo en UTC (24), confirmando que timeZone hace el trabajo');

// Instante muy lejos de cualquier frontera, control de que no se rompio nada
// en el caso normal.
var instanteNormal = new Date('2026-09-01T15:00:00Z'); // 10:00 a.m. en Bogota
var hoyNormal = catalogo.fechaBogotaHoy(instanteNormal);
verificar(
  'fechaBogotaHoy(instante lejos de la frontera).dia',
  hoyNormal.dia,
  1
);
verificar(
  'fechaBogotaHoy(instante lejos de la frontera).mes',
  hoyNormal.mes,
  9
);

console.log('');
console.log('--- formatearMiles() ---');
verificar('formatearMiles(2877)', catalogo.formatearMiles(2877), '2.877');
verificar('formatearMiles(1127)', catalogo.formatearMiles(1127), '1.127');
verificar('formatearMiles(24)', catalogo.formatearMiles(24), '24');
verificar('formatearMiles(1000000)', catalogo.formatearMiles(1000000), '1.000.000');
verificar('formatearMiles(0)', catalogo.formatearMiles(0), '0');

console.log('');
if (fallos.length) {
  console.log(fallos.length + ' verificacion(es) fallida(s):');
  fallos.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
} else {
  console.log('Todas las verificaciones pasaron.');
  process.exit(0);
}
