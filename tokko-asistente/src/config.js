// Configuración: lee .env (sin dependencias) y arma un objeto de config.
// La API key nunca se imprime: el objeto expone la key solo por la función obtenerApiKey().

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parsearEnv(texto) {
  const salida = {};
  for (const lineaCruda of texto.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea || linea.startsWith('#')) continue;
    const i = linea.indexOf('=');
    if (i === -1) continue;
    const clave = linea.slice(0, i).trim();
    let valor = linea.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    salida[clave] = valor;
  }
  return salida;
}

function leerArchivoEnv(rutaEnv) {
  try {
    return parsearEnv(fs.readFileSync(rutaEnv, 'utf8'));
  } catch {
    return {};
  }
}

// Las variables del sistema tienen prioridad sobre .env.
export function cargarConfig({ rutaEnv = path.join(RAIZ, '.env'), entorno = process.env } = {}) {
  const deArchivo = leerArchivoEnv(rutaEnv);
  const leer = (clave, porDefecto = '') => {
    const v = entorno[clave] ?? deArchivo[clave];
    return v === undefined || v === '' ? porDefecto : String(v);
  };

  const apiKey = leer('TOKKO_API_KEY');
  const modoPedido = leer('TOKKO_MODE', 'mock').toLowerCase();
  const tieneKey = apiKey.length > 0;
  // Sin key no hay modo live posible.
  const modo = modoPedido === 'live' && tieneKey ? 'live' : 'mock';

  let syncMinutos = Number.parseInt(leer('TOKKO_SYNC_MINUTOS', '20'), 10);
  if (!Number.isFinite(syncMinutos)) syncMinutos = 20;
  syncMinutos = Math.min(30, Math.max(15, syncMinutos));

  const config = {
    modo,
    modoPedido,
    tieneKey,
    syncMinutos,
    camposValidados: leer('TOKKO_CAMPOS_VALIDADOS', 'false').toLowerCase() === 'true',
    host: leer('HOST', '127.0.0.1'),
    puerto: Number.parseInt(leer('PORT', '3000'), 10) || 3000,
    baseUrl: 'https://www.tokkobroker.com/api/v1/',
    avisoModo: modoPedido === 'live' && !tieneKey ? 'Pediste TOKKO_MODE=live pero no hay TOKKO_API_KEY en .env. Corre en modo mock.' : '',
  };
  // La key queda fuera del objeto enumerable para que no aparezca en JSON.stringify ni en console.log.
  Object.defineProperty(config, 'obtenerApiKey', { value: () => apiKey, enumerable: false });
  return config;
}
