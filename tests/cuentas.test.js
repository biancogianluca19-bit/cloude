// Pruebas de cuentas y separación de datos, con Redis en memoria.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const redis = require('./redis-memoria').crear();
require.cache[path.join(__dirname, '..', 'lib', 'redis.js')] = { exports: redis, loaded: true, id: 'redis' };
process.env.AUTH_SECRET = 'secreto-de-prueba';
const cuentas = require('../lib/cuentas');
const { datosDe } = require('../lib/datos');

test('registrar, entrar y validar la sesión', async () => {
  const s = await cuentas.registrar('Gianluca', 'clave123', 'Gianluca');
  assert.strictEqual(s.usuario, 'gianluca');
  assert.deepStrictEqual(await cuentas.usuarioDeToken(s.token), { usuario: 'gianluca', nombre: 'Gianluca' });
  await assert.rejects(cuentas.registrar('gianluca', 'otraclave'), /ya existe/);
  await assert.rejects(cuentas.entrar('gianluca', 'mal'), /incorrectos/);
  const s2 = await cuentas.entrar('GIANLUCA', 'clave123');
  assert.ok(await cuentas.usuarioDeToken(s2.token));
  assert.strictEqual(await cuentas.usuarioDeToken(s2.token.slice(0, -2) + 'xx'), null);
  await assert.rejects(cuentas.registrar('a b', 'clave123'), /entre 3 y 20/);
  await assert.rejects(cuentas.registrar('pedro', '123'), /al menos 6/);
});

test('cada cuenta ve solo sus movimientos', async () => {
  await cuentas.registrar('amigo', 'clave456');
  await datosDe('gianluca').agregar([{ tipo: 'gasto', monto: 5000, cat: 'super', desc: 'Súper', fecha: '2026-09-23' }], 'web');
  await datosDe('amigo').agregar([{ tipo: 'gasto', monto: 900, cat: 'kiosco', desc: 'Alfajor', fecha: '2026-09-23' }], 'web');
  assert.deepStrictEqual((await datosDe('gianluca').itemsMes('2026-09')).map(x => x.monto), [5000]);
  assert.deepStrictEqual((await datosDe('amigo').itemsMes('2026-09')).map(x => x.monto), [900]);
  await datosDe('amigo').fijarPresupuestos({ super: 100000 });
  assert.deepStrictEqual((await datosDe('gianluca').ajustes()).presupuestos, {});
});

test('cambiar la contraseña cierra las sesiones viejas', async () => {
  const vieja = await cuentas.entrar('amigo', 'clave456');
  const nueva = await cuentas.cambiarContrasena('amigo', 'clave456', 'nueva789');
  assert.strictEqual(await cuentas.usuarioDeToken(vieja.token), null);
  assert.ok(await cuentas.usuarioDeToken(nueva.token));
  await assert.rejects(cuentas.entrar('amigo', 'clave456'), /incorrectos/);
});

test('vincular Telegram con un código de un solo uso', async () => {
  const codigo = await cuentas.codigoTelegram('amigo');
  assert.strictEqual(await cuentas.vincularChat(codigo, '555'), 'amigo');
  assert.strictEqual(await cuentas.usuarioDeChat('555'), 'amigo');
  assert.strictEqual(await cuentas.vincularChat(codigo, '666'), null);
  assert.strictEqual(await cuentas.usuarioDeChat('666'), null);
});

test('los datos de antes de las cuentas pasan una sola vez', async () => {
  redis.db.set('libreta:mes:2026-08', { a1: JSON.stringify({ id: 'a1', tipo: 'gasto', monto: 1, cat: 'otros', desc: 'x', fecha: '2026-08-01', creado: 1 }) });
  redis.db.set('libreta:presupuestos', { super: '200000' });
  redis.db.set('libreta:telegram:chats', new Set(['777']));
  assert.strictEqual(await cuentas.hayDatosViejos(), true);
  const r = await cuentas.traspasarDatosViejos('gianluca');
  assert.deepStrictEqual(r, { meses: 1, chats: 1 });
  assert.strictEqual((await datosDe('gianluca').itemsMes('2026-08')).length, 1);
  assert.deepStrictEqual((await datosDe('gianluca').ajustes()).presupuestos, { super: 200000 });
  assert.strictEqual(await cuentas.usuarioDeChat('777'), 'gianluca');
  assert.strictEqual(await cuentas.hayDatosViejos(), false);
  await assert.rejects(cuentas.traspasarDatosViejos('amigo'), /ya se pasaron/);
});
