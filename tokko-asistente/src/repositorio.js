// Fuente de propiedades: fixtures en modo mock, caché sincronizado con Tokko en modo live.
// No hay webhooks de Tokko para propiedades: se sincroniza cada config.syncMinutos.
// En disco solo se guardan fichas ya normalizadas (lista blanca), nunca el JSON crudo.

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './config.js';
import { normalizarListado, normalizarPropiedad } from './normalizador.js';
import { normalizar, normalizarCodigo } from './texto.js';

export const RUTA_FIXTURES = path.join(RAIZ, 'fixtures', 'propiedades-ejemplo.json');
export const RUTA_CACHE = path.join(RAIZ, 'data', 'cache-propiedades.json');

export function crearRepositorio({ config, cliente = null, rutaFixtures = RUTA_FIXTURES, rutaCache = RUTA_CACHE, ahora = () => new Date() }) {
  let fichas = [];
  let ultimaSync = null;
  let errorSync = null;
  let temporizador = null;
  let sincronizando = null;

  function cargarFixtures() {
    const json = JSON.parse(fs.readFileSync(rutaFixtures, 'utf8'));
    ultimaSync = ahora().toISOString();
    fichas = normalizarListado(json, { sincronizado: ultimaSync });
    errorSync = null;
  }

  function leerCacheDisco() {
    try {
      const guardado = JSON.parse(fs.readFileSync(rutaCache, 'utf8'));
      if (Array.isArray(guardado.fichas)) {
        fichas = guardado.fichas;
        ultimaSync = guardado.ultimaSync ?? null;
      }
    } catch {
      // Sin caché previo: se llena en la primera sincronización.
    }
  }

  function guardarCacheDisco() {
    fs.mkdirSync(path.dirname(rutaCache), { recursive: true });
    fs.writeFileSync(rutaCache, JSON.stringify({ ultimaSync, fichas }, null, 2));
  }

  async function sincronizar() {
    if (config.modo !== 'live') {
      cargarFixtures();
      return estado();
    }
    if (sincronizando) return sincronizando;
    sincronizando = (async () => {
      try {
        const { objetos } = await cliente.listarPropiedades();
        const momento = ahora().toISOString();
        fichas = normalizarListado({ objects: objetos }, { sincronizado: momento });
        ultimaSync = momento;
        errorSync = null;
        guardarCacheDisco();
      } catch (e) {
        // Si falla, se sigue usando el último caché y se muestra el error en pantalla.
        errorSync = e.message;
      } finally {
        sincronizando = null;
      }
      return estado();
    })();
    return sincronizando;
  }

  async function iniciar() {
    if (config.modo !== 'live') {
      cargarFixtures();
      return estado();
    }
    leerCacheDisco();
    const vencido = !ultimaSync || ahora() - new Date(ultimaSync) > config.syncMinutos * 60_000;
    if (vencido) await sincronizar();
    temporizador = setInterval(() => { sincronizar(); }, config.syncMinutos * 60_000);
    temporizador.unref?.();
    return estado();
  }

  function detener() {
    if (temporizador) clearInterval(temporizador);
    temporizador = null;
  }

  function estado() {
    return { modo: config.modo, cantidad: fichas.length, ultimaSync, errorSync };
  }

  function todas() {
    return fichas;
  }

  function porId(id) {
    return fichas.find((f) => String(f.id) === String(id)) ?? null;
  }

  // Busca primero en el caché. Solo si no está y estamos en live, hace un GET puntual a Tokko.
  async function buscarPorId(id) {
    const enCache = porId(id);
    if (enCache || config.modo !== 'live' || !cliente) return enCache;
    try {
      const raw = await cliente.obtenerPropiedad(id);
      if (!raw) return null;
      return normalizarPropiedad(raw, { origen: 'detalle', sincronizado: ahora().toISOString() });
    } catch (e) {
      errorSync = e.message;
      return null;
    }
  }

  // Búsqueda para elegir a mano desde la pantalla.
  function buscarTexto(consulta, limite = 15) {
    const q = normalizar(consulta);
    if (!q) return fichas.slice(0, limite);
    const qCodigo = normalizarCodigo(consulta);
    return fichas
      .filter((f) => {
        const campos = [f.titulo, f.tipo, f.ubicacion?.completa, f.direccion, ...(f.operaciones ?? []).map((o) => o.tipo)];
        const pajar = normalizar(campos.filter(Boolean).join(' '));
        return String(f.id) === q || (qCodigo && normalizarCodigo(f.codigo) === qCodigo) || q.split(' ').every((p) => pajar.includes(p));
      })
      .slice(0, limite);
  }

  return { iniciar, detener, sincronizar, estado, todas, porId, buscarPorId, buscarTexto };
}
