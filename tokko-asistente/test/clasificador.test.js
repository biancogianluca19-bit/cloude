import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificar } from '../src/clasificador.js';

const intenciones = (t) => clasificar(t).intenciones.sort();
const derivaciones = (t) => clasificar(t).derivaciones.sort();

test('clasificador: preguntas comunes, con y sin errores de ortografía', () => {
  const casos = [
    ['sigue disponible?', ['disponibilidad']],
    ['todavia la tienen?', ['disponibilidad']],
    ['q presio tiene?', ['precio']],
    ['cuanto sale el alquiler?', ['precio']],
    ['cuanto son las expensas?', ['expensas']],
    ['donde queda exactamente?', ['ubicacion']],
    ['cuantos ambientes tiene?', ['ambientes']],
    ['cuantas habitaciones?', ['dormitorios']],
    ['cuantos baños tiene', ['banos']],
    ['tiene cochera o garage?', ['cocheras']],
    ['cuantos metros cubiertos tiene?', ['superficie']],
    ['se puede ir a ver el sabado?', ['visita']],
    ['kiero bicitarla', ['visita']],
    ['que requisitos piden para alquilar?', ['requisitos_alquiler']],
    ['me pasas mas info?', ['info_general']],
  ];
  for (const [texto, esperado] of casos) assert.deepEqual(intenciones(texto), esperado, texto);
});

test('clasificador: características puntuales', () => {
  const c = clasificar('acepta mascotas? tengo un perro. tiene pileta? es apto credito?');
  assert.deepEqual(c.caracteristicas.map((x) => x.clave).sort(), ['apto_credito', 'mascotas', 'pileta']);
  assert.deepEqual(c.derivaciones, [], '"apto crédito" es una característica, no se deriva');
});

test('clasificador: temas que se derivan a una persona', () => {
  assert.deepEqual(derivaciones('la dejan en 350 mil dolares?'), ['negociacion']);
  assert.deepEqual(derivaciones('es negociable el precio?'), ['negociacion']);
  assert.deepEqual(derivaciones('aceptan 120000 usd?'), ['negociacion']);
  assert.deepEqual(derivaciones('quiero dejar una seña'), ['reserva']);
  assert.deepEqual(derivaciones('como hago para reservarla?'), ['reserva']);
  assert.deepEqual(derivaciones('tiene escritura? esta todo en regla?'), ['documentacion']);
  assert.deepEqual(derivaciones('se puede financiar en cuotas?'), ['financiacion']);
  assert.deepEqual(derivaciones('es apto credito? la quiero comprar con un credito del banco'), ['financiacion']);
  assert.deepEqual(derivaciones('nadie me contesta, es una verguenza'), ['reclamo']);
});

test('clasificador: lo que no debe derivarse', () => {
  assert.deepEqual(derivaciones('esta reservada?'), [], 'preguntar si está reservada es disponibilidad');
  assert.deepEqual(intenciones('esta reservada?'), ['disponibilidad']);
  assert.deepEqual(derivaciones('quiero reservar un turno para verla'), []);
  assert.deepEqual(derivaciones('acepta mascotas?'), []);
});

test('clasificador: guarda las preguntas que no reconoce', () => {
  const c = clasificar('tiene pileta? y el colegio mas cercano cual es?');
  assert.deepEqual(c.preguntasSinClasificar, ['y el colegio mas cercano cual es?']);
});
