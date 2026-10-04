// Cliente de la API REST de Tokko. Solo hace GET.
// La key va en la query string (así lo pide Tokko), por eso toda URL o mensaje de error
// pasa por redactar() antes de salir de este módulo.

const LIMITE_POR_PAGINA = 50;
const TIMEOUT_MS = 20000;

export function redactar(texto) {
  return String(texto ?? '').replace(/([?&]key=)[^&\s"']*/gi, '$1***');
}

export class ErrorTokko extends Error {
  constructor(mensaje, { status = null } = {}) {
    super(redactar(mensaje));
    this.name = 'ErrorTokko';
    this.status = status;
  }
}

export function crearClienteTokko({ obtenerApiKey, baseUrl = 'https://www.tokkobroker.com/api/v1/', fetchImpl = globalThis.fetch, lang = 'es_ar' }) {
  if (typeof obtenerApiKey !== 'function') throw new TypeError('crearClienteTokko: falta obtenerApiKey');

  function armarUrl(ruta, params = {}) {
    const url = new URL(ruta, baseUrl);
    url.searchParams.set('format', 'json');
    url.searchParams.set('lang', lang);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('key', obtenerApiKey());
    return url;
  }

  async function get(ruta, params) {
    const url = armarUrl(ruta, params);
    let respuesta;
    try {
      respuesta = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new ErrorTokko(`No se pudo conectar con Tokko (${ruta}): ${e?.message ?? e}`);
    }
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) {
      throw new ErrorTokko(`Tokko respondió ${respuesta.status} en ${ruta}`, { status: respuesta.status });
    }
    try {
      return await respuesta.json();
    } catch {
      throw new ErrorTokko(`Tokko devolvió algo que no es JSON en ${ruta}`);
    }
  }

  // Recorre todas las páginas con limit/offset. No usa meta.next porque esa URL trae la key.
  async function listarPropiedades({ limite = LIMITE_POR_PAGINA, maxPaginas = 200 } = {}) {
    const objetos = [];
    let offset = 0;
    let total = null;
    for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
      const json = await get('property/', { limit: limite, offset });
      if (!json) break;
      const lote = Array.isArray(json.objects) ? json.objects : [];
      objetos.push(...lote);
      total = Number(json.meta?.total_count ?? NaN);
      offset += limite;
      if (lote.length === 0) break;
      if (Number.isFinite(total) && offset >= total) break;
      if (!Number.isFinite(total) && !json.meta?.next) break;
    }
    return { objetos, total: Number.isFinite(total) ? total : objetos.length };
  }

  async function obtenerPropiedad(id) {
    const limpio = String(id).replace(/[^0-9]/g, '');
    if (!limpio) return null;
    return get(`property/${limpio}/`);
  }

  async function primeraPropiedad() {
    const json = await get('property/', { limit: 1, offset: 0 });
    return { json, propiedad: json?.objects?.[0] ?? null };
  }

  return { listarPropiedades, obtenerPropiedad, primeraPropiedad, armarUrlParaTest: (r, p) => redactar(armarUrl(r, p).toString()) };
}
