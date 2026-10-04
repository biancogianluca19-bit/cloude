// Identifica de qué propiedad habla la consulta, comparando lo que encontró el parser contra las fichas.
//
// Coincidencias fuertes (alcanzan para identificar): ID de Tokko, código de referencia, URL, dirección.
// Coincidencias débiles (solo generan candidatos para elegir a mano): título, barrio/localidad, tipo, operación.
//
// Estados:
//   identificada   una sola propiedad con coincidencia fuerte
//   varias         la consulta menciona más de una propiedad
//   candidatos     hay coincidencias débiles: elegir a mano
//   no_encontrada  dio un ID/código/URL que no está entre las propiedades publicadas
//   sin_referencia no hay nada para identificar la propiedad

import { normalizar, normalizarCodigo, sinParentesis } from './texto.js';

const FUERTE = 80;

function urlComparable(url) {
  return String(url ?? '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

// Partes de la ubicación de la ficha, normalizadas y sin el partido entre paréntesis.
function partesUbicacion(ficha) {
  const u = ficha.ubicacion;
  if (!u) return [];
  const partes = (u.partes?.length ? u.partes : [u.nombre]).filter(Boolean);
  return partes.map((p) => normalizar(sinParentesis(p)));
}

// "Canning" y "Canning Chico" nunca son lo mismo: una consulta por "Canning" no suma a una ficha
// cuyo barrio es "Canning Chico" (ni "Adrogué" a "Adrogué Chico").
function coincideZona(ficha, zona) {
  const z = normalizar(zona.nombre);
  const nombreFicha = normalizar(sinParentesis(ficha.ubicacion?.nombre ?? ''));
  if (nombreFicha.startsWith(`${z} chico`) && z !== nombreFicha) return false;
  return partesUbicacion(ficha).includes(z);
}

function coincideDireccion(ficha, textoNormalizado) {
  const dir = normalizar(ficha.direccion ?? '');
  const numero = dir.match(/\b\d{1,5}\b/)?.[0];
  if (!numero) return false;
  const palabras = dir.split(' ').filter((p) => p.length >= 4 && !/^\d+$/.test(p) && p !== 'ejemplo');
  if (!new RegExp(`\\b${numero}\\b`).test(textoNormalizado)) return false;
  return palabras.some((p) => new RegExp(`\\b${p}\\b`).test(textoNormalizado));
}

function coincideTitulo(ficha, textoPropiedad) {
  if (!textoPropiedad || !ficha.titulo) return false;
  const a = new Set(normalizar(ficha.titulo).split(' ').filter((p) => p.length > 2));
  const b = normalizar(textoPropiedad).split(' ').filter((p) => p.length > 2);
  if (a.size === 0 || b.length === 0) return false;
  const comunes = b.filter((p) => a.has(p)).length;
  return comunes / a.size >= 0.8;
}

export function identificarPropiedad(parseado, fichas) {
  const ref = parseado.referencias;
  const textoNormalizado = normalizar([parseado.mensaje, parseado.textoPropiedad].filter(Boolean).join(' '));
  const urlsConsulta = ref.urls.map(urlComparable);
  const codigosConsulta = ref.codigos.map(normalizarCodigo);
  const idsConsulta = [...ref.ids, ...ref.numeros];

  const puntajes = fichas.map((ficha) => {
    const motivos = [];
    let puntaje = 0;
    let fuerte = null;
    if (ficha.id !== null && idsConsulta.includes(String(ficha.id))) {
      puntaje += 100; fuerte = `id:${ficha.id}`; motivos.push('ID de Tokko');
    }
    if (ficha.codigo && codigosConsulta.includes(normalizarCodigo(ficha.codigo))) {
      puntaje += 100; fuerte = fuerte ?? `codigo:${normalizarCodigo(ficha.codigo)}`; motivos.push('código de referencia');
    }
    if (ficha.urlPublica && urlsConsulta.includes(urlComparable(ficha.urlPublica))) {
      puntaje += 100; fuerte = fuerte ?? 'url'; motivos.push('URL de la publicación');
    }
    if (coincideDireccion(ficha, textoNormalizado)) {
      puntaje += 80; fuerte = fuerte ?? 'direccion'; motivos.push('dirección');
    }
    if (coincideTitulo(ficha, parseado.textoPropiedad)) {
      puntaje += 60; motivos.push('título');
    }
    const zonas = ref.zonas.filter((z) => coincideZona(ficha, z));
    if (zonas.length) {
      puntaje += 30; motivos.push(`zona (${zonas.map((z) => z.nombre).join(', ')})`);
    }
    if (puntaje > 0 && ficha.tipo && ref.tipos.some((t) => normalizar(t) === normalizar(ficha.tipo))) {
      puntaje += 10; motivos.push('tipo');
    }
    if (puntaje > 0 && ref.operaciones.some((op) => (ficha.operaciones ?? []).some((o) => normalizar(o.tipo) === normalizar(op)))) {
      puntaje += 10; motivos.push('operación');
    }
    // Si la consulta dice tipo u operación y la ficha no coincide, baja el puntaje de las coincidencias débiles.
    if (puntaje > 0 && puntaje < FUERTE) {
      if (ref.tipos.length && ficha.tipo && !ref.tipos.some((t) => normalizar(t) === normalizar(ficha.tipo))) puntaje = 0;
      if (ref.operaciones.length && ficha.operaciones?.length && !ref.operaciones.some((op) => ficha.operaciones.some((o) => normalizar(o.tipo) === normalizar(op)))) puntaje = 0;
    }
    return { ficha, puntaje, motivos, fuerte };
  });

  const fuertes = puntajes.filter((p) => p.puntaje >= FUERTE && p.fuerte);
  const debiles = puntajes.filter((p) => p.puntaje > 0 && p.puntaje < FUERTE).sort((a, b) => b.puntaje - a.puntaje);

  // Referencias explícitas que no coinciden con ninguna ficha (posible propiedad no publicada).
  const codigosEncontrados = new Set(fuertes.map((f) => normalizarCodigo(f.ficha.codigo)));
  const idsEncontrados = new Set(fuertes.map((f) => String(f.ficha.id)));
  const urlsEncontradas = new Set(fuertes.map((f) => urlComparable(f.ficha.urlPublica)));
  const noEncontradas = [
    ...ref.codigos.filter((c) => !codigosEncontrados.has(normalizarCodigo(c))).map((c) => `código ${c}`),
    ...ref.ids.filter((i) => !idsEncontrados.has(i)).map((i) => `ID ${i}`),
    ...ref.urls.filter((u) => !urlsEncontradas.has(urlComparable(u)) && !ref.ids.some((i) => u.includes(i) && idsEncontrados.has(i))).map((u) => `URL ${u}`),
  ];

  // Barrios distintos mencionados (las localidades no cuentan: "Santa Juana, Canning" es una sola zona).
  const barrios = ref.zonas.filter((z) => z.tipo !== 'localidad');
  const referenciasExplicitas = new Set([...codigosConsulta, ...ref.ids]).size;

  const base = { candidatos: [], referenciasNoEncontradas: noEncontradas, zonasDesconocidas: ref.zonasDesconocidas ?? [] };

  if (fuertes.length >= 2 || (fuertes.length === 1 && noEncontradas.some((n) => !n.startsWith('URL'))) ) {
    return { ...base, estado: 'varias', propiedad: null, candidatos: fuertes.map(resumir), variasEnMensaje: true };
  }
  if (fuertes.length === 0 && referenciasExplicitas >= 2) {
    return { ...base, estado: 'varias', propiedad: null, variasEnMensaje: true };
  }
  if (fuertes.length === 1) {
    const variasZonas = barrios.length >= 2;
    return { ...base, estado: variasZonas ? 'varias' : 'identificada', propiedad: fuertes[0].ficha, motivos: fuertes[0].motivos, candidatos: variasZonas ? [resumir(fuertes[0])] : [], variasEnMensaje: variasZonas };
  }
  if (noEncontradas.length) {
    return { ...base, estado: 'no_encontrada', propiedad: null, candidatos: debiles.slice(0, 5).map(resumir), variasEnMensaje: false };
  }
  if (barrios.length >= 2) {
    return { ...base, estado: 'varias', propiedad: null, candidatos: debiles.slice(0, 5).map(resumir), variasEnMensaje: true };
  }
  if (debiles.length) {
    return { ...base, estado: 'candidatos', propiedad: null, candidatos: debiles.slice(0, 5).map(resumir), variasEnMensaje: false };
  }
  return { ...base, estado: 'sin_referencia', propiedad: null, variasEnMensaje: false };
}

function resumir({ ficha, puntaje, motivos }) {
  return { id: ficha.id, codigo: ficha.codigo, titulo: ficha.titulo, ubicacion: ficha.ubicacion?.texto ?? null, tipo: ficha.tipo, operaciones: (ficha.operaciones ?? []).map((o) => o.tipo), puntaje, motivos };
}
