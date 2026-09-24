// Movimientos, palabras aprendidas y presupuestos guardados en Redis.
//   libreta:mes:AAAA-MM      hash  id -> movimiento (JSON)
//   libreta:aprendidas       hash  palabra -> categoría
//   libreta:presupuestos     hash  categoría -> tope mensual en pesos
//   libreta:ultimo           JSON  último lote cargado por WhatsApp (para "deshacer")
//   libreta:msg:<id>         marca de mensaje de WhatsApp ya procesado
const { cmd, pipeline } = require('./redis');
const Lector = require('../public/lector.js');

const P = 'libreta:';
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const mesDe = f => f.slice(0, 7);
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Devuelve un movimiento válido o null.
function limpiar(x, origen) {
  if (!x || typeof x !== 'object') return null;
  const tipo = x.tipo === 'ingreso' ? 'ingreso' : 'gasto';
  const monto = Math.round(Number(x.monto) * 100) / 100;
  if (!(monto > 0) || monto > 1e12) return null;
  if (!RE_FECHA.test(String(x.fecha))) return null;
  const c = Lector.POR_ID[x.cat];
  const cat = c && c.tipo === tipo ? x.cat : Lector.OTROS[tipo];
  const id = typeof x.id === 'string' && /^[a-z0-9]{6,24}$/.test(x.id) ? x.id : nuevoId();
  return {
    id, tipo, monto,
    moneda: x.moneda === 'USD' ? 'USD' : 'ARS',
    cat,
    desc: String(x.desc || Lector.POR_ID[cat].nombre).trim().slice(0, 80) || Lector.POR_ID[cat].nombre,
    fecha: x.fecha,
    creado: Number(x.creado) > 0 ? Number(x.creado) : Date.now(),
    origen: x.origen || origen || 'web',
  };
}

async function itemsMes(mes) {
  if (!RE_MES.test(mes)) throw new Error('Mes inválido');
  const r = (await cmd('HGETALL', P + 'mes:' + mes)) || [];
  const items = [];
  for (let i = 0; i < r.length; i += 2) {
    try { items.push(JSON.parse(r[i + 1])); } catch (e) { /* entrada dañada: se ignora */ }
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado - b.creado);
}

async function agregar(lista, origen) {
  const ahora = Date.now();
  const items = lista.map((x, i) => limpiar({ ...x, creado: x.creado || ahora + i }, origen)).filter(Boolean);
  const porMes = {};
  for (const x of items) (porMes[mesDe(x.fecha)] = porMes[mesDe(x.fecha)] || []).push(x);
  await pipeline(Object.entries(porMes).map(([mes, xs]) => ['HSET', P + 'mes:' + mes, ...xs.flatMap(x => [x.id, JSON.stringify(x)])]));
  return items;
}

async function actualizar(x, mesAnterior) {
  const item = limpiar(x);
  if (!item) return null;
  const cmds = [];
  if (RE_MES.test(mesAnterior || '') && mesAnterior !== mesDe(item.fecha)) cmds.push(['HDEL', P + 'mes:' + mesAnterior, item.id]);
  cmds.push(['HSET', P + 'mes:' + mesDe(item.fecha), item.id, JSON.stringify(item)]);
  await pipeline(cmds);
  return item;
}

async function borrar(id, mes) {
  if (!RE_MES.test(mes)) throw new Error('Mes inválido');
  return cmd('HDEL', P + 'mes:' + mes, String(id));
}

async function ajustes() {
  const [a, p] = await pipeline([['HGETALL', P + 'aprendidas'], ['HGETALL', P + 'presupuestos']]);
  const aprendidas = {}, presupuestos = {};
  for (let i = 0; i < (a || []).length; i += 2) aprendidas[a[i]] = a[i + 1];
  for (let i = 0; i < (p || []).length; i += 2) { const v = Number(p[i + 1]); if (v > 0) presupuestos[p[i]] = v; }
  return { aprendidas, presupuestos };
}

async function aprender(mapa) {
  const pares = Object.entries(mapa || {}).filter(([w, c]) => /^[a-z0-9]{3,40}$/.test(w) && Lector.POR_ID[c]).slice(0, 50);
  if (pares.length) await cmd('HSET', P + 'aprendidas', ...pares.flat());
}

async function olvidar() {
  await cmd('DEL', P + 'aprendidas');
}

async function fijarPresupuestos(mapa) {
  const cmds = [];
  for (const [cat, v] of Object.entries(mapa || {})) {
    const c = Lector.POR_ID[cat];
    if (!c || c.tipo !== 'gasto') continue;
    const n = Math.round(Number(v));
    cmds.push(n > 0 ? ['HSET', P + 'presupuestos', cat, String(n)] : ['HDEL', P + 'presupuestos', cat]);
  }
  await pipeline(cmds);
}

// true si el mensaje es nuevo; false si WhatsApp lo está reenviando.
async function marcarMensaje(id) {
  return (await cmd('SET', P + 'msg:' + id, '1', 'NX', 'EX', '172800')) === 'OK';
}

async function guardarUltimo(items) {
  await cmd('SET', P + 'ultimo', JSON.stringify(items.map(x => ({ id: x.id, mes: mesDe(x.fecha) }))), 'EX', '604800');
}

async function deshacerUltimo() {
  const r = await cmd('GET', P + 'ultimo');
  if (!r) return 0;
  const lote = JSON.parse(r);
  await pipeline([...lote.map(x => ['HDEL', P + 'mes:' + x.mes, x.id]), ['DEL', P + 'ultimo']]);
  return lote.length;
}

module.exports = { limpiar, itemsMes, agregar, actualizar, borrar, ajustes, aprender, olvidar, fijarPresupuestos, marcarMensaje, guardarUltimo, deshacerUltimo, mesDe };

// Chats de Telegram vinculados con la libreta.
async function chatsTelegram() {
  return (await cmd('SMEMBERS', P + 'telegram:chats')) || [];
}
async function vincularTelegram(chatId) {
  await cmd('SADD', P + 'telegram:chats', String(chatId));
}
module.exports.chatsTelegram = chatsTelegram;
module.exports.vincularTelegram = vincularTelegram;
