// Lógica del bot de WhatsApp: recibe el texto (escrito o transcripto de un audio)
// y devuelve la respuesta. No habla con WhatsApp; eso lo hace api/whatsapp.js.
const Lector = require('../public/lector.js');
const Presupuesto = require('../public/presupuesto.js');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fmtUSD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const plata = (v, m = 'ARS') => (m === 'USD' ? fmtUSD : fmtARS).format(v);
const nombre = c => (Lector.POR_ID[c] || {}).nombre || c;

function fechaCorta(f, hoy) {
  if (f === hoy) return 'hoy';
  if (f === Lector.sumarDias(hoy, -1)) return 'ayer';
  const d = Lector.deIso(f);
  return `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function lineaAlerta(f) {
  if (f.nivel === 'pasado') return `⚠️ ${nombre(f.cat)}: te pasaste por ${plata(f.gastado - f.tope)} (${plata(f.gastado)} de ${plata(f.tope)}).`;
  return `⚠️ ${nombre(f.cat)}: llevás ${plata(f.gastado)} de ${plata(f.tope)} (${Math.round(f.pct * 100)}%). Te quedan ${plata(f.resta)}.`;
}

const AYUDA = [
  'Mandame un audio o un texto con lo que gastaste o cobraste. Por ejemplo:',
  '«Gasté 4.500 en el súper y 12 mil de nafta. Me pagaron 150 lucas de un freelance.»',
  '',
  'También entiendo:',
  '• *resumen*: cómo vas este mes',
  '• *presupuesto*: tus topes por categoría',
  '• *presupuesto súper 200 mil*: fija un tope mensual',
  '• *presupuesto súper 0*: lo saca',
  '• *deshacer*: borra lo último que anoté',
].join('\n');

// Busca una categoría de gasto por su nombre o por sus palabras clave.
function categoriaDeGasto(n) {
  for (const c of Lector.CATEGORIAS) {
    if (c.tipo !== 'gasto') continue;
    const nom = Lector.norm(c.nombre);
    if (n.includes(nom) || nom.split(' ').some(w => w.length > 3 && new RegExp('\\b' + w + '\\b').test(n))) return c.id;
  }
  const r = Lector.leer(n + ' 1000', { hoy: '2000-01-01' }).items[0];
  return r && r.tipo === 'gasto' && r.cat !== 'otros' ? r.cat : null;
}

function crearBot({ datos, hoy, urlWeb }) {
  const mesActual = hoy.slice(0, 7);
  const pie = urlWeb ? `\nCorregí o mirá todo en ${urlWeb}` : '';

  async function resumen() {
    const [items, aj] = await Promise.all([datos.itemsMes(mesActual), datos.ajustes()]);
    const ing = items.filter(x => x.tipo === 'ingreso' && x.moneda !== 'USD').reduce((s, x) => s + x.monto, 0);
    const gas = items.filter(x => x.tipo === 'gasto' && x.moneda !== 'USD').reduce((s, x) => s + x.monto, 0);
    const est = Presupuesto.estado(items, aj.presupuestos);
    const [y, m] = mesActual.split('-').map(Number);
    const l = [`*${MESES[m - 1]} ${y}*`, `Entró: ${plata(ing)}`, `Salió: ${plata(gas)}`, `Saldo: ${ing - gas < 0 ? '−' : ''}${plata(Math.abs(ing - gas))}`];
    const conTope = est.filas.filter(f => f.tope);
    if (conTope.length) {
      l.push('', '*Presupuesto*');
      for (const f of conTope) l.push(`${f.nivel === 'pasado' ? '🔴' : f.nivel === 'cerca' ? '🟡' : '🟢'} ${nombre(f.cat)}: ${plata(f.gastado)} de ${plata(f.tope)} (${Math.round(f.pct * 100)}%)`);
    }
    const sinTope = est.filas.filter(f => !f.tope && f.gastado > 0).sort((a, b) => b.gastado - a.gastado).slice(0, 5);
    if (sinTope.length) {
      l.push('', conTope.length ? '*Otros gastos*' : '*Gastos por categoría*');
      for (const f of sinTope) l.push(`${nombre(f.cat)}: ${plata(f.gastado)}`);
    }
    return l.join('\n') + (pie ? '\n' + pie : '');
  }

  async function presupuesto(resto) {
    const n = Lector.norm(resto).trim();
    if (!n) {
      const [items, aj] = await Promise.all([datos.itemsMes(mesActual), datos.ajustes()]);
      const est = Presupuesto.estado(items, aj.presupuestos);
      const conTope = est.filas.filter(f => f.tope);
      if (!conTope.length) return 'Todavía no tenés topes. Escribí, por ejemplo, *presupuesto súper 200 mil*.';
      return ['*Presupuesto de este mes*', ...conTope.map(f => `${nombre(f.cat)}: ${plata(f.gastado)} de ${plata(f.tope)}${f.nivel === 'pasado' ? ' (pasado)' : f.resta >= 0 ? `, quedan ${plata(f.resta)}` : ''}`),
        '', `Total: ${plata(est.totalGastadoConTope)} de ${plata(est.totalTope)}`].join('\n');
    }
    const cat = categoriaDeGasto(n.replace(/[\d.,$]+.*$/, ' ').trim() || n);
    const numeros = Lector.palabrasANumeros(n);
    const quitar = /(?:^|\s)(0|cero|nada|sacar|saca|borrar|borra|quitar|quita)(?:\s|$)/.test(n);
    const m = Lector.leer(numeros.replace(/^\D*/, 'gasté '), { hoy }).items[0];
    if (!cat) return 'No me di cuenta de qué categoría. Probá con el nombre: ' + Lector.CATEGORIAS.filter(c => c.tipo === 'gasto' && c.id !== 'otros').map(c => c.nombre).join(', ') + '.';
    if (quitar && !(m && m.monto > 0 && !/(?:^|\s)0(?:\s|$)/.test(numeros))) {
      await datos.fijarPresupuestos({ [cat]: 0 });
      return `Listo, saqué el tope de ${nombre(cat)}.`;
    }
    if (!m || !(m.monto > 0)) return `¿De cuánto es el tope de ${nombre(cat)}? Por ejemplo: *presupuesto ${Lector.norm(nombre(cat)).split(' ')[0]} 200 mil*.`;
    await datos.fijarPresupuestos({ [cat]: m.monto });
    const items = await datos.itemsMes(mesActual);
    const f = Presupuesto.estado(items, { [cat]: m.monto }).filas.find(x => x.cat === cat);
    return `Listo: ${nombre(cat)} tiene un tope de ${plata(m.monto)} por mes. Este mes llevás ${plata(f.gastado)} (${Math.round(f.pct * 100)}%).`;
  }

  async function anotar(texto) {
    const aj = await datos.ajustes();
    const r = Lector.leer(texto, { hoy, fecha: hoy, aprendidas: aj.aprendidas });
    if (!r.items.length) {
      return `No encontré ningún monto en «${texto.trim().slice(0, 200)}». Decime cuánto fue, por ejemplo: «gasté 3.500 en el colectivo».`;
    }
    const guardados = await datos.agregar(r.items, 'whatsapp');
    await datos.guardarUltimo(guardados);
    const l = [guardados.length === 1 ? 'Anoté 1 movimiento:' : `Anoté ${guardados.length} movimientos:`];
    for (const x of guardados) {
      const f = fechaCorta(x.fecha, hoy);
      l.push(`${x.tipo === 'ingreso' ? '➕' : '➖'} ${plata(x.monto, x.moneda)} · ${x.desc} (${nombre(x.cat)})${f === 'hoy' ? '' : ' · ' + f}`);
    }
    if (r.sinMonto.length) l.push('', `Sin monto, no lo anoté: ${r.sinMonto.map(s => '«' + s.trim() + '»').join(', ')}.`);
    // Alertas de presupuesto de las categorías que se tocaron, mes por mes.
    const tocadas = {};
    for (const x of guardados) if (x.tipo === 'gasto' && x.moneda !== 'USD') (tocadas[x.fecha.slice(0, 7)] = tocadas[x.fecha.slice(0, 7)] || new Set()).add(x.cat);
    const alertas = [];
    for (const [mes, cats] of Object.entries(tocadas)) {
      if (![...cats].some(c => aj.presupuestos[c])) continue;
      const est = Presupuesto.estado(await datos.itemsMes(mes), aj.presupuestos);
      for (const f of est.alertas) if (cats.has(f.cat)) alertas.push(lineaAlerta(f));
    }
    if (alertas.length) l.push('', ...alertas);
    l.push('', '¿Algo mal? Escribí *deshacer*.' + pie);
    return l.join('\n');
  }

  // Punto de entrada: devuelve el texto a responder.
  return async function atender(texto) {
    const t = String(texto || '').trim();
    const n = Lector.norm(t).replace(/[¿?¡!.]/g, '').trim();
    if (!n || /^(hola|ayuda|help|menu|comandos|que podes hacer|como funciona)$/.test(n)) return AYUDA;
    if (/^(resumen|saldo|como voy|como vengo|cuanto gaste|cuanto llevo|estado|balance)( del mes| este mes)?$/.test(n)) return resumen();
    if (/^(deshacer|borrar lo ultimo|borra lo ultimo|borrar ultimo|me equivoque|anular)$/.test(n)) {
      const k = await datos.deshacerUltimo();
      return k ? `Listo, borré ${k === 1 ? 'el último movimiento' : `los últimos ${k} movimientos`}.` : 'No tengo nada reciente para deshacer.';
    }
    const mp = n.match(/^(?:presupuestos?|tope|topes|limite)\b(.*)$/);
    if (mp) return presupuesto(t.slice(t.length - mp[1].length));
    return anotar(t);
  };
}

module.exports = { crearBot, AYUDA };
