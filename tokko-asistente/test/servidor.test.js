import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cargarConfig } from '../src/config.js';
import { crearRepositorio } from '../src/repositorio.js';
import { cargarDatosInmobiliaria } from '../src/analizar.js';
import { crearServidor } from '../server.js';

const config = cargarConfig({ rutaEnv: '/no-existe', entorno: {} });
const repo = crearRepositorio({ config });
await repo.iniciar();
const consultas = JSON.parse(fs.readFileSync(new URL('../fixtures/consultas-ejemplo.json', import.meta.url), 'utf8')).consultas;
const servidor = crearServidor({ config, repo, datos: cargarDatosInmobiliaria(), consultasEjemplo: consultas });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
test.after(() => servidor.close());

const post = (ruta, cuerpo) => fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

test('servidor: estado en modo mock marca "sin validar"', async () => {
  const e = await (await fetch(`${base}/api/estado`)).json();
  assert.equal(e.modo, 'mock');
  assert.equal(e.sinValidar, true);
  assert.equal(e.cantidad, 8);
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /SIN VALIDAR CONTRA LA API REAL/);
});

test('servidor: flujo completo con todas las consultas de ejemplo', async () => {
  for (const c of consultas) {
    const r = await post('/api/analizar', { texto: c.texto });
    assert.equal(r.status, 200, c.titulo);
    const d = await r.json();
    assert.ok(d.borrador.texto.length > 20, c.titulo);
    assert.equal(d.derivacion.derivar, c.titulo.startsWith('DERIVA') || ['candidatos', 'sin_referencia'].includes(d.identificacion.estado), c.titulo);
  }
});

test('servidor: elegir candidata, buscar propiedades y errores de entrada', async () => {
  const elegida = await (await post('/api/analizar', { texto: 'ola kiero saver el presio del lote en el rodal', propiedadId: 900003 })).json();
  assert.equal(elegida.derivacion.derivar, false);
  assert.match(elegida.borrador.texto, /USD 48\.000/);
  const busqueda = await (await fetch(`${base}/api/propiedades?q=terralagos`)).json();
  assert.deepEqual(busqueda.propiedades.map((p) => p.codigo), ['EJ-106']);
  assert.equal((await post('/api/analizar', {})).status, 400);
  const invalido = await fetch(`${base}/api/analizar`, { method: 'POST', body: '{no es json' });
  assert.equal(invalido.status, 400);
  assert.equal((await fetch(`${base}/%2e%2e%2fserver.js`)).status, 403);
});
