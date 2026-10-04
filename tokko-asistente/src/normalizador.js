// Normalizador de propiedades de Tokko -> ficha interna.
//
// ESTADO: SIN VALIDAR CONTRA LA API REAL.
// Funciona con lista blanca: solo copia los campos de CAMPOS. Todo lo demás (información interna,
// propietarios, productor, comisiones) se descarta y nunca llega a la ficha, a la pantalla ni al caché.
//
// Fuente de cada nombre de campo:
//   'schema'  -> aparece en el schema público del playground de Tokko (order_by / filtros de /property/search).
//                Confirma que el campo existe, no garantiza su formato en la respuesta.
//   'real'    -> visto en una respuesta real de la API (endpoint público /location/quicksearch/).
//   'supuesto'-> nombre probable, sin confirmar. Revisar con "npm run descubrir" cuando haya API key.

import { sinParentesis } from './texto.js';

export const CAMPOS = {
  id: { alias: ['id'], fuente: 'supuesto' },
  codigo: { alias: ['reference_code', 'ref_code', 'code'], fuente: 'supuesto' },
  titulo: { alias: ['publication_title', 'title', 'titulo'], fuente: 'supuesto' },
  tipo: { alias: ['type', 'property_type'], fuente: 'supuesto' },
  operaciones: { alias: ['operations'], fuente: 'supuesto' },
  precioWeb: { alias: ['web_price'], fuente: 'supuesto' },
  ubicacion: { alias: ['location'], fuente: 'real' },
  direccion: { alias: ['fake_address', 'address', 'real_address'], fuente: 'supuesto' },
  ambientes: { alias: ['room_amount'], fuente: 'schema' },
  dormitorios: { alias: ['suite_amount', 'bedroom_amount'], fuente: 'schema' },
  banos: { alias: ['bathroom_amount'], fuente: 'schema' },
  toilettes: { alias: ['toilet_amount'], fuente: 'schema' },
  cocheras: { alias: ['parking_lot_amount'], fuente: 'schema' },
  supCubierta: { alias: ['roofed_surface'], fuente: 'schema' },
  supSemicubierta: { alias: ['semiroofed_surface'], fuente: 'schema' },
  supTerreno: { alias: ['surface'], fuente: 'schema' },
  supTotal: { alias: ['total_surface'], fuente: 'schema' },
  expensas: { alias: ['expenses'], fuente: 'schema' },
  monedaExpensas: { alias: ['expenses_currency'], fuente: 'supuesto' },
  antiguedad: { alias: ['age'], fuente: 'schema' },
  estado: { alias: ['status', 'availability', 'estado'], fuente: 'supuesto' },
  tags: { alias: ['tags'], fuente: 'supuesto' },
  aptoCredito: { alias: ['credit_eligible', 'apto_credito'], fuente: 'supuesto' },
  urlPublica: { alias: ['public_url', 'url'], fuente: 'supuesto' },
};

// Mapeo de dormitorios: en el schema existe suite_amount y no existe bedroom_amount.
// Se asume que suite_amount = dormitorios y room_amount = ambientes. VALIDAR con una ficha real
// comparando contra lo que se ve en la pantalla de Tokko.

function leer(raw, clave) {
  for (const alias of CAMPOS[clave].alias) {
    if (raw[alias] !== undefined && raw[alias] !== null && raw[alias] !== '') return raw[alias];
  }
  return null;
}

// Tokko puede mandar números como texto ("220.00"). 0 se trata como "no cargado":
// no se puede distinguir un 0 real de un campo vacío, y es más seguro pedir confirmación.
export function numeroPositivo(valor) {
  if (valor === null || valor === undefined || valor === '' || typeof valor === 'boolean') return null;
  const n = typeof valor === 'number' ? valor : Number.parseFloat(String(valor).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function texto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') return texto(valor.name ?? valor.nombre ?? null);
  const s = String(valor).trim();
  return s ? s : null;
}

function normalizarOperaciones(valor) {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((op) => {
      const tipo = texto(op.operation_type ?? op.type ?? op.name);
      const precios = (Array.isArray(op.prices) ? op.prices : [])
        .map((p) => ({ moneda: texto(p.currency), monto: numeroPositivo(p.price), periodo: p.period ?? null }))
        .filter((p) => p.moneda && p.monto);
      return tipo ? { tipo, precios } : null;
    })
    .filter(Boolean);
}

function normalizarUbicacion(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') {
    return { nombre: valor, completa: valor, texto: sinParentesis(valor), barrioCerrado: null };
  }
  const nombre = texto(valor.name);
  const completa = texto(valor.full_location ?? valor.short_location) ?? nombre;
  if (!nombre && !completa) return null;
  const partes = String(completa ?? '').split('|').map((p) => p.trim()).filter(Boolean);
  // Tokko agrupa muchos barrios bajo "Countries/B.Cerrado (...)" en full_location (visto en datos reales).
  const barrioCerrado = partes.some((p) => /countries\s*\/\s*b\.?\s*cerrado/i.test(p)) ? true : null;
  // Texto para el cliente: "Santa Juana, Canning". Se saltea la categoría "Countries/B.Cerrado".
  const nombreVisible = sinParentesis(nombre ?? partes.at(-1));
  const indice = partes.length - 1;
  let padre = null;
  for (let i = indice - 1; i >= 2; i -= 1) {
    if (/countries\s*\/\s*b\.?\s*cerrado/i.test(partes[i])) continue;
    padre = sinParentesis(partes[i]);
    break;
  }
  const textoVisible = padre && padre !== nombreVisible ? `${nombreVisible}, ${padre}` : nombreVisible;
  return { nombre, completa, partes, texto: textoVisible, barrioCerrado };
}

const RE_NO_DISPONIBLE = /(reservad|vendid|alquilad|suspendid|no disponible|inactiv|retirad|tasacion)/i;
const RE_DISPONIBLE = /disponible/i;

function normalizarDisponibilidad(valor, origen) {
  if (typeof valor === 'string') {
    if (RE_NO_DISPONIBLE.test(valor)) return { estado: 'no_disponible', texto: valor, fuente: 'campo de estado' };
    if (RE_DISPONIBLE.test(valor)) return { estado: 'disponible', texto: valor, fuente: 'campo de estado' };
  }
  if (valor && typeof valor === 'object' && typeof valor.name === 'string') {
    return normalizarDisponibilidad(valor.name, origen);
  }
  // Tokko confirmó que /property/ solo devuelve propiedades Disponibles y con "Publicar" activo.
  // Si el estado vino como número u otro formato desconocido, se usa esa regla, que también
  // vale para el caso en que el campo no venga.
  if (origen === 'listado') {
    return { estado: 'disponible', texto: null, fuente: 'regla de publicación de Tokko (solo publica Disponibles)' };
  }
  return { estado: 'desconocida', texto: null, fuente: null };
}

function nombresDeTags(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map((t) => texto(typeof t === 'string' ? t : t?.name)).filter(Boolean);
}

// Busca una característica en los tags. Devuelve true / false / null (null = la ficha no dice nada).
function caracteristica(tags, reSi, reNo) {
  for (const t of tags) if (reNo && reNo.test(t)) return false;
  for (const t of tags) if (reSi.test(t)) return true;
  return null;
}

function normalizarAptoCredito(valorCampo, tags) {
  if (typeof valorCampo === 'boolean') return valorCampo;
  if (typeof valorCampo === 'string') {
    if (/no\s*apto/i.test(valorCampo)) return false;
    if (/apto/i.test(valorCampo)) return true;
  }
  return caracteristica(tags, /apto\s*cr[eé]dito/i, /no\s*apto\s*cr[eé]dito/i);
}

/**
 * @param {object} raw  objeto de propiedad tal como lo devuelve Tokko (o el fixture).
 * @param {object} opciones { origen: 'listado' | 'detalle' | 'manual', sincronizado: ISO string }
 */
export function normalizarPropiedad(raw, { origen = 'listado', sincronizado = null } = {}) {
  if (!raw || typeof raw !== 'object') throw new TypeError('normalizarPropiedad: se esperaba un objeto');
  const tags = nombresDeTags(leer(raw, 'tags'));
  const id = leer(raw, 'id');
  const precioWeb = leer(raw, 'precioWeb');
  const montoExpensas = numeroPositivo(leer(raw, 'expensas'));

  return {
    id: id === null ? null : Number.isFinite(Number(id)) ? Number(id) : String(id),
    codigo: texto(leer(raw, 'codigo')),
    titulo: texto(leer(raw, 'titulo')),
    tipo: texto(leer(raw, 'tipo')),
    operaciones: normalizarOperaciones(leer(raw, 'operaciones')),
    precioPublicado: precioWeb === false ? false : null,
    ubicacion: normalizarUbicacion(leer(raw, 'ubicacion')),
    direccion: texto(leer(raw, 'direccion')),
    ambientes: numeroPositivo(leer(raw, 'ambientes')),
    dormitorios: numeroPositivo(leer(raw, 'dormitorios')),
    banos: numeroPositivo(leer(raw, 'banos')),
    toilettes: numeroPositivo(leer(raw, 'toilettes')),
    cocheras: numeroPositivo(leer(raw, 'cocheras')),
    superficies: {
      cubierta: numeroPositivo(leer(raw, 'supCubierta')),
      semicubierta: numeroPositivo(leer(raw, 'supSemicubierta')),
      terreno: numeroPositivo(leer(raw, 'supTerreno')),
      total: numeroPositivo(leer(raw, 'supTotal')),
    },
    expensas: montoExpensas ? { monto: montoExpensas, moneda: texto(leer(raw, 'monedaExpensas')) } : null,
    antiguedad: numeroPositivo(leer(raw, 'antiguedad')),
    caracteristicas: tags,
    pileta: caracteristica(tags, /(pileta|piscina)/i, /sin\s*(pileta|piscina)/i),
    aptoMascotas: caracteristica(tags, /mascota/i, /no\s*(acepta|apto)?\s*mascota/i),
    aptoCredito: normalizarAptoCredito(leer(raw, 'aptoCredito'), tags),
    disponibilidad: normalizarDisponibilidad(leer(raw, 'estado'), origen),
    urlPublica: texto(leer(raw, 'urlPublica')),
    origen,
    sincronizado,
  };
}

// Respuesta de lista de Tokko: { meta: { total_count, next, previous, ... }, objects: [...] }.
// El formato meta/objects está visto en una respuesta real (/location/quicksearch/).
export function normalizarListado(json, opciones = {}) {
  const objetos = Array.isArray(json?.objects) ? json.objects : Array.isArray(json) ? json : [];
  return objetos.map((o) => normalizarPropiedad(o, { origen: 'listado', ...opciones }));
}
