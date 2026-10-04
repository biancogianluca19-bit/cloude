// Trae UNA propiedad real de Tokko (GET /property/?limit=1), guarda una copia saneada en fixtures/
// y muestra qué campos trae, sin mostrar valores. Sirve para validar el normalizador.
//
// Uso: npm run descubrir   (requiere TOKKO_API_KEY en .env)

import fs from 'node:fs';
import path from 'node:path';
import { cargarConfig, RAIZ } from '../src/config.js';
import { crearClienteTokko } from '../src/tokko-cliente.js';
import { sanearPropiedad, listarCampos } from '../src/saneador.js';
import { CAMPOS, normalizarPropiedad } from '../src/normalizador.js';

const config = cargarConfig();
if (!config.tieneKey) {
  console.log('No hay TOKKO_API_KEY en .env. Cargala a mano (ver README) y volvé a correr "npm run descubrir".');
  process.exit(1);
}

const cliente = crearClienteTokko({ obtenerApiKey: config.obtenerApiKey, baseUrl: config.baseUrl });

try {
  const { json, propiedad } = await cliente.primeraPropiedad();
  if (!propiedad) {
    console.log('Tokko respondió sin propiedades. ¿Hay alguna Disponible y con "Publicar" activo?');
    process.exit(1);
  }
  const saneada = sanearPropiedad(propiedad);
  const campos = listarCampos(propiedad);
  const camposObj = Object.fromEntries([...campos.entries()].sort());

  fs.writeFileSync(path.join(RAIZ, 'fixtures', 'propiedad-real-saneada.json'), JSON.stringify({ _aviso: 'Copia saneada de una propiedad real. No subir a git.', meta: json.meta ? { total_count: json.meta.total_count } : null, objects: [saneada] }, null, 2));
  fs.writeFileSync(path.join(RAIZ, 'fixtures', 'campos-detectados.json'), JSON.stringify(camposObj, null, 2));

  console.log(`Propiedades publicadas según Tokko: ${json.meta?.total_count ?? 'sin dato'}`);
  console.log('\nCampos que usa el normalizador y si aparecen en la respuesta real:');
  const raices = new Set([...campos.keys()].map((c) => c.split(/[.[]/)[0]));
  for (const [clave, { alias, fuente }] of Object.entries(CAMPOS)) {
    const encontrados = alias.filter((a) => raices.has(a));
    console.log(`  ${encontrados.length ? 'OK ' : '-- '} ${clave.padEnd(16)} ${encontrados.join(', ') || `(ninguno de: ${alias.join(', ')})`}  [${fuente}]`);
  }
  const ficha = normalizarPropiedad(propiedad, { origen: 'listado' });
  const vacios = Object.entries(ficha).filter(([, v]) => v === null).map(([k]) => k);
  console.log(`\nCampos de la ficha que quedaron vacíos: ${vacios.join(', ') || 'ninguno'}`);
  console.log('\nGuardado: fixtures/propiedad-real-saneada.json y fixtures/campos-detectados.json (los dos están en .gitignore).');
  console.log('Revisá la copia saneada antes de compartirla con alguien.');
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
