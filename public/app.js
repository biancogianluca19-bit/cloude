(() => {
  const $ = id => document.getElementById(id);
  const { CATEGORIAS, POR_ID, OTROS, iso, deIso } = Lector;
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const DIAS_C = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const DIAS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const LS_CLAVE = 'libreta-plata-clave';
  const LS_TEMA = 'libreta-plata-tema';

  const hoyIso = () => iso(new Date());
  const mesDe = f => f.slice(0, 7);
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = {
    ARS: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
    ARSd: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    USD: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }),
    corto: new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }),
  };
  const plata = (v, moneda = 'ARS') => moneda === 'USD' ? fmt.USD.format(v) : (Number.isInteger(v) ? fmt.ARS : fmt.ARSd).format(v);
  const etiquetaMes = k => { const [y, m] = k.split('-').map(Number); return MESES[m - 1] + ' ' + y; };
  const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nombreCat = (c, tipo = 'gasto') => (POR_ID[c] || POR_ID[OTROS[tipo]]).nombre;

  const S = {
    meses: {},
    aprendidas: {},
    presupuestos: {},
    mes: mesDe(hoyIso()),
    borrador: [],
    sinMonto: [],
    abierto: null,
    modo: 'cargando',
    diaSel: null,
    editandoTopes: false,
  };
  const LS_TOKEN = 'libreta-plata-token';
  let token = '', sesion = null;
  try { token = localStorage.getItem(LS_TOKEN) || ''; } catch (e) {}
  // Clave de la libreta de antes de las cuentas: sirve una vez para pasar esos datos a una cuenta.
  let claveVieja = '';
  try { claveVieja = localStorage.getItem(LS_CLAVE) || ''; } catch (e) {}
  const claveUrl = new URLSearchParams(location.search).get('clave');
  if (claveUrl) {
    claveVieja = claveUrl;
    try { localStorage.setItem(LS_CLAVE, claveVieja); } catch (e) {}
  }
  if (location.search) history.replaceState(null, '', location.pathname + location.hash);

  // ---------- Servidor ----------
  async function api(ruta, opciones = {}) {
    const r = await fetch('/api/' + ruta, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opciones.headers || {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && ruta.indexOf('cuenta') !== 0) { pedirAcceso(j.error || 'Tu sesión venció. Entrá de nuevo.'); throw new Error('401'); }
    if (!r.ok) { const e = new Error(j.error || 'Error ' + r.status); e.estado = r.status; throw e; }
    return j;
  }
  function fallo(e, texto) { if (e && e.message !== '401') avisar(texto + (e && e.message ? ' (' + e.message + ')' : '')); }

  async function cargarMes(k, silencioso) {
    try {
      const j = await api('movimientos?mes=' + k);
      S.meses[k] = j.items || [];
      S.modo = 'nube';
      if (k === S.mes) render();
    } catch (e) {
      if (!silencioso) fallo(e, 'No pude traer los movimientos.');
      if (e.message !== '401') { S.modo = 'error'; renderEstado(); }
    }
  }
  async function cargarAjustes() {
    try {
      const j = await api('ajustes');
      S.aprendidas = j.aprendidas || {}; S.presupuestos = j.presupuestos || {};
      render();
    } catch (e) { fallo(e, 'No pude traer los ajustes.'); }
  }
  async function refrescar(silencioso) {
    if (!token) return;
    await Promise.all([cargarMes(S.mes, silencioso), cargarAjustes()]);
    const hoyK = mesDe(hoyIso());
    if (S.mes !== hoyK) cargarMes(hoyK, true);
  }

  // ---------- Cuenta ----------
  let modoAcceso = 'entrar';
  function ponerModoAcceso(m) {
    modoAcceso = m;
    const crear = m === 'crear';
    $('tab-entrar').setAttribute('aria-pressed', !crear);
    $('tab-crear').setAttribute('aria-pressed', crear);
    $('login-h').textContent = crear ? 'Creá tu cuenta' : 'Entrá a tu libreta';
    $('login-hint').textContent = crear ? 'Elegí un usuario y una contraseña. Tu libreta arranca vacía y solo la ves vos.' : 'Cada cuenta tiene sus propios movimientos. Nadie más los ve.';
    $('acc-nombre-l').hidden = !crear;
    $('acc-contrasena').autocomplete = crear ? 'new-password' : 'current-password';
    $('acc-enviar').textContent = crear ? 'Crear cuenta' : 'Entrar';
    $('login-error').hidden = true;
  }
  $('tab-entrar').addEventListener('click', () => ponerModoAcceso('entrar'));
  $('tab-crear').addEventListener('click', () => ponerModoAcceso('crear'));

  function pedirAcceso(error) {
    token = ''; sesion = null;
    try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
    S.meses = {}; S.aprendidas = {}; S.presupuestos = {}; S.borrador = []; S.sinMonto = [];
    $('login').hidden = false; $('contenido').hidden = true; $('mesnav').hidden = true; $('traspaso').hidden = true;
    $('login-error').hidden = !error; $('login-error').textContent = error || '';
    S.modo = 'cargando'; renderEstado();
    let conocido = false;
    try { conocido = !!localStorage.getItem('libreta-plata-conocido'); } catch (e) {}
    if (!error && !conocido && !claveVieja) ponerModoAcceso('crear');
  }
  function abrirSesion(s) {
    token = s.token; sesion = { usuario: s.usuario, nombre: s.nombre };
    try { localStorage.setItem(LS_TOKEN, token); localStorage.setItem('libreta-plata-conocido', '1'); } catch (e) {}
    $('login').hidden = true; $('contenido').hidden = false; $('mesnav').hidden = false;
    $('acc-contrasena').value = '';
    renderCuenta();
    $('traspaso').hidden = !claveVieja;
    $('traspaso-u').textContent = sesion.usuario;
    render();
    refrescar();
  }
  $('login-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const b = $('acc-enviar'); b.disabled = true;
    try {
      const s = await api('cuenta', { method: 'POST', body: JSON.stringify({ accion: modoAcceso === 'crear' ? 'registrar' : 'entrar', usuario: $('acc-usuario').value, contrasena: $('acc-contrasena').value, nombre: $('acc-nombre').value }) });
      abrirSesion(s);
      if (modoAcceso === 'crear') avisar(`Cuenta creada. ¡Bienvenido, ${s.nombre}!`);
    } catch (e) {
      $('login-error').hidden = false;
      $('login-error').textContent = e.estado ? e.message : 'No pude conectar con el servidor. Revisá tu conexión.';
    }
    b.disabled = false;
  });
  function renderCuenta() {
    if (!sesion) return;
    $('cuenta-nombre').textContent = sesion.nombre;
    $('cuenta-usuario').textContent = '@' + sesion.usuario;
  }
  $('btn-traspaso').addEventListener('click', async () => {
    try {
      const r = await api('cuenta', { method: 'POST', body: JSON.stringify({ accion: 'traspasar', claveVieja }) });
      claveVieja = ''; try { localStorage.removeItem(LS_CLAVE); } catch (e) {}
      $('traspaso').hidden = true;
      S.meses = {};
      await refrescar();
      avisar(r.meses ? `Listo, pasé ${r.meses === 1 ? '1 mes' : r.meses + ' meses'} de movimientos a tu cuenta.` : 'Listo, tu cuenta quedó vinculada con la libreta anterior.');
    } catch (e) {
      if (e.estado === 409 || e.estado === 403) { claveVieja = ''; try { localStorage.removeItem(LS_CLAVE); } catch (x) {} $('traspaso').hidden = true; }
      fallo(e, 'No se pudo pasar la libreta anterior.');
    }
  });
  $('btn-traspaso-no').addEventListener('click', () => {
    claveVieja = ''; try { localStorage.removeItem(LS_CLAVE); } catch (e) {}
    $('traspaso').hidden = true;
  });
  $('btn-telegram').addEventListener('click', async () => {
    try {
      const r = await api('cuenta', { method: 'POST', body: JSON.stringify({ accion: 'telegram' }) });
      avisar('Se abre Telegram: tocá «Iniciar» para vincular el bot con tu cuenta.');
      location.href = r.link;
    } catch (e) { fallo(e, 'No pude generar el link de Telegram.'); }
  });
  $('btn-cambiar').addEventListener('click', () => { $('cambiar-form').hidden = !$('cambiar-form').hidden; if (!$('cambiar-form').hidden) $('cc-actual').focus(); });
  $('cambiar-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      const s = await api('cuenta', { method: 'POST', body: JSON.stringify({ accion: 'cambiar', actual: $('cc-actual').value, nueva: $('cc-nueva').value }) });
      token = s.token; try { localStorage.setItem(LS_TOKEN, token); } catch (e) {}
      $('cc-actual').value = ''; $('cc-nueva').value = ''; $('cambiar-form').hidden = true;
      avisar('Contraseña cambiada. Se cerró la sesión en tus otros dispositivos.');
    } catch (e) { fallo(e, 'No se pudo cambiar la contraseña.'); }
  });

  // ---------- Voz del navegador ----------
  function unirDictado(a, b) {
    if (!a) return b;
    if (!b) return a;
    const na = a.toLowerCase(), nb = b.toLowerCase();
    if (nb.startsWith(na)) return b;
    if (na.startsWith(nb) || na.endsWith(nb)) return a;
    return a + ' ' + b;
  }
  let rec = null, escuchando = false;
  function iniciarVoz() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    $('btn-mic').hidden = false;
    $('hint-voz').textContent = 'Tocá «Dictar» y hablá, o mandale un audio al bot. Podés decir varios movimientos seguidos.';
    let base = '';
    $('btn-mic').addEventListener('click', () => {
      if (escuchando) { rec && rec.stop(); return; }
      rec = new SR();
      rec.lang = 'es-AR'; rec.continuous = true; rec.interimResults = true;
      base = $('texto').value.trim();
      // Chrome en Android repite en cada resultado todo lo dicho antes; se unen sin duplicar.
      rec.onresult = ev => {
        let fin = '', temp = '';
        for (let i = 0; i < ev.results.length; i++) {
          const r = ev.results[i], t = r[0].transcript.trim();
          if (r.isFinal) fin = unirDictado(fin, t); else temp = unirDictado(temp, t);
        }
        const todo = unirDictado(fin, temp);
        $('texto').value = (base ? base + ' ' : '') + todo;
      };
      rec.onerror = ev => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          $('btn-mic').hidden = true;
          $('hint-voz').textContent = 'El navegador no dio permiso al micrófono. Usá el micrófono del teclado o mandale un audio al bot.';
        }
      };
      rec.onend = () => { escuchando = false; $('btn-mic').dataset.on = '0'; $('mic-txt').textContent = 'Dictar'; };
      try { rec.start(); escuchando = true; $('btn-mic').dataset.on = '1'; $('mic-txt').textContent = 'Parar'; } catch (e) {}
    });
  }

  // ---------- Interpretar y guardar ----------
  function procesar() {
    const texto = $('texto').value.trim();
    if (!texto) { avisar('Escribí o dictá algo primero.'); $('texto').focus(); return; }
    const fecha = $('fecha-base').value || hoyIso();
    const r = Lector.leer(texto, { hoy: hoyIso(), fecha, aprendidas: S.aprendidas });
    S.borrador = r.items.map(x => ({ ...x, id: nuevoId() }));
    S.sinMonto = r.sinMonto;
    renderBorrador();
  }

  function aprender(desc, cat) {
    const ws = Lector.palabrasClave(desc);
    if (!ws.length) return;
    const nuevas = {};
    for (const w of ws) nuevas[w] = cat;
    Object.assign(S.aprendidas, nuevas);
    renderAjustes();
    api('ajustes', { method: 'POST', body: JSON.stringify({ aprender: nuevas }) }).catch(e => fallo(e, 'No pude guardar lo aprendido.'));
  }

  async function guardarBorrador() {
    const validos = S.borrador.filter(x => x.monto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha));
    if (!validos.length) { avisar('No hay movimientos con monto para guardar.'); return; }
    const b = $('btn-guardar'); if (b) b.disabled = true;
    try {
      const j = await api('movimientos', { method: 'POST', body: JSON.stringify({ items: validos }) });
      for (const x of j.items) { const k = mesDe(x.fecha); S.meses[k] = (S.meses[k] || []).filter(y => y.id !== x.id).concat(x); }
      S.mes = mesDe(validos[validos.length - 1].fecha);
      S.borrador = []; S.sinMonto = [];
      $('texto').value = '';
      renderBorrador(); render();
      const alertas = Presupuesto.estado(S.meses[S.mes] || [], S.presupuestos).alertas.filter(f => j.items.some(x => x.cat === f.cat));
      avisar((j.items.length === 1 ? 'Guardé 1 movimiento.' : `Guardé ${j.items.length} movimientos.`) + (alertas.length ? ' Ojo: ' + alertas.map(f => nombreCat(f.cat) + (f.nivel === 'pasado' ? ' pasó su tope' : ' está cerca del tope')).join(', ') + '.' : ''));
    } catch (e) { fallo(e, 'No se pudo guardar.'); if (b) b.disabled = false; }
  }

  // ---------- Editor ----------
  function editorHTML(x, modo) {
    const opts = CATEGORIAS.filter(c => c.tipo === x.tipo).map(c => `<option value="${c.id}"${c.id === x.cat ? ' selected' : ''}>${escapar(c.nombre)}</option>`).join('');
    const p = `${modo}-${x.id}`;
    return `<div class="editor" data-tipo="${x.tipo}" data-id="${x.id}" data-modo="${modo}">
      <div class="c-tipo"><span class="label" style="display:block;margin-bottom:3px;font-size:11px">Tipo</span>
        <div class="seg" role="group" aria-label="Tipo">
          <button type="button" data-accion="tipo" data-v="gasto" aria-pressed="${x.tipo === 'gasto'}">Gasto</button>
          <button type="button" data-accion="tipo" data-v="ingreso" aria-pressed="${x.tipo === 'ingreso'}">Ingreso</button>
        </div></div>
      <label class="c-monto" for="${p}-monto">Monto<input id="${p}-monto" class="monto-in" data-campo="monto" inputmode="decimal" value="${escapar(String(x.monto).replace('.', ','))}"></label>
      <label class="c-moneda" for="${p}-moneda">Moneda<select id="${p}-moneda" data-campo="moneda"><option value="ARS"${x.moneda !== 'USD' ? ' selected' : ''}>Pesos</option><option value="USD"${x.moneda === 'USD' ? ' selected' : ''}>Dólares</option></select></label>
      <label class="c-cat" for="${p}-cat">Categoría<select id="${p}-cat" data-campo="cat">${opts}</select></label>
      <label class="c-fecha" for="${p}-fecha">Fecha<input id="${p}-fecha" type="date" data-campo="fecha" value="${x.fecha}"></label>
      <label class="c-desc" for="${p}-desc">Descripción<input id="${p}-desc" data-campo="desc" value="${escapar(x.desc)}"></label>
      <div class="c-acc">${modo === 'borrador'
        ? `<button type="button" class="btn chico peligro" data-accion="quitar">Quitar</button><span></span>`
        : `<span class="fila"><button type="button" class="btn chico peligro" data-accion="borrar">Borrar</button></span>
           <span class="fila"><button type="button" class="btn chico" data-accion="cerrar">Cancelar</button><button type="button" class="btn chico primario" data-accion="aplicar">Guardar cambios</button></span>`}
      </div>
    </div>`;
  }
  function leerMonto(s) {
    const t = Lector.palabrasANumeros(String(s)).trim().replace(/[$\s]/g, '').replace(/(\d)(k|mil|lucas?)$/i, (m, d) => d + '000');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return parseFloat(t.replace(/\./g, '').replace(',', '.'));
    return parseFloat(t.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  }

  let edicion = null;
  function itemDeEditor(el) {
    const id = el.dataset.id;
    if (el.dataset.modo === 'borrador') return S.borrador.find(x => x.id === id);
    return edicion && edicion.id === id ? edicion : null;
  }
  function onEditorInput(ev) {
    const el = ev.target.closest('.editor'); if (!el) return;
    const x = itemDeEditor(el); if (!x) return;
    const campo = ev.target.dataset.campo; if (!campo) return;
    if (campo === 'monto') { const v = leerMonto(ev.target.value); x.monto = isFinite(v) ? v : 0; }
    else if (campo === 'cat') { x.cat = ev.target.value; if (ev.type === 'change') aprender(x.desc, x.cat); }
    else x[campo] = ev.target.value;
  }
  function onEditorClick(ev) {
    const b = ev.target.closest('[data-accion]'); if (!b) return;
    const el = b.closest('.editor'); if (!el) return;
    const x = itemDeEditor(el); if (!x) return;
    const a = b.dataset.accion;
    if (a === 'tipo') {
      if (x.tipo === b.dataset.v) return;
      x.tipo = b.dataset.v; x.cat = OTROS[x.tipo];
      el.outerHTML = editorHTML(x, el.dataset.modo);
    } else if (a === 'quitar') {
      S.borrador = S.borrador.filter(y => y.id !== x.id); renderBorrador();
    } else if (a === 'cerrar') {
      S.abierto = null; edicion = null; renderMovs();
    } else if (a === 'aplicar') {
      aplicarEdicion();
    } else if (a === 'borrar') {
      borrarMov(x.id);
    }
  }
  function buscarGuardado(id) {
    for (const [k, items] of Object.entries(S.meses)) { const x = items.find(y => y.id === id); if (x) return { k, x }; }
    return null;
  }
  async function aplicarEdicion() {
    if (!edicion) return;
    if (!(edicion.monto > 0)) { avisar('El monto tiene que ser mayor a cero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edicion.fecha)) { avisar('Elegí una fecha válida.'); return; }
    const orig = buscarGuardado(edicion.id); if (!orig) return;
    try {
      const j = await api('movimientos', { method: 'PUT', body: JSON.stringify({ item: edicion, mesAnterior: orig.k }) });
      const nuevo = j.item, kNuevo = mesDe(nuevo.fecha);
      S.meses[orig.k] = S.meses[orig.k].filter(y => y.id !== nuevo.id);
      S.meses[kNuevo] = (S.meses[kNuevo] || []).filter(y => y.id !== nuevo.id).concat(nuevo);
      S.abierto = null; edicion = null;
      render();
      avisar('Cambios guardados.');
    } catch (e) { fallo(e, 'No se pudieron guardar los cambios.'); }
  }
  async function borrarMov(id) {
    const orig = buscarGuardado(id); if (!orig) return;
    try {
      await api(`movimientos?id=${encodeURIComponent(id)}&mes=${orig.k}`, { method: 'DELETE' });
    } catch (e) { fallo(e, 'No se pudo borrar.'); return; }
    S.meses[orig.k] = S.meses[orig.k].filter(y => y.id !== id);
    S.abierto = null; edicion = null;
    render();
    const borrado = orig.x;
    avisar('Movimiento borrado.', 'Deshacer', async () => {
      try {
        const j = await api('movimientos', { method: 'POST', body: JSON.stringify({ items: [borrado] }) });
        const x = j.items[0], k = mesDe(x.fecha);
        S.meses[k] = (S.meses[k] || []).concat(x); render();
      } catch (e) { fallo(e, 'No se pudo recuperar.'); }
    });
  }

  // ---------- Presupuesto ----------
  function renderPresupuesto() {
    const est = Presupuesto.estado(itemsMes(), S.presupuestos);
    const filas = est.filas.filter(f => f.tope || f.gastado > 0);
    $('btn-topes').textContent = S.editandoTopes ? 'Cerrar' : Object.keys(S.presupuestos).length ? 'Editar topes' : 'Poner topes';
    $('topes-form').hidden = !S.editandoTopes;
    $('pres').hidden = S.editandoTopes;
    $('pres-total').textContent = est.totalTope && !S.editandoTopes
      ? `En las categorías con tope gastaste ${plata(est.totalGastadoConTope)} de ${plata(est.totalTope)}` + (est.totalTope >= est.totalGastadoConTope ? `: te quedan ${plata(est.totalTope - est.totalGastadoConTope)}.` : `: te pasaste por ${plata(est.totalGastadoConTope - est.totalTope)}.`)
      : '';
    if (S.editandoTopes) return;
    if (!filas.length) { $('pres').innerHTML = `<p class="vacio">Sin gastos en pesos en ${etiquetaMes(S.mes)}. Tocá «Poner topes» para definir cuánto querés gastar por mes en cada categoría.</p>`; return; }
    const maxSinTope = Math.max(1, ...filas.filter(f => !f.tope).map(f => f.gastado));
    $('pres').innerHTML = filas.map(f => {
      const ancho = f.tope ? Math.min(100, f.pct * 100) : f.gastado / maxSinTope * 100;
      const det = !f.tope ? 'Sin tope'
        : f.nivel === 'pasado' ? `Te pasaste por ${plata(f.gastado - f.tope)} (${Math.round(f.pct * 100)}%)`
          : f.nivel === 'cerca' ? `Cerca del tope: ${Math.round(f.pct * 100)}%, quedan ${plata(f.resta)}`
            : `${Math.round(f.pct * 100)}% usado, quedan ${plata(f.resta)}`;
      return `<div class="pres-row" data-nivel="${f.nivel}"><span class="n">${escapar(nombreCat(f.cat))}</span>
        <span class="track" aria-hidden="true"><span class="fill" style="width:${Math.max(2, ancho)}%"></span></span>
        <span class="v num">${plata(f.gastado)}${f.tope ? ` <small style="color:var(--muted)">/ ${plata(f.tope)}</small>` : ''}</span>
        <span class="det">${det}</span></div>`;
    }).join('');
  }
  function abrirTopes() {
    const cats = CATEGORIAS.filter(c => c.tipo === 'gasto');
    $('topes-form').innerHTML = `<p class="ayuda">Cuánto querés gastar por mes en cada categoría. Dejá vacío para no poner tope. Te aviso en la web y en el bot al llegar al 80% y al pasarte.</p>`
      + cats.map(c => `<label for="tope-${c.id}">${escapar(c.nombre)}<input id="tope-${c.id}" data-cat="${c.id}" inputmode="decimal" placeholder="Sin tope" value="${S.presupuestos[c.id] ? escapar(fmt.ARS.format(S.presupuestos[c.id]).replace(/[^\d.]/g, '')) : ''}"></label>`).join('')
      + `<div class="acc"><button type="button" class="btn" id="topes-cancelar">Cancelar</button><button type="submit" class="btn primario">Guardar topes</button></div>`;
    S.editandoTopes = true;
    renderPresupuesto();
    const primero = $('topes-form').querySelector('input'); if (primero) primero.focus();
  }
  $('btn-topes').addEventListener('click', () => { if (S.editandoTopes) { S.editandoTopes = false; renderPresupuesto(); } else abrirTopes(); });
  $('topes-form').addEventListener('click', ev => { if (ev.target.id === 'topes-cancelar') { S.editandoTopes = false; renderPresupuesto(); } });
  $('topes-form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const cambios = {};
    for (const inp of $('topes-form').querySelectorAll('input[data-cat]')) {
      const v = inp.value.trim() ? leerMonto(inp.value) : 0;
      if (inp.value.trim() && !(v >= 0)) { avisar(`No entendí el tope de ${nombreCat(inp.dataset.cat)}.`); inp.focus(); return; }
      cambios[inp.dataset.cat] = v > 0 ? Math.round(v) : 0;
    }
    try {
      const j = await api('ajustes', { method: 'POST', body: JSON.stringify({ presupuestos: cambios }) });
      S.presupuestos = j.presupuestos || {};
      S.editandoTopes = false;
      render();
      avisar('Topes guardados.');
    } catch (e) { fallo(e, 'No se pudieron guardar los topes.'); }
  });

  // ---------- Render ----------
  const itemsMes = () => S.meses[S.mes] || [];
  function render() {
    renderEstado(); renderMes(); renderResumen(); renderGrafico(); renderPresupuesto(); renderMovs(); renderCats(); renderAjustes(); renderHoy();
  }
  function renderEstado() {
    const e = $('estado'); e.dataset.modo = S.modo === 'nube' ? 'db' : S.modo === 'error' ? 'local' : 'cargando';
    $('estado-txt').textContent = S.modo === 'nube' ? (sesion ? sesion.nombre + ' · guardado en la nube' : 'Guardado en la nube') : S.modo === 'error' ? 'Sin conexión con el servidor' : token ? 'Conectando…' : 'Sin sesión';
  }
  function renderMes() {
    $('mes-txt').textContent = etiquetaMes(S.mes);
    $('mes-sig').disabled = S.mes >= mesDe(hoyIso());
  }
  function totales(items) {
    const t = { ing: 0, gas: 0, nIng: 0, nGas: 0, usdIng: 0, usdGas: 0 };
    for (const x of items) {
      if (x.moneda === 'USD') { if (x.tipo === 'ingreso') t.usdIng += x.monto; else t.usdGas += x.monto; continue; }
      if (x.tipo === 'ingreso') { t.ing += x.monto; t.nIng++; } else { t.gas += x.monto; t.nGas++; }
    }
    return t;
  }
  function renderResumen() {
    const items = itemsMes();
    const t = totales(items);
    $('k-ing').textContent = plata(t.ing);
    $('k-gas').textContent = plata(t.gas);
    const saldo = t.ing - t.gas;
    $('k-sal').textContent = (saldo > 0 ? '+' : saldo < 0 ? '−' : '') + plata(Math.abs(saldo));
    $('k-sal').dataset.signo = saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : '';
    $('k-ing-n').textContent = t.nIng === 1 ? '1 movimiento' : `${t.nIng} movimientos`;
    $('k-gas-n').textContent = t.nGas === 1 ? '1 movimiento' : `${t.nGas} movimientos`;
    $('k-sal-sub').textContent = t.ing > 0 ? `Gastaste el ${Math.round(t.gas / t.ing * 100)}% de lo que entró` : 'Sin ingresos cargados';
    const usd = $('k-usd');
    if (t.usdIng || t.usdGas) { usd.hidden = false; usd.innerHTML = `En dólares: entraron <b class="num">${plata(t.usdIng, 'USD')}</b> y salieron <b class="num">${plata(t.usdGas, 'USD')}</b>.`; }
    else usd.hidden = true;
    const al = Presupuesto.estado(items, S.presupuestos).alertas;
    $('alertas').innerHTML = al.map(f => `<span class="pill" data-nivel="${f.nivel}">${f.nivel === 'pasado' ? 'Pasado' : 'Cerca del tope'}: ${escapar(nombreCat(f.cat))} ${Math.round(f.pct * 100)}%</span>`).join('');
  }
  function renderHoy() {
    const h = hoyIso();
    const g = (S.meses[mesDe(h)] || []).filter(x => x.fecha === h && x.tipo === 'gasto' && x.moneda !== 'USD').reduce((s, x) => s + x.monto, 0);
    $('hoy-gastado').textContent = g ? `Hoy: ${plata(g)} en gastos` : '';
  }

  function renderGrafico() {
    const svg = $('chart');
    const W = Math.max(280, svg.clientWidth || 600), H = 150;
    const [y, m] = S.mes.split('-').map(Number);
    const nd = new Date(y, m, 0).getDate();
    const porDia = new Array(nd + 1).fill(0);
    for (const x of itemsMes()) if (x.tipo === 'gasto' && x.moneda !== 'USD') porDia[+x.fecha.slice(8, 10)] += x.monto;
    const max = Math.max(...porDia);
    const paso = (() => { if (!max) return 1; const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 2 ? 1 : f <= 5 ? 2.5 : 5) * p; })();
    const tope = max ? Math.ceil(max / paso) * paso : 1;
    const izq = 44, abajo = 20, arriba = 6;
    const ancho = (W - izq) / nd, alto = H - abajo - arriba;
    const yv = v => arriba + alto - (v / tope) * alto;
    const hoy = hoyIso();
    let s = '';
    const lineas = max ? [0, tope / 2, tope] : [0];
    for (const v of lineas) s += `<line class="grid" x1="${izq}" x2="${W}" y1="${yv(v)}" y2="${yv(v)}"></line><text class="ax" x="${izq - 6}" y="${yv(v) + 3.5}" text-anchor="end">${v ? '$' + fmt.corto.format(v) : '0'}</text>`;
    for (let d = 1; d <= nd; d++) {
      const x = izq + (d - 1) * ancho;
      const v = porDia[d];
      const fecha = `${S.mes}-${String(d).padStart(2, '0')}`;
      const bw = Math.max(2, ancho - 2);
      if (v > 0) {
        const h = Math.max(2, (v / tope) * alto);
        const r = Math.min(3, bw / 2, h);
        const x0 = x + 1, y0 = arriba + alto - h, x1 = x0 + bw, yb = arriba + alto;
        s += `<path class="b${fecha === hoy ? ' hoy' : ''}${S.diaSel === fecha ? ' on' : ''}" d="M${x0},${yb}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x1 - r}Q${x1},${y0} ${x1},${y0 + r}V${yb}Z"></path>`;
      }
      if (d === 1 || d % 5 === 0 || d === nd) s += `<text class="ax" x="${x + ancho / 2}" y="${H - 5}" text-anchor="middle">${d}</text>`;
      s += `<rect class="hit" data-fecha="${fecha}" data-v="${v}" x="${x}" y="${arriba}" width="${ancho}" height="${alto}"></rect>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
  }
  function mostrarTip(rect) {
    const tip = $('tip'); const wrap = $('chart-wrap');
    const f = rect.dataset.fecha, v = +rect.dataset.v;
    const d = deIso(f);
    tip.textContent = `${DIAS_C[d.getDay()]} ${d.getDate()} · ${v ? plata(v) + ' en gastos' : 'sin gastos'}`;
    const rb = rect.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let x = rb.left - wb.left + rb.width / 2;
    x = Math.min(Math.max(x, tw / 2), wb.width - tw / 2);
    tip.style.left = x + 'px';
    tip.style.top = (rb.top - wb.top + 2) + 'px';
  }

  function renderMovs() {
    const items = itemsMes().slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
    $('movs-n').textContent = items.length ? `${items.length} en ${etiquetaMes(S.mes).split(' ')[0].toLowerCase()}` : '';
    if (!items.length) {
      $('movs').innerHTML = `<p class="vacio">${S.modo === 'cargando' ? 'Cargando…' : `No hay movimientos en ${etiquetaMes(S.mes)}. Dictalos arriba o mandale un audio al bot.`}</p>`;
      return;
    }
    const grupos = new Map();
    for (const x of items) { if (!grupos.has(x.fecha)) grupos.set(x.fecha, []); grupos.get(x.fecha).push(x); }
    let h = '';
    for (const [f, xs] of grupos) {
      const d = deIso(f);
      const g = xs.filter(x => x.tipo === 'gasto' && x.moneda !== 'USD').reduce((s, x) => s + x.monto, 0);
      const i = xs.filter(x => x.tipo === 'ingreso' && x.moneda !== 'USD').reduce((s, x) => s + x.monto, 0);
      const tot = [i ? '+' + plata(i) : '', g ? '−' + plata(g) : ''].filter(Boolean).join(' · ');
      h += `<div class="dia" id="dia-${f}"><div class="dia-h"><span class="d">${f === hoyIso() ? 'Hoy' : DIAS_L[d.getDay()]} ${d.getDate()}</span><span class="t num">${tot}</span></div>`;
      for (const x of xs) {
        if (S.abierto === x.id && edicion) { h += editorHTML(edicion, 'guardado'); continue; }
        h += `<button type="button" class="mov" data-id="${x.id}">
          <span class="chip" data-tipo="${x.tipo}">${escapar(nombreCat(x.cat, x.tipo))}</span>
          <span class="desc">${escapar(x.desc)}${x.origen === 'whatsapp' ? '<span class="ori">WhatsApp</span>' : x.origen === 'telegram' ? '<span class="ori">Telegram</span>' : ''}</span>
          <span class="m num" data-tipo="${x.tipo}">${x.tipo === 'ingreso' ? '+' : '−'}${plata(x.monto, x.moneda)}</span>
        </button>`;
      }
      h += '</div>';
    }
    $('movs').innerHTML = h;
  }

  function renderCats() {
    const suma = {};
    for (const x of itemsMes()) if (x.tipo === 'ingreso' && x.moneda !== 'USD') suma[x.cat] = (suma[x.cat] || 0) + x.monto;
    const filas = Object.entries(suma).sort((a, b) => b[1] - a[1]);
    if (!filas.length) { $('cats').innerHTML = `<p class="vacio">Sin ingresos en pesos este mes.</p>`; return; }
    const total = filas.reduce((s, [, v]) => s + v, 0), max = filas[0][1];
    $('cats').innerHTML = filas.map(([c, v]) => `<div class="cat-row"><span class="n">${escapar(nombreCat(c, 'ingreso'))}</span>
      <span class="track" aria-hidden="true"><span class="fill" style="display:block;width:${Math.max(2, v / max * 100)}%"></span></span>
      <span class="v num">${plata(v)}<small>${Math.round(v / total * 100)}%</small></span></div>`).join('');
  }

  function renderBorrador() {
    const p = $('proceso');
    let h = '';
    if (S.borrador.length) {
      h += `<div class="borrador-h"><span class="label">${S.borrador.length === 1 ? 'Encontré 1 movimiento' : `Encontré ${S.borrador.length} movimientos`}</span><span class="label" style="text-transform:none;letter-spacing:0">Revisá y corregí lo que haga falta.</span></div>`;
      h += S.borrador.map(x => editorHTML(x, 'borrador')).join('');
    }
    if (S.sinMonto.length) h += `<div class="aviso warn">No encontré monto en: ${S.sinMonto.map(s => '«' + escapar(s) + '»').join(', ')}. Agregalo al texto o cargalo a mano.</div>`;
    if (S.borrador.length || S.sinMonto.length) {
      h += `<div class="fila fin"><button type="button" class="btn chico" id="btn-agregar">Agregar uno a mano</button><span class="fila"><button type="button" class="btn" id="btn-descartar">Descartar</button>${S.borrador.length ? `<button type="button" class="btn primario" id="btn-guardar">Guardar ${S.borrador.length === 1 ? 'movimiento' : S.borrador.length + ' movimientos'}</button>` : ''}</span></div>`;
    }
    p.innerHTML = h;
  }

  function renderAjustes() {
    const n = Object.keys(S.aprendidas).length;
    $('aprendidas-txt').textContent = n
      ? `Aprendí ${n} ${n === 1 ? 'palabra' : 'palabras'} de tus correcciones de categoría (por ejemplo: ${Object.entries(S.aprendidas).slice(-3).map(([w, c]) => `«${w}» → ${nombreCat(c)}`).join(', ')}). Las uso acá y en el bot.`
      : 'Cuando cambiás la categoría de un movimiento, aprendo esas palabras y la próxima vez lo ordeno solo, acá y en el bot.';
    $('btn-olvidar').disabled = !n;
  }

  // ---------- Avisos ----------
  let tToast = null;
  function avisar(msg, accion, fn) {
    const t = $('toast');
    t.innerHTML = '';
    const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
    if (accion) { const b = document.createElement('button'); b.type = 'button'; b.textContent = accion; b.onclick = () => { t.hidden = true; fn(); }; t.appendChild(b); }
    t.hidden = false;
    clearTimeout(tToast); tToast = setTimeout(() => { t.hidden = true; }, accion ? 6000 : 4000);
  }

  // ---------- CSV ----------
  function exportarCSV() {
    const items = itemsMes();
    if (!items.length) { avisar('Este mes no tiene movimientos para exportar.'); return; }
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const filas = [['fecha', 'tipo', 'categoria', 'descripcion', 'monto', 'moneda', 'origen'].join(';')]
      .concat(items.map(x => [x.fecha, x.tipo, nombreCat(x.cat, x.tipo), q(x.desc), String(x.monto).replace('.', ','), x.moneda, x.origen || 'web'].join(';')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + filas.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `libreta-${S.mes}.csv`; document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- Eventos ----------
  $('fecha-base').value = hoyIso();
  $('fecha-base').max = hoyIso();
  $('btn-procesar').addEventListener('click', procesar);
  $('btn-limpiar').addEventListener('click', () => { $('texto').value = ''; $('texto').focus(); });
  $('texto').addEventListener('keydown', ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) procesar(); });
  function irAMes(k) {
    S.mes = k; S.abierto = null; edicion = null; S.diaSel = null; S.editandoTopes = false;
    render();
    cargarMes(k);
  }
  $('mes-ant').addEventListener('click', () => { const [y, m] = S.mes.split('-').map(Number); irAMes(iso(new Date(y, m - 2, 1)).slice(0, 7)); });
  $('mes-sig').addEventListener('click', () => { const [y, m] = S.mes.split('-').map(Number); irAMes(iso(new Date(y, m, 1)).slice(0, 7)); });
  $('btn-olvidar').addEventListener('click', async () => {
    try { await api('ajustes', { method: 'POST', body: JSON.stringify({ olvidar: true }) }); S.aprendidas = {}; renderAjustes(); avisar('Listo, olvidé las palabras aprendidas.'); }
    catch (e) { fallo(e, 'No se pudo.'); }
  });
  $('btn-csv').addEventListener('click', exportarCSV);
  $('btn-salir').addEventListener('click', () => pedirAcceso());

  $('proceso').addEventListener('input', onEditorInput);
  $('proceso').addEventListener('change', onEditorInput);
  $('proceso').addEventListener('click', ev => {
    if (ev.target.closest('#btn-guardar')) return guardarBorrador();
    if (ev.target.closest('#btn-descartar')) { S.borrador = []; S.sinMonto = []; renderBorrador(); return; }
    if (ev.target.closest('#btn-agregar')) {
      S.borrador.push({ id: nuevoId(), tipo: 'gasto', monto: 0, moneda: 'ARS', cat: 'otros', desc: '', fecha: $('fecha-base').value || hoyIso() });
      renderBorrador(); return;
    }
    onEditorClick(ev);
  });
  $('movs').addEventListener('input', onEditorInput);
  $('movs').addEventListener('change', onEditorInput);
  $('movs').addEventListener('click', ev => {
    const b = ev.target.closest('.mov');
    if (b) {
      const o = buscarGuardado(b.dataset.id); if (!o) return;
      S.abierto = o.x.id; edicion = { ...o.x };
      renderMovs();
      const el = document.querySelector(`.editor[data-id="${o.x.id}"] input[data-campo="monto"]`); if (el) el.focus();
      return;
    }
    onEditorClick(ev);
  });

  const svg = $('chart');
  svg.addEventListener('pointermove', ev => { const r = ev.target.closest('.hit'); if (r) mostrarTip(r); else $('tip').hidden = true; });
  svg.addEventListener('pointerleave', () => { $('tip').hidden = true; });
  svg.addEventListener('click', ev => {
    const r = ev.target.closest('.hit'); if (!r) return;
    mostrarTip(r);
    S.diaSel = r.dataset.fecha; renderGrafico();
    const d = document.getElementById('dia-' + r.dataset.fecha);
    if (d) d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  let tRes = null;
  window.addEventListener('resize', () => { clearTimeout(tRes); tRes = setTimeout(renderGrafico, 120); });

  // Lo que llega por el bot aparece al volver a la página y cada minuto mientras está abierta.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !edicion && !S.editandoTopes) refrescar(true); });
  setInterval(() => { if (document.visibilityState === 'visible' && !edicion && !S.editandoTopes && !S.borrador.length) refrescar(true); }, 60000);

  function aplicarTema(oscuro) {
    if (oscuro) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    $('btn-tema').setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    try { localStorage.setItem(LS_TEMA, oscuro ? 'oscuro' : 'claro'); } catch (e) {}
    renderGrafico();
  }
  $('btn-tema').addEventListener('click', () => aplicarTema(document.documentElement.dataset.theme !== 'dark'));

  // ---------- Instalar como app ----------
  const LS_INSTALAR = 'libreta-plata-instalar-no';
  const esApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let pedidoInstalar = null;
  function mostrarInstalar(texto, conBoton) {
    try { if (localStorage.getItem(LS_INSTALAR)) return; } catch (e) {}
    $('instalar-txt').textContent = texto;
    $('btn-instalar').hidden = !conBoton;
    $('instalar').hidden = false;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    pedidoInstalar = ev;
    if (!esApp) mostrarInstalar('Queda con su ícono en la pantalla de inicio y se abre como cualquier app.', true);
  });
  const esAndroid = /android/i.test(navigator.userAgent);
  if (esAndroid && !esApp && !/wv\)/.test(navigator.userAgent)) {
    setTimeout(() => { if (!pedidoInstalar) mostrarInstalar('Bajá la app para Android e instalala como cualquier aplicación.', true); }, 1500);
  }
  if (esIOS && !esApp) mostrarInstalar('En Safari, tocá el botón Compartir (el cuadrado con la flecha) y después «Agregar a inicio».', false);
  $('btn-instalar').addEventListener('click', async () => {
    if (!pedidoInstalar) { location.href = '/descargar/libreta-de-plata.apk'; return; }
    pedidoInstalar.prompt();
    const r = await pedidoInstalar.userChoice.catch(() => null);
    pedidoInstalar = null;
    $('instalar').hidden = true;
    if (r && r.outcome === 'accepted') avisar('Listo, la app quedó instalada.');
  });
  $('btn-instalar-no').addEventListener('click', () => {
    $('instalar').hidden = true;
    try { localStorage.setItem(LS_INSTALAR, '1'); } catch (e) {}
  });
  window.addEventListener('appinstalled', () => { $('instalar').hidden = true; });

  iniciarVoz();
  if (token) {
    $('contenido').hidden = false; $('mesnav').hidden = false; render();
    api('cuenta').then(s => abrirSesion({ ...s, token })).catch(e => {
      if (e.estado === 401) pedirAcceso('Tu sesión venció. Entrá de nuevo.');
      else { S.modo = 'error'; renderEstado(); }
    });
  } else pedirAcceso();
})();
