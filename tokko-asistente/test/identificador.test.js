import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsearConsulta } from '../src/parser.js';
import { identificarPropiedad } from '../src/identificador.js';
import { normalizarListado } from '../src/normalizador.js';
import { zonasDe } from '../src/analizar.js';

const datos = JSON.parse(fs.readFileSync(new URL('../datos-inmobiliaria.json', import.meta.url), 'utf8'));
const fichas = normalizarListado(JSON.parse(fs.readFileSync(new URL('../fixtures/propiedades-ejemplo.json', import.meta.url), 'utf8')));
const identificar = (texto) => identificarPropiedad(parsearConsulta({ texto }, { zonas: zonasDe(datos) }), fichas);

test('identificador: por código, por ID y por URL', () => {
  assert.equal(identificar('Hola, la EJ-103 cuanto mide?').propiedad.id, 900003);
  assert.equal(identificar('ID: 900006').propiedad.codigo, 'EJ-106');
  const porUrl = identificar('vi esto https://www.example.com/propiedad/900003-lote-venta-el-rodal?utm=wsp');
  assert.equal(porUrl.estado, 'identificada');
  assert.equal(porUrl.propiedad.codigo, 'EJ-103');
});

test('identificador: por dirección', () => {
  const r = identificar('Hola, el depto de calle ejemplo 123 sigue?');
  assert.equal(r.estado, 'identificada');
  assert.equal(r.propiedad.codigo, 'EJ-104');
});

test('identificador: solo barrio + tipo + operación -> candidatos para elegir', () => {
  const r = identificar('vi la casa de alquiler en canning chico');
  assert.equal(r.estado, 'candidatos');
  assert.deepEqual(r.candidatos.map((c) => c.codigo), ['EJ-102']);
  const dos = identificar('la casa de santa juana');
  assert.equal(dos.estado, 'candidatos');
  assert.deepEqual(dos.candidatos.map((c) => c.codigo).sort(), ['EJ-101', 'EJ-107']);
});

test('identificador: "Canning" no trae la propiedad de Canning Chico', () => {
  const r = identificar('busco casa en alquiler en Canning');
  assert.ok(!r.candidatos.some((c) => c.codigo === 'EJ-102'), 'EJ-102 es de Canning Chico');
  assert.ok(r.candidatos.some((c) => c.codigo === 'EJ-107'), 'EJ-107 está en Santa Juana, dentro de Canning');
});

test('identificador: dos propiedades en el mismo mensaje -> varias', () => {
  assert.equal(identificar('me interesan la EJ-101 y la EJ-107').estado, 'varias');
  assert.equal(identificar('la EJ-101 y la GR-999').estado, 'varias');
  assert.equal(identificar('busco casa en santa juana o en el rodal').estado, 'varias');
});

test('identificador: código que no está publicado -> no_encontrada (nunca "no existe")', () => {
  const r = identificar('consulto por la ref GR-999');
  assert.equal(r.estado, 'no_encontrada');
  assert.deepEqual(r.referenciasNoEncontradas, ['código GR-999']);
  assert.equal(identificar('hola, info').estado, 'sin_referencia');
});
