// Un test por cada caso de derivación de la sección 2 del pedido.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cargarConfig } from '../src/config.js';
import { crearRepositorio } from '../src/repositorio.js';
import { analizarConsulta } from '../src/analizar.js';

const datos = JSON.parse(fs.readFileSync(new URL('../datos-inmobiliaria.json', import.meta.url), 'utf8'));
const config = cargarConfig({ rutaEnv: '/no-existe', entorno: {} });
const repo = crearRepositorio({ config });
await repo.iniciar();

async function derivada(texto, motivoEsperado, propiedadId = null) {
  const r = await analizarConsulta({ entrada: { texto }, propiedadId, repo, datos, config, registrar: false });
  assert.equal(r.derivacion.derivar, true, `debería derivar: ${texto}`);
  assert.ok(r.derivacion.motivos.some((m) => m.clave === motivoEsperado), `motivo ${motivoEsperado} en ${JSON.stringify(r.derivacion.motivos)}`);
  // El borrador solo acusa recibo: no da precios, datos ni horarios.
  const t = r.borrador.texto;
  assert.match(t, /lo está viendo un asesor|la está viendo un asesor/);
  assert.ok(!/USD|ARS|\[A CONFIRMAR|m²|dormitorio|disponible/i.test(t), `el acuse no debe dar datos: ${t}`);
  assert.deepEqual(r.borrador.aConfirmar, []);
  assert.match(r.borrador.notaInterna, /^DERIVAR A PERSONA\./);
  return r;
}

test('deriva: negociación de precio u oferta', async () => {
  await derivada('Hola, la casa de Terralagos ref EJ-106 la dejan en 350 mil dolares? tengo el efectivo', 'negociacion');
  await derivada('la EJ-101 es negociable? te ofrezco 250', 'negociacion');
});

test('deriva: reserva o seña', async () => {
  await derivada('Me encantó la EJ-107, quiero dejar una seña así no se la llevan', 'reserva');
});

test('deriva: documentación, escritura o legal', async () => {
  await derivada('La casa EJ-101 tiene escritura? esta todo en regla?', 'documentacion');
  await derivada('la EJ-105 esta en sucesion?', 'documentacion');
});

test('deriva: financiación o crédito', async () => {
  await derivada('Hola, la casa EJ-106 es apta crédito? se puede financiar una parte?', 'financiacion');
  await derivada('la EJ-101 la puedo pagar en cuotas?', 'financiacion');
});

test('deriva: reclamo (sin "¿cómo estás?" ni emoji)', async () => {
  const r = await derivada('Hace una semana que nadie me contesta por la EJ-101, es una verguenza', 'reclamo');
  assert.ok(r.borrador.texto.startsWith('Hola.\n'));
});

test('deriva: propiedad no disponible según la ficha', async () => {
  const r = await derivada('[4/10/26, 18:02] +54 9 11 0000-2222: Hola! la casa de monte grande ref EJ-105 esta disponible?', 'no_disponible');
  assert.match(r.derivacion.motivos.find((m) => m.clave === 'no_disponible').detalle, /Reservada/);
});

test('deriva: propiedad no encontrada, con el texto "revisar en Tokko" y nunca "no existe"', async () => {
  const r = await derivada('Hola, consulto por la propiedad ref GR-999, sigue en venta?', 'no_encontrada');
  const detalle = r.derivacion.motivos.find((m) => m.clave === 'no_encontrada').detalle;
  assert.match(detalle, /revisar en Tokko/);
  assert.ok(!/no existe/i.test(detalle + r.borrador.texto));
});

test('deriva: mensaje ambiguo (sin propiedad, sin pregunta o con candidatos sin elegir)', async () => {
  await derivada('info', 'ambiguo');
  await derivada('Hola', 'ambiguo');
  await derivada('vi la casa de alquiler en canning chico, acepta mascotas?', 'ambiguo');
  await derivada('Hola, te escribo por la EJ-101', 'ambiguo');
});

test('deriva: más de una propiedad', async () => {
  await derivada('Buenas, me interesan la EJ-101 y la EJ-107, cual tiene mas metros?', 'varias_propiedades');
  await derivada('busco casa en santa juana o el rodal, que tienen?', 'varias_propiedades');
});

test('no deriva: al elegir la candidata a mano se arma la respuesta', async () => {
  const r = await analizarConsulta({ entrada: { texto: 'vi la casa de alquiler en canning chico, acepta mascotas?' }, propiedadId: 900002, repo, datos, config, registrar: false });
  assert.equal(r.derivacion.derivar, false);
  assert.match(r.borrador.texto, /Según la ficha, acepta mascotas\./);
});
