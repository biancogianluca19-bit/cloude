// Pruebas del lector local de movimientos. Correr con: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const Lector = require('../public/lector.js');

const HOY = '2026-09-23'; // miércoles
const leer = (t, o = {}) => Lector.leer(t, { hoy: HOY, fecha: HOY, ...o });
const resumen = r => r.items.map(x => [x.tipo, x.monto, x.moneda, x.cat, x.desc, x.fecha]);

test('dictado típico con varios movimientos', () => {
  const r = leer('Hoy gasté 4.500 en el súper, 12 mil de nafta y un café de 2800. Me pagaron 150 lucas de un trabajo freelance. Ayer pagué la luz, 38.000 pesos.');
  assert.deepStrictEqual(resumen(r), [
    ['gasto', 4500, 'ARS', 'super', 'Súper', HOY],
    ['gasto', 12000, 'ARS', 'transporte', 'Nafta', HOY],
    ['gasto', 2800, 'ARS', 'comida', 'Café', HOY],
    ['ingreso', 150000, 'ARS', 'trabajo', 'Trabajo freelance', HOY],
    ['gasto', 38000, 'ARS', 'hogar', 'Luz', '2026-09-22'],
  ]);
});

test('números en palabras', () => {
  const r = leer('gasté quince mil quinientos en la farmacia y dos mil en el kiosco');
  assert.deepStrictEqual(resumen(r), [
    ['gasto', 15500, 'ARS', 'salud', 'Farmacia', HOY],
    ['gasto', 2000, 'ARS', 'kiosco', 'Kiosco', HOY],
  ]);
});

test('lucas, palos y dólares', () => {
  const r = leer('cobré un palo de sueldo, compré 2 lucas de pan y vendí la bici por 300 dólares');
  assert.deepStrictEqual(resumen(r), [
    ['ingreso', 1000000, 'ARS', 'sueldo', 'Sueldo', HOY],
    ['gasto', 2000, 'ARS', 'super', 'Pan', HOY],
    ['ingreso', 300, 'USD', 'ventas', 'Bici', HOY],
  ]);
});

test('cantidades chicas no son montos', () => {
  const r = leer('2 cafés 5600');
  assert.deepStrictEqual(resumen(r), [['gasto', 5600, 'ARS', 'comida', '2 cafés', HOY]]);
});

test('varios montos sin conectores', () => {
  const r = leer('gasté 2000 en super 3000 en nafta');
  assert.deepStrictEqual(r.items.map(x => [x.monto, x.cat]), [[2000, 'super'], [3000, 'transporte']]);
  const r2 = leer('uber 3500 netflix 8999');
  assert.deepStrictEqual(r2.items.map(x => [x.monto, x.cat]), [[3500, 'transporte'], [8999, 'suscripciones']]);
});

test('el tipo se hereda del verbo anterior', () => {
  const r = leer('me pagaron 50000 de un cliente y 20000 de otro cliente');
  assert.deepStrictEqual(r.items.map(x => [x.tipo, x.monto, x.cat]), [['ingreso', 50000, 'trabajo'], ['ingreso', 20000, 'trabajo']]);
});

test('fechas relativas', () => {
  const r = leer('anteayer 3000 de colectivo. el lunes pagué el gimnasio 25000. el 15 de septiembre cobré el sueldo 900000');
  assert.deepStrictEqual(r.items.map(x => [x.fecha, x.monto, x.cat]), [
    ['2026-09-21', 3000, 'transporte'],
    ['2026-09-21', 25000, 'salud'],
    ['2026-09-15', 900000, 'sueldo'],
  ]);
});

test('texto sin monto queda avisado', () => {
  const r = leer('fui al cine');
  assert.strictEqual(r.items.length, 0);
  assert.deepStrictEqual(r.sinMonto, ['fui al cine']);
});

test('decimales y formatos de monto', () => {
  assert.deepStrictEqual(leer('nafta $ 45.300').items.map(x => x.monto), [45300]);
  assert.deepStrictEqual(leer('1,5 lucas de helado').items.map(x => x.monto), [1500]);
  assert.deepStrictEqual(leer('café 2500,50').items.map(x => x.monto), [2500.5]);
  assert.deepStrictEqual(leer('pagué 5k de uber').items.map(x => x.monto), [5000]);
});

test('palabras aprendidas ganan', () => {
  const r = leer('gasté 9000 en la verdulería', { aprendidas: {} });
  assert.strictEqual(r.items[0].cat, 'super');
  const r2 = leer('pagué 12000 a Rosa', { aprendidas: { rosa: 'hogar' } });
  assert.strictEqual(r2.items[0].cat, 'hogar');
});
