import test from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteTokko, redactar } from '../src/tokko-cliente.js';
import { cargarConfig, parsearEnv } from '../src/config.js';
import { crearRepositorio } from '../src/repositorio.js';

const KEY = 'clave-de-prueba-123';

function fetchFalso(paginas) {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, metodo: opciones.method });
    const u = new URL(url);
    if (u.pathname.endsWith('/property/999/')) return { ok: false, status: 404, json: async () => ({}) };
    if (u.pathname.endsWith('/property/500/')) return { ok: false, status: 500, json: async () => ({}) };
    const offset = Number(u.searchParams.get('offset') ?? 0);
    const limit = Number(u.searchParams.get('limit') ?? 20);
    const todos = paginas;
    return { ok: true, status: 200, json: async () => ({ meta: { total_count: todos.length, next: 'trae la key', offset, limit }, objects: todos.slice(offset, offset + limit) }) };
  };
  return { impl, llamadas };
}

test('cliente Tokko: solo hace GET y recorre todas las páginas con limit/offset', async () => {
  const props = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));
  const { impl, llamadas } = fetchFalso(props);
  const cliente = crearClienteTokko({ obtenerApiKey: () => KEY, fetchImpl: impl });
  const { objetos, total } = await cliente.listarPropiedades({ limite: 50 });
  assert.equal(objetos.length, 120);
  assert.equal(total, 120);
  assert.equal(llamadas.length, 3);
  assert.ok(llamadas.every((l) => l.metodo === 'GET'));
  const u = new URL(llamadas[0].url);
  assert.equal(u.origin + u.pathname, 'https://www.tokkobroker.com/api/v1/property/');
  assert.equal(u.searchParams.get('format'), 'json');
  assert.equal(u.searchParams.get('lang'), 'es_ar');
  assert.equal(u.searchParams.get('key'), KEY);
  assert.equal(typeof cliente.crearConsulta, 'undefined', 'no existe ninguna función que haga POST');
});

test('cliente Tokko: 404 devuelve null y los errores nunca muestran la key', async () => {
  const { impl } = fetchFalso([]);
  const cliente = crearClienteTokko({ obtenerApiKey: () => KEY, fetchImpl: impl });
  assert.equal(await cliente.obtenerPropiedad(999), null);
  await assert.rejects(cliente.obtenerPropiedad(500), (e) => !e.message.includes(KEY) && /500/.test(e.message));
  const caido = crearClienteTokko({ obtenerApiKey: () => KEY, fetchImpl: async (url) => { throw new Error(`fallo al pedir ${url}`); } });
  await assert.rejects(caido.obtenerPropiedad(1), (e) => !e.message.includes(KEY) && e.message.includes('key=***'));
  assert.equal(redactar('https://x/?format=json&key=abc123&lang=es_ar'), 'https://x/?format=json&key=***&lang=es_ar');
});

test('config: sin key el modo es mock aunque pidan live, y la key no aparece al serializar', () => {
  const sinKey = cargarConfig({ rutaEnv: '/no-existe', entorno: { TOKKO_MODE: 'live' } });
  assert.equal(sinKey.modo, 'mock');
  assert.match(sinKey.avisoModo, /no hay TOKKO_API_KEY/);
  const conKey = cargarConfig({ rutaEnv: '/no-existe', entorno: { TOKKO_API_KEY: KEY, TOKKO_MODE: 'live', TOKKO_SYNC_MINUTOS: '5' } });
  assert.equal(conKey.modo, 'live');
  assert.equal(conKey.syncMinutos, 15, 'la sincronización se limita a 15-30 minutos');
  assert.ok(!JSON.stringify(conKey).includes(KEY));
  assert.ok(!String(Object.values(conKey)).includes(KEY));
  assert.equal(conKey.obtenerApiKey(), KEY);
  assert.deepEqual(parsearEnv('# comentario\nA=1\nB="dos"\n\nC= tres '), { A: '1', B: 'dos', C: 'tres' });
});

test('repositorio live: usa el caché y solo pide a Tokko en tiempo real lo que no está', async () => {
  const props = [{ id: 1, reference_code: 'AA-1', status: 'Disponible' }];
  const { impl, llamadas } = fetchFalso(props);
  const config = cargarConfig({ rutaEnv: '/no-existe', entorno: { TOKKO_API_KEY: KEY, TOKKO_MODE: 'live' } });
  const cliente = crearClienteTokko({ obtenerApiKey: config.obtenerApiKey, fetchImpl: impl });
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokko-'));
  const repo = crearRepositorio({ config, cliente, rutaCache: path.join(dir, 'cache.json') });
  await repo.iniciar();
  repo.detener();
  assert.equal(repo.todas().length, 1);
  const antes = llamadas.length;
  assert.equal((await repo.buscarPorId(1)).codigo, 'AA-1');
  assert.equal(llamadas.length, antes, 'la que está en caché no genera llamada');
  assert.equal(await repo.buscarPorId(999), null);
  assert.equal(llamadas.length, antes + 1);
  const guardado = fs.readFileSync(path.join(dir, 'cache.json'), 'utf8');
  assert.ok(!guardado.includes(KEY));
  fs.rmSync(dir, { recursive: true, force: true });
});
