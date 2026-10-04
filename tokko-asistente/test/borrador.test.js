import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cargarConfig } from '../src/config.js';
import { crearRepositorio } from '../src/repositorio.js';
import { analizarConsulta } from '../src/analizar.js';

const datosArchivo = JSON.parse(fs.readFileSync(new URL('../datos-inmobiliaria.json', import.meta.url), 'utf8'));
const config = cargarConfig({ rutaEnv: '/no-existe', entorno: {} });
const repo = crearRepositorio({ config });
await repo.iniciar();

const analizar = (texto, { datos = datosArchivo, propiedadId = null } = {}) =>
  analizarConsulta({ entrada: { texto }, propiedadId, repo, datos, config, registrar: false });

const ADJETIVOS = /(incre[ií]ble|espectacular|oportunidad|hermos|impecable|excelente|[uú]nic[ao]|divin|so[ñn]ad|lujos|maravill)/i;

test('borrador: responde con datos de la ficha, en voseo, con próximo paso y firma', async () => {
  const r = await analizar('Hola, la EJ-106 cuantos dormitorios tiene? tiene pileta?');
  assert.equal(r.derivacion.derivar, false);
  const t = r.borrador.texto;
  assert.match(t, /Tiene 4 dormitorios\./);
  assert.match(t, /Según la ficha, tiene pileta\./);
  assert.match(t, /Si querés conocerla, coordinamos una visita\./);
  assert.match(t, /Gianluca \| Gazda Rossi Propiedades$/);
  assert.deepEqual(r.borrador.aConfirmar, []);
});

test('borrador: cada dato faltante va como [A CONFIRMAR] en el texto y en la lista', async () => {
  const r = await analizar('Hola cuanto sale el alquiler del depto EJ-104? tiene cochera? cuantos metros?');
  const t = r.borrador.texto;
  assert.match(t, /\[A CONFIRMAR: precio\]/);
  assert.match(t, /\[A CONFIRMAR: si tiene cochera y cuántas\]/);
  assert.match(t, /48 m² cubiertos/);
  assert.deepEqual(r.borrador.aConfirmar.map((a) => a.clave).sort(), ['cocheras', 'precio']);
  const marcadores = t.match(/\[A CONFIRMAR: [^\]]+\]/g);
  assert.equal(marcadores.length, r.borrador.aConfirmar.length, 'misma cantidad en el texto y en la lista');
  assert.ok(!/USD|ARS/.test(t), 'no aparece ningún precio inventado');
});

test('borrador: no copia adjetivos de la descripción ni del título', async () => {
  const r = await analizar('Nombre: Martina Ejemplo\nMensaje: me interesa la EJ-101, me pasas info?');
  assert.ok(!ADJETIVOS.test(r.borrador.texto), r.borrador.texto);
  assert.ok(!r.borrador.texto.includes('EJEMPLO - Casa'), 'no usa el título de la publicación');
});

test('borrador: requisitos de alquiler muestran el aviso de verificar importes', async () => {
  const r = await analizar('que requisitos piden para la EJ-107?');
  assert.match(r.borrador.texto, /Honorarios: 4,15% \+ IVA sobre el total de 24 meses/);
  assert.ok(r.borrador.avisos.some((a) => a.startsWith('VERIFICAR IMPORTES ANTES DE ENVIAR')));
  const venta = await analizar('que requisitos piden para la EJ-101?');
  assert.ok(!venta.borrador.avisos.some((a) => a.startsWith('VERIFICAR IMPORTES')), 'una venta no usa los requisitos de alquiler');
  assert.match(venta.borrador.texto, /\[A CONFIRMAR: condiciones y honorarios de la venta\]/);
});

test('borrador: sin horarios cargados pregunta qué día le queda cómodo y no propone horarios', async () => {
  const r = await analizar('se puede visitar la EJ-106?');
  assert.match(r.borrador.texto, /¿qué día y horario te quedan cómodos\?/);
  const propone = await analizar('puedo ir a ver la EJ-106 el sabado a las 11?');
  assert.match(propone.borrador.texto, /\[A CONFIRMAR: si se puede el día u horario que propone el cliente\]/);
  const conHorarios = await analizar('se puede visitar la EJ-106?', { datos: { ...datosArchivo, visitas: { horarios: ['lunes a viernes de 10 a 17'] } } });
  assert.match(conHorarios.borrador.texto, /los horarios son lunes a viernes de 10 a 17/);
});

test('borrador: disponibilidad y precio se atribuyen a la ficha y piden confirmación', async () => {
  const r = await analizar('la EJ-103 sigue disponible? precio?');
  assert.match(r.borrador.texto, /Por lo que figura en nuestra ficha, está disponible\./);
  assert.match(r.borrador.texto, /El valor publicado es USD 48\.000\./);
  assert.ok(r.borrador.avisos.some((a) => a.startsWith('El precio y la disponibilidad salen de Tokko')));
});

test('borrador: dirección exacta solo fuera de barrios cerrados', async () => {
  const cerrado = await analizar('donde queda la EJ-101?');
  assert.match(cerrado.borrador.texto, /Está en Santa Juana, Canning\. La dirección exacta te la pasamos al coordinar la visita\./);
  const abierto = await analizar('donde queda el depto EJ-104?');
  assert.match(abierto.borrador.texto, /La dirección es Calle Ejemplo 123\./);
  const nunca = await analizar('donde queda el depto EJ-104?', { datos: { ...datosArchivo, privacidad: { direccionExacta: 'nunca' } } });
  assert.ok(!nunca.borrador.texto.includes('Calle Ejemplo 123'));
});

test('borrador: saludo y emoji salen de datos-inmobiliaria.json', async () => {
  const r = await analizar('[4/10/26, 10:15] Ramiro Ejemplo: la EJ-106 tiene pileta?');
  assert.ok(r.borrador.texto.startsWith('Hola Ramiro! 👋'));
  const sinEmoji = await analizar('la EJ-106 tiene pileta?', { datos: { ...datosArchivo, tono: { saludoSinNombre: 'Hola, ¿cómo estás?', usarEmojis: false } } });
  assert.ok(sinEmoji.borrador.texto.startsWith('Hola, ¿cómo estás?\n'));
});

test('borrador: una pregunta que no reconoce queda como A CONFIRMAR', async () => {
  const r = await analizar('la EJ-101 tiene quincho? y el colegio mas cercano cual es?');
  assert.match(r.borrador.texto, /\[A CONFIRMAR: si tiene quincho\]/);
  assert.match(r.borrador.texto, /\[A CONFIRMAR: respuesta a «y el colegio mas cercano cual es\?»\]/);
});
