import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parsearConsulta, extraerTelefonos, extraerCodigos, detectarZonas } from '../src/parser.js';
import { zonasDe } from '../src/analizar.js';

const datos = JSON.parse(fs.readFileSync(new URL('../datos-inmobiliaria.json', import.meta.url), 'utf8'));
const zonas = zonasDe(datos);
const parsear = (texto) => parsearConsulta({ texto }, { zonas });

test('parser: mail con etiquetas separa contacto, propiedad y mensaje', () => {
  const p = parsear('Nombre: Martina Ejemplo\nEmail: Martina@Example.com\nTeléfono: +54 9 11 0000-1111\nPropiedad: EJEMPLO - Casa en Santa Juana (EJ-101)\nMensaje: Hola, sigue disponible?\nGracias');
  assert.equal(p.nombre, 'Martina Ejemplo');
  assert.deepEqual(p.emails, ['martina@example.com']);
  assert.deepEqual(p.telefonos, ['+54 9 11 0000-1111']);
  assert.equal(p.mensaje, 'Hola, sigue disponible?\nGracias');
  assert.equal(p.textoPropiedad, 'EJEMPLO - Casa en Santa Juana (EJ-101)');
  assert.deepEqual(p.referencias.codigos, ['EJ-101']);
  assert.deepEqual(p.referencias.zonas.map((z) => z.nombre), ['Santa Juana']);
});

test('parser: chat de WhatsApp toma el autor como nombre o como teléfono', () => {
  const conNombre = parsear('[4/10/26, 10:15] Ramiro Ejemplo: Hola! la casa de alquiler en canning chico');
  assert.equal(conNombre.nombre, 'Ramiro Ejemplo');
  assert.equal(conNombre.mensaje, 'Hola! la casa de alquiler en canning chico');
  const conNumero = parsear('[4/10/26, 18:02] +54 9 11 0000-2222: Hola!');
  assert.equal(conNumero.nombre, null);
  assert.deepEqual(conNumero.telefonos, ['+54 9 11 0000-2222']);
});

test('parser: teléfonos argentinos sí, montos y medidas no', () => {
  assert.deepEqual(extraerTelefonos('llamame al 11 0000 3333 o al 011-15-0000-4444'), ['11 0000 3333', '011-15-0000-4444']);
  assert.deepEqual(extraerTelefonos('ofrezco USD 120000000 o $ 1.200.000, son 1000 m2'), []);
  assert.deepEqual(extraerTelefonos('tiene 25000000 metros'), []);
});

test('parser: códigos de referencia, IDs en URL y nombre por presentación', () => {
  assert.deepEqual(extraerCodigos('la ref EJ-106 o la ref ej 107, cód: GR999'), ['EJ-106', 'ej 107', 'GR999']);
  assert.deepEqual(extraerCodigos('tengo 2 hijos y 1 perro'), []);
  assert.deepEqual(extraerCodigos('USD 150000 y 1000 M2'), []);
  const p = parsear('Hola! https://www.example.com/propiedad/900003-lote-venta-el-rodal. Soy Lucía');
  assert.deepEqual(p.referencias.urls, ['https://www.example.com/propiedad/900003-lote-venta-el-rodal']);
  assert.deepEqual(p.referencias.ids, ['900003']);
  assert.equal(p.nombre, 'Lucía');
});

test('parser: mala ortografía detecta tipo, operación y barrio', () => {
  const p = parsear('ola kiero saver el presio del lote en el rodal y cuantos metros tiene');
  assert.deepEqual(p.referencias.tipos, ['Terreno']);
  assert.deepEqual(p.referencias.zonas.map((z) => z.nombre), ['El Rodal']);
  const q = parsear('busco depto p alquilar en sta ines');
  assert.deepEqual(q.referencias.tipos, ['Departamento']);
  assert.deepEqual(q.referencias.operaciones, ['Alquiler']);
  assert.deepEqual(q.referencias.zonas.map((z) => z.nombre), ['Santa Inés']);
});

test('parser: Canning y Canning Chico nunca se mezclan', () => {
  assert.deepEqual(detectarZonas('casa en Canning Chico', zonas).zonas.map((z) => z.nombre), ['Canning Chico']);
  assert.deepEqual(detectarZonas('casa en Canning', zonas).zonas.map((z) => z.nombre), ['Canning']);
  assert.deepEqual(detectarZonas('una en canning chico y otra en canning', zonas).zonas.map((z) => z.nombre).sort(), ['Canning', 'Canning Chico']);
  // "Fincas de San Vicente" no cuenta como "San Vicente".
  assert.deepEqual(detectarZonas('lote en fincas de san vicente', zonas).zonas.map((z) => z.nombre), ['Fincas de San Vicente']);
  // "Adrogué Chico" es otro barrio en Tokko: no cuenta como Adrogué.
  const adrogue = detectarZonas('casa en Adrogué Chico', zonas);
  assert.deepEqual(adrogue.zonas, []);
  assert.deepEqual(adrogue.desconocidas, ['adrogue chico']);
});

test('parser: carga manual usa los campos tal cual', () => {
  const p = parsearConsulta({ nombre: 'Pedro Ejemplo', telefono: '11 0000 5555', email: 'pedro@example.com', propiedad: 'EJ-106', mensaje: 'tiene pileta?' }, { zonas });
  assert.equal(p.nombre, 'Pedro Ejemplo');
  assert.deepEqual(p.telefonos, ['11 0000 5555']);
  assert.deepEqual(p.emails, ['pedro@example.com']);
  assert.equal(p.mensaje, 'tiene pileta?');
  assert.deepEqual(p.referencias.codigos, ['EJ-106']);
});
