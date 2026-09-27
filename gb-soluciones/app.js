(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Navegación ---------- */
  var nav = $("#nav");
  var toggle = $("#nav-toggle");
  var bar = $("#progress-bar");
  var steps = $("#steps");

  function closeMenu() {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menú");
  }
  toggle.addEventListener("click", function () {
    var open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  });
  $$("#nav-links a").forEach(function (a) { a.addEventListener("click", closeMenu); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, y / max) : 0) + ")";
      nav.classList.toggle("is-solid", y > 24);
      if (steps) {
        var r = steps.getBoundingClientRect();
        var vh = window.innerHeight;
        var p = Math.max(0, Math.min(1, (vh * 0.7 - r.top) / r.height));
        steps.style.setProperty("--fill", p.toFixed(3));
        $$(".step", steps).forEach(function (s, i, all) {
          s.classList.toggle("is-on", p >= i / (all.length - 1) - 0.02 || p === 1);
        });
      }
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  // Sección activa en el menú
  var links = {};
  $$("#nav-links a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var secObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle("is-current", k === en.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["inicio", "proyectos", "servicios", "proceso", "sobre", "contacto"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) secObs.observe(el);
    });
  }

  /* ---------- Aparición al desplazarse ---------- */
  var reveals = $$(".reveal");
  // Pequeño escalonado entre hermanos de un mismo grupo
  $$(".projects, .services, .steps").forEach(function (g) {
    $$(".reveal", g).forEach(function (el, i) { el.style.setProperty("--d", (i % 4) * 0.08 + "s"); });
  });
  if (!("IntersectionObserver" in window) || reduce.matches) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); revObs.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    reveals.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-in");
      else revObs.observe(el);
    });
  }

  /* ---------- Vitrina de la portada ---------- */
  var show = $("#showcase");
  if (show) {
    var tabs = $$("[role=tab]", show);
    var desk = $$(".browser__screen img", show);
    var mob = $$(".phone__screen img", show);
    var url = $("#showcase-url");
    var DUR = 5000;
    var current = 0, timer = null, hovering = false;
    show.style.setProperty("--dur", DUR + "ms");

    function go(i, user) {
      current = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, k) {
        t.setAttribute("aria-selected", String(k === current));
        t.tabIndex = k === current ? 0 : -1;
      });
      desk.forEach(function (im, k) { im.classList.toggle("is-active", k === current); });
      mob.forEach(function (im, k) { im.classList.toggle("is-active", k === current); });
      url.textContent = tabs[current].getAttribute("data-url");
      // Reinicia la barra de tiempo
      var fill = $(".bar span", tabs[current]);
      fill.style.animation = "none"; void fill.offsetWidth; fill.style.animation = "";
      schedule();
      if (user) tabs[current].focus();
    }
    function schedule() {
      clearTimeout(timer);
      var playing = !reduce.matches && !hovering && !document.hidden;
      show.classList.toggle("is-playing", !reduce.matches);
      show.classList.toggle("is-paused", !playing);
      if (playing) timer = setTimeout(function () { go(current + 1); }, DUR);
    }
    tabs.forEach(function (t, k) {
      t.addEventListener("click", function () { go(k); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); go(current + 1, true); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(current - 1, true); }
      });
    });
    show.addEventListener("mouseenter", function () { hovering = true; schedule(); });
    show.addEventListener("mouseleave", function () { hovering = false; go(current); });
    show.addEventListener("focusin", function () { hovering = true; schedule(); });
    show.addEventListener("focusout", function () { hovering = false; schedule(); });
    document.addEventListener("visibilitychange", schedule);
    go(0);
  }

  /* ---------- Selector computadora / celular ---------- */
  var grid = $("#projects");
  $$(".viewtoggle button").forEach(function (b, _, all) {
    b.addEventListener("click", function () {
      all.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      grid.setAttribute("data-view", b.getAttribute("data-view"));
    });
  });

  /* ---------- Inclinación suave de tarjetas ---------- */
  $$(".card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      if (reduce.matches || !finePointer.matches) return;
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", (x * 4).toFixed(2) + "deg");
      card.style.setProperty("--rx", (-y * 4).toFixed(2) + "deg");
    });
    card.addEventListener("pointerleave", function () {
      card.style.setProperty("--ry", "0deg");
      card.style.setProperty("--rx", "0deg");
    });
  });

  /* ---------- Campo de puntos de la portada ---------- */
  var cv = $("#hero-field");
  if (cv && cv.getContext) {
    var ctx = cv.getContext("2d");
    var hero = cv.parentElement;
    var W = 0, H = 0, dpr = 1, pts = [], GAP = 26;
    var mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
    var running = false, visible = true, raf = 0, t0 = performance.now();

    function build() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.clientWidth; H = hero.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      GAP = W < 600 ? 22 : 26;
      pts = [];
      for (var y = GAP / 2; y < H; y += GAP) {
        for (var x = GAP / 2; x < W; x += GAP) {
          // Semilla fija por punto para destellos amarillos esporádicos
          pts.push({ x: x, y: y, s: Math.random() });
        }
      }
    }
    function draw(now) {
      var t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        // Onda diagonal que recorre la grilla
        var w = Math.sin(p.x * 0.011 + p.y * 0.006 - t * 1.1) * 0.5 + 0.5;
        var fade = Math.min(1, (p.x / W) * 1.6); // más tenue detrás del texto
        var dx = p.x - mouse.x, dy = p.y - mouse.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        var near = d < 160 ? 1 - d / 160 : 0;
        var r = 0.8 + w * 1.1 + near * 2.2;
        var ox = near ? (dx / (d || 1)) * near * 6 : 0;
        var oy = near ? (dy / (d || 1)) * near * 6 : 0;
        var spark = p.s > 0.985 ? (Math.sin(t * 1.6 + p.s * 90) * 0.5 + 0.5) : 0;
        if (near > 0.35 || spark > 0.6) {
          ctx.fillStyle = "rgba(255,199,44," + (0.35 + Math.max(near, spark) * 0.55).toFixed(3) + ")";
        } else {
          ctx.fillStyle = "rgba(120,150,255," + ((0.08 + w * 0.22) * (0.35 + fade * 0.65)).toFixed(3) + ")";
        }
        ctx.beginPath();
        ctx.arc(p.x + ox, p.y + oy, r, 0, 6.2832);
        ctx.fill();
      }
    }
    function loop(now) {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    }
    function update() {
      var should = visible && !document.hidden && !reduce.matches;
      if (should && !running) { running = true; raf = requestAnimationFrame(loop); }
      if (!should && running) { running = false; cancelAnimationFrame(raf); }
      if (!should) draw(t0 + 2000); // cuadro fijo
    }
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = hero.getBoundingClientRect();
      mouse.tx = e.clientX - r.left; mouse.ty = e.clientY - r.top;
      if (mouse.x < -1000) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
    });
    hero.addEventListener("pointerleave", function () { mouse.tx = mouse.ty = -9999; });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; update(); }).observe(hero);
    }
    document.addEventListener("visibilitychange", update);
    if (reduce.addEventListener) reduce.addEventListener("change", update);
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { build(); update(); }, 150); });
    build();
    update();
  }

  /* ---------- Contacto ---------- */
  var EMAIL = "gbsoltech@gmail.com";
  var status = $("#brief-status");

  function copy(text, onDone, onFail) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone, onFail);
    } else { onFail(); }
  }
  function selectText(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  }

  var copyMail = $("#copy-mail");
  copyMail.addEventListener("click", function () {
    copy(EMAIL, function () {
      copyMail.textContent = "Copiado";
      copyMail.classList.add("is-done");
      setTimeout(function () { copyMail.textContent = "Copiar"; copyMail.classList.remove("is-done"); }, 2200);
    }, function () {
      selectText($("#mail-addr"));
      copyMail.textContent = "Seleccionado";
      setTimeout(function () { copyMail.textContent = "Copiar"; }, 2200);
    });
  });

  var form = $("#brief");
  function briefText() {
    var nombre = $("#f-nombre").value.trim();
    var negocio = $("#f-negocio").value.trim();
    var intereses = $$("input[name=interes]:checked", form).map(function (i) { return i.value; });
    var msg = $("#f-msg").value.trim();
    var lines = ["Hola, GB Soluciones Tecnológicas."];
    if (nombre) lines.push("Soy " + nombre + ".");
    if (negocio) lines.push("Mi negocio o profesión: " + negocio + ".");
    if (intereses.length) lines.push("Me interesa: " + intereses.join(", ") + ".");
    if (msg) lines.push("", msg);
    return lines.join("\n");
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var subject = "Consulta desde la web" + ($("#f-negocio").value.trim() ? " · " + $("#f-negocio").value.trim() : "");
    window.location.href = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(briefText());
    status.textContent = "Si no se abrió tu programa de correo, usá «Copiar consulta» y pegala en un correo a " + EMAIL + ".";
  });
  $("#copy-brief").addEventListener("click", function () {
    var txt = briefText();
    copy(txt, function () {
      status.textContent = "Consulta copiada. Pegala en un correo a " + EMAIL + ".";
    }, function () {
      status.textContent = "No se pudo copiar automáticamente. Escribí a " + EMAIL + ".";
    });
  });

  var y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
})();
