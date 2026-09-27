(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
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
  $$(".services, .steps").forEach(function (g) {
    $$(".reveal", g).forEach(function (el, i) { el.style.setProperty("--d", (i % 4) * 0.08 + "s"); });
  });
  if (!("IntersectionObserver" in window) || reduce.matches) {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    // Las imágenes arrancan recortadas con clip-path y el observador no las
    // detecta; por eso se observa el proyecto que las contiene.
    var targets = new Map();
    reveals.forEach(function (el) {
      var t = el.classList.contains("work__media") ? el.parentElement : el;
      if (!targets.has(t)) targets.set(t, []);
      targets.get(t).push(el);
    });
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        targets.get(en.target).forEach(function (el) { el.classList.add("is-in"); });
        revObs.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    targets.forEach(function (els, t) {
      if (t.getBoundingClientRect().top < window.innerHeight) els.forEach(function (el) { el.classList.add("is-in"); });
      else revObs.observe(t);
    });
  }

  /* ---------- Vitrina de la portada ---------- */
  var plate = $("#plate");
  if (plate) {
    var imgs = $$(".plate__frame img", plate);
    var link = $("#plate-link"), pill = $("#plate-pill");
    var nEl = $("#plate-n"), nameEl = $("#plate-name"), fill = $(".plate__bar span", plate);
    var DUR = 6000, current = 0, timer = null, hovering = false;
    plate.style.setProperty("--dur", DUR + "ms");

    function go(i) {
      current = (i + imgs.length) % imgs.length;
      var d = imgs[current].dataset;
      imgs.forEach(function (im, k) { im.classList.toggle("is-active", k === current); });
      nEl.textContent = current + 1;
      nameEl.textContent = d.name;
      link.href = d.href;
      link.setAttribute("aria-label", d.aria);
      pill.firstChild.nodeValue = d.cta + " ";
      fill.style.animation = "none"; void fill.offsetWidth; fill.style.animation = "";
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      var playing = !reduce.matches && !hovering && !document.hidden;
      plate.classList.toggle("is-playing", !reduce.matches);
      plate.classList.toggle("is-paused", !playing);
      if (playing) timer = setTimeout(function () { go(current + 1); }, DUR);
    }
    $("#plate-prev").addEventListener("click", function () { go(current - 1); });
    $("#plate-next").addEventListener("click", function () { go(current + 1); });
    plate.addEventListener("mouseenter", function () { hovering = true; schedule(); });
    plate.addEventListener("mouseleave", function () { hovering = false; go(current); });
    plate.addEventListener("focusin", function () { hovering = true; schedule(); });
    plate.addEventListener("focusout", function () { hovering = false; schedule(); });
    document.addEventListener("visibilitychange", schedule);
    go(0);
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
