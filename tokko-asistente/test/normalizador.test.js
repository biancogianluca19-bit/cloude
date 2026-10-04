import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizarPropiedad, normalizarListado, numeroPositivo } from '../src/normalizador.js';

const fixture = JSON.parse(fs.readFileSync(new URL('../fixtures/propiedades-ejemplo.json', import.meta.url), 'utf8'));
const raw = (id) => fixture.objects.find((o) => o.id === id);

test('normalizador: arma la ficha con los campos de la propiedad EJEMPLO EJ-101', () => {
  const f = normalizarPropiedad(raw(900001));
  assert.equal(f.id, 900001);
  assert.equal(f.codigo, 'EJ-101');
  assert.equal(f.tipo, 'Casa');
  assert.deepEqual(f.operaciones, [{ tipo: 'Venta', precios: [{ moneda: 'USD', monto: 285000, periodo: 0 }] }]);
  assert.equal(f.ambientes, 5);
  assert.equal(f.dormitorios, 3);
  assert.equal(f.banos, 2);
  assert.equal(f.toilettes, 1);
  assert.equal(f.cocheras, 2);
  assert.equal(f.superficies.cubierta, 220);
  assert.equal(f.superficies.terreno, 800);
  assert.equal(f.expensas.monto, 180000);
  assert.equal(f.expensas.moneda, null, 'la moneda de expensas no viene en la ficha');
  assert.equal(f.pileta, true);
  assert.equal(f.aptoCredito, null, 'sin tag de apto crédito no se asume nada');
  assert.equal(f.ubicacion.texto, 'Santa Juana, Canning');
  assert.equal(f.disponibilidad.estado, 'disponible');
});

test('normalizador: descarta información interna, propietarios y productor', () => {
  const f = normalizarPropiedad(raw(900001));
  const json = JSON.stringify(f);
  for (const prohibido of ['Propietario EJEMPLO', 'propietario@example.com', 'asesor@example.com', 'commission', 'internal', 'Nota interna', '11 0000-000']) {
    assert.ok(!json.includes(prohibido), `la ficha no debe contener "${prohibido}"`);
  }
});

test('normalizador: ficha con pocos datos deja null y no inventa', () => {
  const f = normalizarPropiedad(raw(900008));
  assert.equal(f.ambientes, null);
  assert.equal(f.dormitorios, null);
  assert.equal(f.cocheras, null);
  assert.equal(f.expensas, null);
  assert.deepEqual(f.caracteristicas, []);
  // Sin campo de estado: vale la regla confirmada por Tokko (la API solo devuelve Disponibles y publicadas).
  assert.equal(f.disponibilidad.estado, 'disponible');
  assert.match(f.disponibilidad.fuente, /regla de publicación/);
});

test('normalizador: estado "Reservada" queda como no disponible; precio no publicado queda marcado', () => {
  assert.equal(normalizarPropiedad(raw(900005)).disponibilidad.estado, 'no_disponible');
  const depto = normalizarPropiedad(raw(900004));
  assert.equal(depto.precioPublicado, false);
  assert.deepEqual(depto.operaciones[0].precios, []);
});

test('normalizador: alias de campos y valores raros (texto, ceros, objetos sueltos)', () => {
  const f = normalizarPropiedad({ id: '77', title: 'Otra forma', ref_code: 'AB12', location: 'Monte Grande', room_amount: '0', suite_amount: '2', parking_lot_amount: 0, tags: ['Apto crédito', 'No acepta mascotas'] }, { origen: 'detalle' });
  assert.equal(f.id, 77);
  assert.equal(f.titulo, 'Otra forma');
  assert.equal(f.codigo, 'AB12');
  assert.equal(f.ubicacion.texto, 'Monte Grande');
  assert.equal(f.ambientes, null, '0 se trata como no cargado');
  assert.equal(f.dormitorios, 2);
  assert.equal(f.cocheras, null);
  assert.equal(f.aptoCredito, true);
  assert.equal(f.aptoMascotas, false);
  assert.equal(f.disponibilidad.estado, 'desconocida', 'por detalle y sin estado no se asume disponible');
  assert.equal(numeroPositivo('220.00'), 220);
  assert.equal(numeroPositivo(true), null);
});

test('normalizador: lee el formato de lista meta/objects (visto en una respuesta real de Tokko)', () => {
  const real = JSON.parse(fs.readFileSync(new URL('../fixtures/tokko-real-location-quicksearch-canning.json', import.meta.url), 'utf8'));
  assert.equal(typeof real.meta.total_count, 'number');
  assert.ok(Array.isArray(real.objects));
  const fichas = normalizarListado(fixture);
  assert.equal(fichas.length, fixture.objects.length);
});

test('normalizador: ubicaciones reales de Tokko -> texto para el cliente', () => {
  const ubic = (location) => normalizarPropiedad({ id: 1, location }).ubicacion;
  const terralagos = ubic({ name: 'Terralagos', full_location: 'Argentina | G.B.A. Zona Sur | Ezeiza | Countries/B.Cerrado (Ezeiza) | Terralagos' });
  assert.equal(terralagos.texto, 'Terralagos, Ezeiza');
  assert.equal(terralagos.barrioCerrado, true);
  const canningChico = ubic({ name: 'Canning Chico', full_location: 'Argentina | G.B.A. Zona Sur | Esteban Echeverria | Canning (E. Echeverria) | Canning Chico' });
  assert.equal(canningChico.texto, 'Canning Chico, Canning');
  const canning = ubic({ name: 'Canning (E. Echeverria)', full_location: 'Argentina | G.B.A. Zona Sur | Esteban Echeverria | Canning (E. Echeverria)' });
  assert.equal(canning.texto, 'Canning, Esteban Echeverria');
});
