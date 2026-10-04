// Controles de datos personales y credenciales sobre los archivos del proyecto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineaDeLog, registrarConsulta } from '../src/log.js';
import { sanearPropiedad, listarCampos } from '../src/saneador.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IGNORAR = new Set(['node_modules', 'data', 'logs', '.git']);

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORAR.has(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : [p];
  });
}

test('seguridad: no hay keys en ningún archivo del proyecto', () => {
  for (const archivo of archivos(RAIZ)) {
    if (path.basename(archivo) === '.env') continue;
    const texto = fs.readFileSync(archivo, 'utf8');
    assert.ok(!/TOKKO_API_KEY\s*=\s*\S{8,}/.test(texto), `posible key en ${archivo}`);
    assert.ok(!/[?&]key=[A-Za-z0-9]{16,}/.test(texto), `posible key en URL en ${archivo}`);
  }
});

test('seguridad: los fixtures son de EJEMPLO y solo usan mails example.com y teléfonos con ceros', () => {
  for (const nombre of ['propiedades-ejemplo.json', 'consultas-ejemplo.json']) {
    const texto = fs.readFileSync(path.join(RAIZ, 'fixtures', nombre), 'utf8');
    assert.match(texto, /EJEMPLO/);
    for (const mail of texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) assert.match(mail, /@example\.com$/, mail);
    for (const tel of texto.match(/\+?\d[\d\s-]{8,}\d/g) ?? []) assert.match(tel.replace(/\D/g, ''), /0000/, `teléfono que no parece ficticio: ${tel}`);
  }
});

test('seguridad: el log guarda solo hora, id de consulta e id de propiedad', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-'));
  const ruta = path.join(dir, 'consultas.log');
  registrarConsulta({ hora: '2026-10-04T12:00:00.000Z', consultaId: 'abc123', propiedadId: 900001, nombre: 'Martina', telefono: '11 0000 1111' }, ruta);
  assert.equal(fs.readFileSync(ruta, 'utf8'), '2026-10-04T12:00:00.000Z\tconsulta=abc123\tpropiedad=900001\n');
  assert.equal(lineaDeLog({ hora: 'h', consultaId: 'x', propiedadId: null }), 'h\tconsulta=x\tpropiedad=-\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('seguridad: el saneador saca datos internos, mails y teléfonos de una propiedad cruda', () => {
  const crudo = {
    id: 1,
    description: 'Llamar al 11 4444-5555 o escribir a dueno@correo.com',
    internal_data: { property_owners: [{ name: 'Dueño' }] },
    producer: { name: 'Vendedor', email: 'v@x.com' },
    real_address: 'Calle 1 123',
    operations: [{ prices: [{ price: 100 }] }],
  };
  const s = JSON.stringify(sanearPropiedad(crudo));
  for (const prohibido of ['4444', 'dueno@correo.com', 'Dueño', 'Vendedor', 'v@x.com', 'Calle 1 123']) assert.ok(!s.includes(prohibido), prohibido);
  const campos = listarCampos(crudo);
  assert.equal(campos.get('operations[].prices[].price'), 'number');
});

test('seguridad: .env está en .gitignore', () => {
  const gi = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8');
  assert.match(gi, /^\.env$/m);
  assert.match(gi, /^logs\/$/m);
  assert.match(gi, /^data\/$/m);
});
