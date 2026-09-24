// Lector local de movimientos dictados en castellano rioplatense.
// Lo usan la página web (public/index.html) y los bots (api/whatsapp.js, api/telegram.js).
(function (raiz) {
const Lector = (() => {
  const ACC = { 'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e', 'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ñ': 'n' };
  // Mantiene el largo del texto, así los índices valen para el original.
  const norm = s => s.toLowerCase().replace(/[áàäâéèëêíìïîóòöôúùüûñ]/g, c => ACC[c]);

  const CATEGORIAS = [
    { id: 'super', tipo: 'gasto', nombre: 'Supermercado', claves: ['super', 'supermercado', 'chino', 'almacen', 'verduleria', 'verdura', 'verduras', 'fruta', 'frutas', 'carniceria', 'carne', 'polleria', 'pollo', 'fiambreria', 'fiambre', 'panaderia', 'pan', 'leche', 'huevos', 'mercaderia', 'mercado', 'coto', 'carrefour', 'jumbo', 'disco', 'changomas', 'la anonima', 'dietetica', 'compras del mes', 'yerba'] },
    { id: 'comida', tipo: 'gasto', nombre: 'Comida afuera', claves: ['restaurante', 'restaurant', 'resto', 'bar', 'cafe', 'cafecito', 'cafeteria', 'almuerzo', 'almorce', 'cena', 'cene', 'desayuno', 'desayune', 'merienda', 'delivery', 'pedidosya', 'pedidos ya', 'rappi', 'pizza', 'pizzeria', 'hamburguesa', 'burger', 'mcdonalds', 'mc donalds', 'empanada', 'sushi', 'helado', 'heladeria', 'birra', 'cerveza', 'parrilla', 'lomito', 'milanesa', 'comida', 'sanguche', 'medialunas', 'facturas'] },
    { id: 'kiosco', tipo: 'gasto', nombre: 'Kiosco', claves: ['kiosco', 'kiosko', 'golosina', 'alfajor', 'cigarrillos', 'puchos', 'atado', 'gaseosa', 'coca', 'agua mineral', 'chicle', 'caramelos', 'chocolate'] },
    { id: 'transporte', tipo: 'gasto', nombre: 'Transporte', claves: ['nafta', 'combustible', 'gasoil', 'uber', 'cabify', 'didi', 'taxi', 'remis', 'colectivo', 'bondi', 'subte', 'tren', 'sube', 'peaje', 'estacionamiento', 'cochera', 'ypf', 'shell', 'axion', 'pasaje', 'mecanico', 'gomeria', 'lavadero de autos', 'service del auto', 'seguro del auto', 'patente del auto', 'auto', 'moto'] },
    { id: 'hogar', tipo: 'gasto', nombre: 'Casa y servicios', claves: ['alquiler', 'expensas', 'luz', 'gas', 'agua', 'internet', 'wifi', 'cable', 'celular', 'abono', 'telefono', 'edenor', 'edesur', 'metrogas', 'aysa', 'fibertel', 'telecentro', 'movistar', 'limpieza', 'ferreteria', 'mueble', 'muebles', 'plomero', 'electricista', 'lavanderia', 'articulos de limpieza'] },
    { id: 'salud', tipo: 'gasto', nombre: 'Salud y deporte', claves: ['farmacia', 'medico', 'remedio', 'remedios', 'medicamento', 'obra social', 'prepaga', 'osde', 'swiss medical', 'galeno', 'dentista', 'odontologo', 'psicologo', 'psicologa', 'terapia', 'analisis', 'kinesiologo', 'gimnasio', 'gym', 'pilates', 'yoga', 'crossfit', 'padel', 'futbol', 'cancha', 'ibuprofeno', 'consulta'] },
    { id: 'ocio', tipo: 'gasto', nombre: 'Salidas y ocio', claves: ['cine', 'teatro', 'recital', 'show', 'entrada', 'salida', 'boliche', 'juego', 'steam', 'playstation', 'viaje', 'hotel', 'vacaciones', 'escapada', 'museo', 'fiesta', 'previa'] },
    { id: 'suscripciones', tipo: 'gasto', nombre: 'Suscripciones', claves: ['netflix', 'spotify', 'disney', 'hbo', 'youtube premium', 'amazon prime', 'prime video', 'icloud', 'google one', 'chatgpt', 'claude', 'suscripcion', 'membresia', 'paramount', 'apple music'] },
    { id: 'ropa', tipo: 'gasto', nombre: 'Ropa y cuidado', claves: ['ropa', 'zapatillas', 'remera', 'pantalon', 'campera', 'zapatos', 'buzo', 'jean', 'vestido', 'medias', 'camisa', 'peluqueria', 'corte de pelo', 'barberia', 'perfume', 'shampoo', 'maquillaje'] },
    { id: 'educacion', tipo: 'gasto', nombre: 'Educación', claves: ['facultad', 'facu', 'universidad', 'curso', 'libro', 'libros', 'apuntes', 'fotocopias', 'colegio', 'matricula', 'udemy', 'clase particular', 'clases', 'cuota de la facultad', 'materiales'] },
    { id: 'tecnologia', tipo: 'gasto', nombre: 'Tecnología', claves: ['auriculares', 'cargador', 'computadora', 'notebook', 'mouse', 'teclado', 'monitor', 'celular nuevo', 'tablet', 'pendrive', 'impresora', 'funda'] },
    { id: 'mascotas', tipo: 'gasto', nombre: 'Mascotas', claves: ['veterinario', 'veterinaria', 'perro', 'gato', 'balanceado', 'mascota', 'piedritas'] },
    { id: 'regalos', tipo: 'gasto', nombre: 'Regalos', claves: ['regalo', 'cumpleanos', 'cumple', 'regale', 'donacion'] },
    { id: 'impuestos', tipo: 'gasto', nombre: 'Impuestos y banco', claves: ['impuesto', 'monotributo', 'afip', 'arca', 'abl', 'patente', 'comision', 'tarjeta', 'resumen de la tarjeta', 'intereses de la tarjeta', 'rentas', 'iibb', 'ingresos brutos', 'mantenimiento de cuenta', 'prestamo'] },
    { id: 'otros', tipo: 'gasto', nombre: 'Otros gastos', claves: [] },
    { id: 'sueldo', tipo: 'ingreso', nombre: 'Sueldo', claves: ['sueldo', 'salario', 'aguinaldo', 'haberes', 'quincena', 'recibo de sueldo'] },
    { id: 'trabajo', tipo: 'ingreso', nombre: 'Trabajos extra', claves: ['freelance', 'cliente', 'honorarios', 'trabajo', 'changa', 'laburo', 'proyecto', 'factura', 'clase que di', 'comision de venta', 'bono'] },
    { id: 'ventas', tipo: 'ingreso', nombre: 'Ventas', claves: ['venta', 'ventas', 'mercadolibre', 'mercado libre', 'marketplace'] },
    { id: 'transferencias', tipo: 'ingreso', nombre: 'Transferencias recibidas', claves: ['transferencia', 'me devolvieron', 'reintegro', 'devolucion', 'reembolso', 'me prestaron'] },
    { id: 'inversiones', tipo: 'ingreso', nombre: 'Inversiones', claves: ['plazo fijo', 'dividendos', 'rendimiento', 'cedear', 'cedears', 'fci', 'fondo comun', 'cripto', 'acciones', 'intereses del plazo fijo', 'cuenta remunerada'] },
    { id: 'otros_ing', tipo: 'ingreso', nombre: 'Otros ingresos', claves: [] },
  ];
  const POR_ID = Object.fromEntries(CATEGORIAS.map(c => [c.id, c]));
  const OTROS = { gasto: 'otros', ingreso: 'otros_ing' };

  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const palabra = k => esc(k).replace(/ /g, '\\s+');
  const reLista = lista => new RegExp('(?:^|[^a-z0-9])(' + lista.map(palabra).join('|') + ')(?![a-z0-9])', 'g');

  const CLAVES = [];
  for (const c of CATEGORIAS) for (const k of c.claves) {
    CLAVES.push({ k, cat: c.id, tipo: c.tipo, re: new RegExp('(?:^|[^a-z0-9])' + palabra(k) + '(?:s|es)?(?![a-z0-9])') });
  }
  CLAVES.sort((a, b) => b.k.length - a.k.length);

  const V_INGRESO = ['cobre', 'cobramos', 'cobro', 'me pagaron', 'me pago', 'nos pagaron', 'me abonaron', 'recibi', 'recibimos', 'me ingreso', 'ingreso', 'ingresaron', 'me ingresaron', 'me entro', 'me entraron', 'entro', 'entraron', 'gane', 'ganamos', 'vendi', 'vendimos', 'me transfirieron', 'me pasaron', 'me depositaron', 'me devolvieron', 'me dieron', 'me regalaron', 'me llego', 'me llegaron', 'me giraron'];
  const V_GASTO = ['gaste', 'gastamos', 'pague', 'pagamos', 'compre', 'compramos', 'me salio', 'salio', 'salieron', 'me costo', 'costo', 'costaron', 'puse', 'cargue', 'abone', 'invite', 'transferi', 'le pase', 'le pague', 'deje', 'done', 'me cobraron', 'me gaste', 'me compre'];
  const RE_ING = reLista(V_INGRESO);
  const RE_GAS = reLista(V_GASTO);
  const RUIDO = new Set(['pesos', 'peso', 'mangos', 'plata', 'hoy', 'ayer', 'anteayer', 'dolares', 'dolar', 'usd', 'verdes', 'aproximadamente', 'como']);
  const RE_RUIDO = reLista([...RUIDO, 'en total', 'mas o menos']);
  const RELLENO = new Set(['en', 'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'por', 'para', 'al', 'y', 'e', 'que', 'me', 'se', 'mi', 'mis', 'con', 'a', 'lo', 'le', 'les', 'tambien', 'ademas', 'despues', 'luego', 'aparte', 'otro', 'otra', 'gasto', 'gastos', 'pago', 'total', 'o', 'sea', 'eh', 'bueno', 'nada', 'es']);

  // ---- números escritos con palabras ----
  const UNI = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
  const DEC = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
  const CEN = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
  const MULT = { mil: 1e3, millon: 1e6, millones: 1e6 };
  const esNum = w => w in UNI || w in DEC || w in CEN || w in MULT;
  const SOLO_UNO = new Set(['un', 'uno', 'una']);
  const MULT_SIG = new Set(['luca', 'lucas', 'palo', 'palos', 'mil', 'millon', 'millones']);

  function valorPalabras(ws) {
    let total = 0, cur = 0;
    for (const w of ws) {
      if (w === 'y') continue;
      if (w in UNI) cur += UNI[w];
      else if (w in DEC) cur += DEC[w];
      else if (w in CEN) cur += CEN[w];
      else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; }
      else if (w === 'millon' || w === 'millones') { total = (total + (cur || 1)) * 1e6; cur = 0; }
    }
    return total + cur;
  }

  function numeroStr(s, conMult) {
    if (conMult) {
      const m = s.match(/^(\d+)(?:[.,](\d+))?$/);
      if (m) return parseFloat(m[1] + '.' + (m[2] || '0'));
      return parseFloat(s.replace(/[.,]/g, ''));
    }
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return +s.replace(/[.,]/g, '');
    if (/^\d+[.,]\d{1,2}$/.test(s)) return parseFloat(s.replace(',', '.'));
    return +s.replace(/[.,]/g, '');
  }

  // Convierte "quince mil quinientos" en "15500" y "12 mil" en "12000".
  function palabrasANumeros(texto) {
    let t = texto.replace(/\bmedio palo\b/gi, '500000').replace(/\bmedia luca\b/gi, '500');
    const toks = t.split(/\s+/).filter(Boolean).map(raw => {
      const m = raw.match(/^([¿¡("'«]*)(.*?)([.,;:!?)"'»]*)$/);
      return { raw, pre: m[1], core: m[2], post: m[3], n: norm(m[2]) };
    });
    const out = [];
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (!esNum(tk.n)) { out.push(tk.raw); continue; }
      let j = i, ws = [];
      while (j < toks.length) {
        const w = toks[j];
        if (esNum(w.n)) { ws.push(w.n); if (w.post) { j++; break; } j++; continue; }
        if (w.n === 'y' && !w.post && ws.length && ws[ws.length - 1] in DEC && toks[j + 1] && UNI[toks[j + 1].n] >= 1 && UNI[toks[j + 1].n] <= 9) { ws.push('y'); j++; continue; }
        break;
      }
      const ultimo = toks[j - 1];
      const siguiente = toks[j] ? toks[j].n : '';
      if (ws.length === 1 && SOLO_UNO.has(ws[0]) && !(MULT_SIG.has(siguiente) && !ultimo.post)) { out.push(tk.raw); continue; }
      // "12 mil" o "1,5 millones": el número anterior en cifras multiplica.
      if (ws[0] in MULT && out.length) {
        const prevRaw = out[out.length - 1];
        const pm = prevRaw.match(/^([¿¡("'«$]*)(\d+(?:[.,]\d+)?)$/);
        if (pm) {
          const base = numeroStr(pm[2], true);
          let mult = MULT[ws[0]], resto = valorPalabras(ws.slice(1));
          if (ws[0] === 'mil' && ws.slice(1).some(w => w in MULT)) { mult = 1; resto = valorPalabras(ws); }
          out[out.length - 1] = pm[1] + String(Math.round(base * mult + resto)) + ultimo.post;
          i = j - 1;
          continue;
        }
      }
      out.push(tk.pre + String(valorPalabras(ws)) + ultimo.post);
      i = j - 1;
    }
    return out.join(' ');
  }

  // ---- fechas ----
  const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const deIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const sumarDias = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return iso(d); };

  function buscarFecha(n, hoy) {
    let m;
    if ((m = /(?:^|[^a-z])(anteayer|antes\s+de\s+ayer|antier)(?![a-z])/.exec(n))) return { fecha: sumarDias(hoy, -2), i: m.index, f: m.index + m[0].length };
    if ((m = /(?:^|[^a-z])(ayer)(?![a-z])/.exec(n))) return { fecha: sumarDias(hoy, -1), i: m.index, f: m.index + m[0].length };
    if ((m = /(?:^|[^a-z])(hoy)(?![a-z])/.exec(n))) return { fecha: hoy, i: m.index, f: m.index + m[0].length };
    if ((m = new RegExp('(?:^|[^a-z])(?:el\\s+)?(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(' + MESES.join('|') + ')(?![a-z])').exec(n))) {
      const h = deIso(hoy); const mes = MESES.indexOf(m[2]); let y = h.getFullYear();
      let d = new Date(y, mes, +m[1]); if (d > h) d = new Date(y - 1, mes, +m[1]);
      return { fecha: iso(d), i: m.index, f: m.index + m[0].length };
    }
    if ((m = /(?:^|[^a-z])el\s+dia\s+(\d{1,2})(?![0-9])/.exec(n))) {
      const h = deIso(hoy); let d = new Date(h.getFullYear(), h.getMonth(), +m[1]);
      if (d > h) d = new Date(h.getFullYear(), h.getMonth() - 1, +m[1]);
      return { fecha: iso(d), i: m.index, f: m.index + m[0].length };
    }
    if ((m = new RegExp('(?:^|[^a-z])(?:el\\s+)?(' + DIAS.join('|') + ')(?:\\s+pasado)?(?![a-z])').exec(n))) {
      const h = deIso(hoy); let atras = (h.getDay() - DIAS.indexOf(m[1]) + 7) % 7;
      return { fecha: sumarDias(hoy, -atras), i: m.index, f: m.index + m[0].length };
    }
    return null;
  }

  // ---- montos ----
  const RE_MONTO = /(\$|u\$s|us\$|usd\s?)?\s?(\d+(?:[.,]\d+)*)(?:\s?(k|lucas?|palos?|millon(?:es)?|mil)(?![a-z]))?(?:\s?(pesos|peso|mangos|dolares|dolar|usd|verdes))?(?![a-z0-9])/g;
  function buscarMontos(n) {
    const res = [];
    RE_MONTO.lastIndex = 0;
    let m;
    while ((m = RE_MONTO.exec(n))) {
      const conMult = !!m[3];
      let v = numeroStr(m[2], conMult);
      if (m[3]) v *= /^(palo|millon)/.test(m[3]) ? 1e6 : 1e3;
      const usd = /u\$s|us\$|usd/.test(m[1] || '') || /dolar|usd|verdes/.test(m[4] || '');
      const marcado = !!(m[1] || m[3] || m[4]);
      let i = m.index; while (n[i] === ' ') i++;
      res.push({ v: Math.round(v * 100) / 100, usd, marcado, i, f: m.index + m[0].length });
    }
    return res;
  }
  // Un número chico sin "$" ni "pesos" suele ser una cantidad ("2 cafés").
  function montosDePlata(n) {
    const todos = buscarMontos(n).filter(x => x.v > 0);
    const plata = todos.filter(x => x.marcado || x.v >= 100);
    if (plata.length) return plata;
    return todos.length ? [todos[todos.length - 1]] : [];
  }

  // ---- segmentación ----
  const RE_SEP = /[;\n]+|[,.](?!\d)|\s+(?:y\s+(?:despues|tambien|ademas|luego|aparte)|y|e|tambien|ademas|despues|luego|aparte|mas\s+tarde)\s+/g;
  function segmentar(texto) {
    const n = norm(texto);
    const cortes = [];
    let m; RE_SEP.lastIndex = 0;
    while ((m = RE_SEP.exec(n))) cortes.push([m.index, m.index + m[0].length]);
    let segs = [], ini = 0;
    for (const [a, b] of cortes) { segs.push([ini, a]); ini = b; }
    segs.push([ini, texto.length]);
    segs = segs.filter(([a, b]) => /[a-z0-9]/.test(n.slice(a, b)));
    // Unir los tramos sin monto con el siguiente ("pagué la luz, 38.000").
    const unidos = []; let pendiente = null;
    for (let s of segs) {
      if (pendiente) { s = [pendiente[0], s[1]]; pendiente = null; }
      if (montosDePlata(n.slice(s[0], s[1])).length) unidos.push(s); else pendiente = s;
    }
    if (pendiente) { if (unidos.length) unidos[unidos.length - 1][1] = pendiente[1]; else unidos.push(pendiente); }
    // Separar tramos con varios montos ("2000 en súper 3000 en nafta").
    const final = [];
    for (const [a, b] of unidos) {
      const sn = n.slice(a, b);
      const ms = montosDePlata(sn);
      if (ms.length < 2) { final.push([a, b]); continue; }
      const cola = sn.slice(ms[ms.length - 1].f).split(/[^a-z]+/).filter(w => w && !RELLENO.has(w) && !RUIDO.has(w));
      const montoPrimero = cola.length > 0;
      let ini2 = a;
      for (let k = 0; k < ms.length - 1; k++) {
        const corte = montoPrimero ? a + ms[k + 1].i : a + ms[k].f;
        final.push([ini2, corte]); ini2 = corte;
      }
      final.push([ini2, b]);
    }
    return final.map(([a, b]) => texto.slice(a, b));
  }

  function categoria(n, tipo, aprendidas) {
    for (const [w, cat] of Object.entries(aprendidas || {})) {
      const c = POR_ID[cat];
      if (!c || (tipo && c.tipo !== tipo)) continue;
      if (new RegExp('(?:^|[^a-z0-9])' + palabra(w) + '(?![a-z0-9])').test(n)) return { cat, tipo: c.tipo, fuerte: true };
    }
    for (const c of CLAVES) {
      if (tipo && c.tipo !== tipo) continue;
      if (c.re.test(n)) return { cat: c.cat, tipo: c.tipo };
    }
    return null;
  }

  function primero(re, n) { re.lastIndex = 0; const m = re.exec(n); re.lastIndex = 0; return m; }
  function todos(re, n) { const r = []; re.lastIndex = 0; let m; while ((m = re.exec(n))) { r.push([m.index + m[0].indexOf(m[1]), m.index + m[0].length]); if (m[0].length === 0) re.lastIndex++; } re.lastIndex = 0; return r; }

  function limpiarDescripcion(seg, n, tapar) {
    const mask = new Array(seg.length).fill(false);
    for (const [a, b] of tapar) for (let i = a; i < b; i++) mask[i] = true;
    for (const re of [RE_ING, RE_GAS, RE_RUIDO]) for (const [a, b] of todos(re, n)) for (let i = a; i < b; i++) mask[i] = true;
    let d = '';
    for (let i = 0; i < seg.length; i++) d += mask[i] ? ' ' : seg[i];
    d = d.replace(/[$]/g, ' ').replace(/\s+/g, ' ').trim();
    let cambio = true;
    while (cambio && d) {
      cambio = false;
      d = d.replace(/^[\s,.;:!?¿¡\-–]+|[\s,.;:!?¿¡\-–]+$/g, '');
      const ws = d.split(' ');
      if (ws.length && RELLENO.has(norm(ws[0]))) { ws.shift(); cambio = true; }
      if (ws.length && RELLENO.has(norm(ws[ws.length - 1]))) { ws.pop(); cambio = true; }
      d = ws.join(' ');
    }
    return d ? d.charAt(0).toUpperCase() + d.slice(1) : '';
  }

  function leer(texto, opciones = {}) {
    const hoy = opciones.hoy || iso(new Date());
    let fechaActual = opciones.fecha || hoy;
    const aprendidas = opciones.aprendidas || {};
    const t = palabrasANumeros(String(texto || ''));
    const items = [], sinMonto = [];
    let tipoPrevio = null;
    for (const seg of segmentar(t)) {
      const n = norm(seg);
      const tapar = [];
      const f = buscarFecha(n, hoy);
      let nSinFecha = n;
      if (f) { fechaActual = f.fecha; tapar.push([f.i, f.f]); nSinFecha = n.slice(0, f.i) + ' '.repeat(f.f - f.i) + n.slice(f.f); }
      const ms = montosDePlata(nSinFecha);
      if (!ms.length) { const s = seg.trim(); if (s) sinMonto.push(s); continue; }
      const monto = ms[ms.length === 1 ? 0 : ms.reduce((best, x, k) => (x.v > ms[best].v ? k : best), 0)];
      tapar.push([monto.i, monto.f]);

      const mi = primero(RE_ING, n), mg = primero(RE_GAS, n);
      let tipoVerbo = null;
      if (mi && mg) tipoVerbo = mi.index <= mg.index ? 'ingreso' : 'gasto';
      else if (mi) tipoVerbo = 'ingreso';
      else if (mg) tipoVerbo = 'gasto';

      let tipo, cat;
      if (tipoVerbo) {
        tipo = tipoVerbo;
        const c = categoria(n, tipo, aprendidas);
        cat = c ? c.cat : (tipo === 'ingreso' && /(?:^|[^a-z])vend/.test(n) ? 'ventas' : OTROS[tipo]);
      } else {
        const c = categoria(n, null, aprendidas);
        if (c) { tipo = c.tipo; cat = c.cat; }
        else { tipo = tipoPrevio || 'gasto'; cat = OTROS[tipo]; }
      }
      tipoPrevio = tipo;
      const desc = limpiarDescripcion(seg, n, tapar) || POR_ID[cat].nombre;
      items.push({ tipo, monto: monto.v, moneda: monto.usd ? 'USD' : 'ARS', cat, desc, fecha: fechaActual });
    }
    return { items, sinMonto };
  }

  // Palabras de una descripción que sirven para aprender categorías.
  function palabrasClave(desc) {
    return norm(desc).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !RELLENO.has(w) && !/^\d+$/.test(w));
  }

  return { leer, CATEGORIAS, POR_ID, OTROS, norm, palabrasClave, iso, deIso, sumarDias, palabrasANumeros, segmentar };
})();
  if (typeof module === 'object' && module.exports) module.exports = Lector;
  else raiz.Lector = Lector;
})(typeof self !== 'undefined' ? self : this);
