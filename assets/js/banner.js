/*
 * banner.js — el carrusel de la portada: tres fotos, tres frases.
 *
 * Lo que NO hace: llevar la cuenta del tiempo. El reloj es la animación CSS de
 * la barra del punto activo (`hero-progreso` en main.css). Cuando esa barra
 * termina, avanzamos. Así pausar es pausar una animación —hover, foco, pestaña
 * oculta— y no hay que sincronizar un setTimeout con lo que se ve.
 *
 * Contrato de seguridad:
 *   · Sin este fichero se ve la primera diapositiva completa y los controles
 *     no aparecen: los enciende la clase `is-ready`, que se pone aquí.
 *   · Con `prefers-reduced-motion` no avanza solo; las flechas y los puntos
 *     siguen funcionando.
 *
 * Cero dependencias, cero build — coherente con el resto del sitio.
 */
(function () {
  'use strict';

  var hero = document.getElementById('banner');
  if (!hero) return;

  var fotos = hero.querySelectorAll('.hero__slide');
  var textos = hero.querySelectorAll('.hero__text');
  var puntos = hero.querySelectorAll('.hero__dot');
  var total = Math.min(fotos.length, textos.length, puntos.length);
  if (total < 2) return;

  var MENOS_MOVIMIENTO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var actual = 0;

  function ir(indice) {
    var destino = (indice + total) % total;
    if (destino === actual) return;

    [fotos, textos, puntos].forEach(function (lista) {
      lista[actual].classList.remove('is-active');
      lista[destino].classList.add('is-active');
    });

    textos[actual].setAttribute('aria-hidden', 'true');
    textos[destino].removeAttribute('aria-hidden');
    puntos[actual].removeAttribute('aria-current');
    puntos[destino].setAttribute('aria-current', 'true');

    actual = destino;
  }

  // Las diapositivas que no se ven, tampoco se leen.
  for (var i = 1; i < total; i++) textos[i].setAttribute('aria-hidden', 'true');

  // ---- Avance automático: lo dispara el final de la barra de progreso ----
  if (!MENOS_MOVIMIENTO) {
    Array.prototype.forEach.call(puntos, function (punto) {
      var barra = punto.querySelector('.hero__dot-bar');
      if (!barra) return;
      barra.addEventListener('animationend', function () {
        if (punto.classList.contains('is-active')) ir(actual + 1);
      });
    });
  }

  // ---- Controles ----
  var anterior = hero.querySelector('.hero__arrow--prev');
  var siguiente = hero.querySelector('.hero__arrow:not(.hero__arrow--prev)');
  if (anterior) anterior.addEventListener('click', function () { ir(actual - 1); });
  if (siguiente) siguiente.addEventListener('click', function () { ir(actual + 1); });

  Array.prototype.forEach.call(puntos, function (punto) {
    punto.addEventListener('click', function () {
      ir(parseInt(punto.getAttribute('data-ir'), 10) || 0);
    });
  });

  hero.addEventListener('keydown', function (evento) {
    if (evento.key === 'ArrowLeft') { ir(actual - 1); }
    else if (evento.key === 'ArrowRight') { ir(actual + 1); }
  });

  // ---- Pausa: mientras el visitante lee o usa los controles ----
  var motivos = { raton: false, foco: false, oculta: false };
  function pausar(motivo, valor) {
    motivos[motivo] = valor;
    hero.classList.toggle('is-paused', motivos.raton || motivos.foco || motivos.oculta);
  }
  // Solo sobre lo que se lee o se pulsa: el banner ocupa la pantalla entera, y
  // pausar con el ratón en cualquier punto lo dejaría quieto casi siempre.
  Array.prototype.forEach.call(hero.querySelectorAll('.hero__texts, .hero__cta, .hero__controls'), function (zona) {
    zona.addEventListener('mouseenter', function () { pausar('raton', true); });
    zona.addEventListener('mouseleave', function () { pausar('raton', false); });
  });
  // Solo el foco de TECLADO pausa. Un clic en la flecha también deja el foco en
  // el botón, y si eso pausara, el carrusel se quedaría quieto tras cada clic.
  hero.addEventListener('focusin', function (evento) {
    var deTeclado = true;
    try { deTeclado = evento.target.matches(':focus-visible'); } catch (e) { /* navegador sin :focus-visible */ }
    if (deTeclado) pausar('foco', true);
  });
  hero.addEventListener('focusout', function (evento) {
    if (!hero.contains(evento.relatedTarget)) pausar('foco', false);
  });
  document.addEventListener('visibilitychange', function () {
    pausar('oculta', document.hidden);
  });

  // ---- Deslizar con el dedo (o arrastrar con el ratón) ----
  // touch-action: pan-y en el CSS deja el scroll vertical al navegador; aquí
  // solo se decide el gesto horizontal. Un toque sobre un botón no es un gesto.
  var inicioX = null, inicioY = null;
  hero.addEventListener('pointerdown', function (evento) {
    if (evento.target.closest('a, button')) return;
    inicioX = evento.clientX;
    inicioY = evento.clientY;
  });
  hero.addEventListener('pointerup', function (evento) {
    if (inicioX === null) return;
    var dx = evento.clientX - inicioX;
    var dy = evento.clientY - inicioY;
    inicioX = inicioY = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      ir(dx < 0 ? actual + 1 : actual - 1);
    }
  });
  hero.addEventListener('pointercancel', function () { inicioX = inicioY = null; });

  hero.classList.add('is-ready');
})();
