// Pruebas del bot de WhatsApp con una base de datos en memoria.
const test = require('node:test');
const assert = require('node:assert');
const { crearBot } = require('../lib/bot');

function baseEnMemoria() {
  const meses = {}, presupuestos = {}, aprendidas = {};
  let ultimo = [];
  let n = 0;
  return {
    meses, presupuestos,
    async itemsMes(mes) { return (meses[mes] || []).slice(); },
    async ajustes() { return { aprendidas: { ...aprendidas }, presupuestos: { ...presupuestos } }; },
    async agregar(items, origen) {
      const g = items.map(x => ({ ...x, id: 'id' + (++n), creado: n, origen }));
      for (const x of g) (meses[x.fecha.slice(0, 7)] = meses[x.fecha.slice(0, 7)] || []).push(x);
      return g;
    },
    async guardarUltimo(items) { ultimo = items; },
    async deshacerUltimo() {
      for (const x of ultimo) { const k = x.fecha.slice(0, 7); meses[k] = meses[k].filter(y => y.id !== x.id); }
      const k = ultimo.length; ultimo = []; return k;
    },
    async fijarPresupuestos(m) { for (const [c, v] of Object.entries(m)) { if (v > 0) presupuestos[c] = v; else delete presupuestos[c]; } },
  };
}

const HOY = '2026-09-24';

test('anota movimientos y responde con el detalle', async () => {
  const db = baseEnMemoria();
  const bot = crearBot({ datos: db, hoy: HOY });
  const r = await bot('Gasté 4.500 en el súper y 12 mil de nafta. Me pagaron 150 lucas de un freelance.');
  assert.match(r, /Anoté 3 movimientos/);
  assert.match(r, /➖ \$\s?4\.500 · Súper \(Supermercado\)/);
  assert.match(r, /➕ \$\s?150\.000/);
  assert.strictEqual(db.meses['2026-09'].length, 3);
  assert.strictEqual(db.meses['2026-09'][0].origen, 'whatsapp');
});

test('fija un presupuesto y avisa al acercarse y al pasarse', async () => {
  const db = baseEnMemoria();
  const bot = crearBot({ datos: db, hoy: HOY });
  const r1 = await bot('presupuesto súper 200 mil');
  assert.match(r1, /Supermercado tiene un tope de \$\s?200\.000/);
  assert.strictEqual(db.presupuestos.super, 200000);
  const r2 = await bot('gasté 170 mil en el súper');
  assert.match(r2, /⚠️ Supermercado: llevás \$\s?170\.000 de \$\s?200\.000 \(85%\)/);
  const r3 = await bot('gasté 40 mil en el chino');
  assert.match(r3, /te pasaste por \$\s?10\.000/);
  const r4 = await bot('gasté 3000 de nafta');
  assert.doesNotMatch(r4, /⚠️/);
});

test('presupuesto por nombre de categoría y para sacarlo', async () => {
  const db = baseEnMemoria();
  const bot = crearBot({ datos: db, hoy: HOY });
  await bot('presupuesto transporte 60000');
  assert.strictEqual(db.presupuestos.transporte, 60000);
  await bot('presupuesto salidas 50 lucas');
  assert.strictEqual(db.presupuestos.ocio, 50000);
  const r = await bot('presupuesto transporte 0');
  assert.match(r, /saqué el tope de Transporte/);
  assert.strictEqual(db.presupuestos.transporte, undefined);
  const lista = await bot('presupuesto');
  assert.match(lista, /Salidas y ocio: \$\s?0 de \$\s?50\.000/);
});

test('resumen y deshacer', async () => {
  const db = baseEnMemoria();
  const bot = crearBot({ datos: db, hoy: HOY });
  await bot('cobré el sueldo 900000');
  await bot('pagué el alquiler 300000 y la luz 40000');
  const res = await bot('¿Cómo voy?');
  assert.match(res, /septiembre 2026/);
  assert.match(res, /Saldo: \$\s?560\.000/);
  const d = await bot('deshacer');
  assert.match(d, /los últimos 2 movimientos/);
  assert.strictEqual(db.meses['2026-09'].length, 1);
});

test('mensaje sin monto y ayuda', async () => {
  const bot = crearBot({ datos: baseEnMemoria(), hoy: HOY });
  assert.match(await bot('fui al cine'), /No encontré ningún monto/);
  assert.match(await bot('hola'), /Mandame un audio/);
});

test('el origen del movimiento se guarda', async () => {
  const db = baseEnMemoria();
  const bot = crearBot({ datos: db, hoy: HOY, origen: 'telegram' });
  await bot('gasté 3000 de nafta');
  assert.strictEqual(db.meses['2026-09'][0].origen, 'telegram');
});
