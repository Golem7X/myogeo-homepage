'use strict';

/* ── Theme Toggle ── */
var html     = document.documentElement;
var themeBtn = document.getElementById('theme-toggle');

function applyTheme(t) {
  html.setAttribute('data-theme', t);
  themeBtn.textContent = t === 'light' ? '🌙' : '☀️';
  themeBtn.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
}

applyTheme(html.getAttribute('data-theme') || 'dark');

themeBtn.addEventListener('click', function () {
  var next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  if (next === 'light' || next === 'dark') {
    try { localStorage.setItem('myo-theme', next); } catch (e) {}
  }
});

/* ── Mobile Nav ── */
var navToggle = document.getElementById('nav-toggle');
var navLinks  = document.getElementById('nav-links');
navToggle.addEventListener('click', function () {
  var open = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});
navLinks.querySelectorAll('a').forEach(function (a) {
  a.addEventListener('click', function () { navLinks.classList.remove('open'); });
});

/* ── Nav scroll state + progress bar + back-to-top ── */
var mainNav     = document.getElementById('main-nav');
var progressBar = document.getElementById('progress-bar');
var backTop     = document.getElementById('back-top');

function onScroll() {
  mainNav.classList.toggle('scrolled', window.scrollY > 40);

  var docH = document.documentElement.scrollHeight - window.innerHeight;
  var pct  = docH > 0 ? (window.scrollY / docH) * 100 : 0;
  progressBar.style.setProperty('--progress', pct + '%');

  backTop.classList.toggle('visible', window.scrollY > 400);
}
window.addEventListener('scroll', onScroll, { passive: true });

backTop.addEventListener('click', function () {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── Typing Effect ── */
(function () {
  var el = document.getElementById('hero-tagline');
  if (!el) return;

  var phrases = [
    'Geotechnical Innovation Lab',
    'Soil Testing Workflows',
    'Engineering Calculations',
    'Built on ASTM \u00B7 EC7 \u00B7 JGS'
  ];
  var pi = 0, ci = 0, deleting = false;

  function tick() {
    var word = phrases[pi % phrases.length];
    if (deleting) { el.textContent = word.slice(0, ci - 1); ci--; }
    else          { el.textContent = word.slice(0, ci + 1); ci++; }

    var delay = deleting ? 45 : 95;
    if (!deleting && ci === word.length) { delay = 2200; deleting = true; }
    else if (deleting && ci === 0)       { deleting = false; pi++; delay = 350; }

    setTimeout(tick, delay);
  }

  setTimeout(tick, 1300);
}());

/* ── Particle Canvas ── */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  var heroBg = document.querySelector('.hero-bg');
  if (!heroBg) return;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'hero-canvas';
  heroBg.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  var particles = [];

  function resize() {
    canvas.width  = heroBg.offsetWidth;
    canvas.height = heroBg.offsetHeight;
  }

  function mkParticle() {
    return {
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      r:  Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(Math.random() * 0.35 + 0.08),
      o:  Math.random() * 0.45 + 0.1
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 55 }, mkParticle);
  }

  function getColor() {
    return html.getAttribute('data-theme') === 'light'
      ? [46, 125, 191]
      : [77, 166, 232];
  }

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var c = getColor();
    var r = c[0], g = c[1], b = c[2];

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + p.o + ')';
      ctx.fill();

      for (var j = i + 1; j < particles.length; j++) {
        var q  = particles[j];
        var dx = p.x - q.x, dy = p.y - q.y;
        var d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.09 * (1 - d / 110)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10 || p.x < -10 || p.x > canvas.width + 10) {
        p.x = Math.random() * canvas.width;
        p.y = canvas.height + 8;
      }
    }

    requestAnimationFrame(frame);
  }

  init();
  frame();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }, { passive: true });
}());

/* ── Scroll Reveal (IntersectionObserver) ── */
(function () {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('visible');
    });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.14 });

  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
}());

/* ── Secret Admin Shortcut (Shift+A) ───────────────────────────────────── */
document.addEventListener('keydown', function (e) {
  if (e.shiftKey && e.key === 'A' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    var tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't fire while typing
    location.href = '/admin/';
  }
});

/* ── 3D Card Tilt (uses CSS custom properties, CSP-safe) ── */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  document.querySelectorAll('.feature-card').forEach(function (card) {
    card.addEventListener('mousemove', function (e) {
      var rect = card.getBoundingClientRect();
      var x    = e.clientX - rect.left;
      var y    = e.clientY - rect.top;
      var rx   = ((y - rect.height / 2) / rect.height) * -10;
      var ry   = ((x - rect.width  / 2) / rect.width ) *  10;
      card.style.setProperty('--tilt-x', rx + 'deg');
      card.style.setProperty('--tilt-y', ry + 'deg');
      card.style.setProperty('--tilt-z', '6px');
    });

    card.addEventListener('mouseleave', function () {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
      card.style.setProperty('--tilt-z', '0px');
    });
  });
}());
