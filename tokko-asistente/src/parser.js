// Parser genérico de consultas pegadas (mail de Tokko, WhatsApp o texto libre).
// Todavía no hay un mail real de Tokko de referencia: reconoce líneas con etiqueta
// ("Nombre:", "Email:", "Mensaje:", "Propiedad:", "Código:"), el formato de chat exportado de WhatsApp
// y texto libre. Cuando llegue un mail real, agregar su formato acá y un test con ese texto.

import { normalizar, normalizarCodigo } from './texto.js';

const ETIQUETAS = [
  { campo: 'nombre', re: /^(nombre( y apellido| completo)?|contacto|cliente|interesad[oa])$/ },
  { campo: 'apellido', re: /^apellido$/ },
  { campo: 'email', re: /^(e-?mail|correo( electronico)?|mail)$/ },
  { campo: 'telefono', re: /^(telefono( celular)?|tel|celular|cel|whatsapp|wsp|movil)$/ },
  { campo: 'mensaje', re: /^(mensaje|consulta|comentarios?|texto|pregunta)$/ },
  { campo: 'propiedad', re: /^(propiedad|publicacion|aviso|inmueble|ficha|titulo)$/ },
  { campo: 'codigo', re: /^(codigo( de referencia)?|cod|ref|referencia|cod ref)$/ },
  { campo: 'id', re: /^(id|id de (la )?propiedad|id propiedad|id tokko)$/ },
  { campo: 'url', re: /^(link|url|enlace)$/ },
];

const RE_LINEA_ETIQUETA = /^\s*([A-Za-zÁÉÍÓÚÜáéíóúüñÑ .\-]{2,30}?)\s*[:：]\s*(.*)$/;
const RE_WHATSAPP = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?([^:]{1,40}):\s?(.*)$/i;
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const RE_URL = /\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi;
const RE_TELEFONO = /\+?\(?\d[\d\s\-().]{6,}\d/g;
const RE_MONEDA_ANTES = /(usd|u\$s|u\$d|\$|ars|dolares|pesos)\s*$/i;
const RE_UNIDAD_DESPUES = /^\s*(usd|u\$s|dolares|pesos|m2|mts|metros|mil\b|k\b)/i;
const PALABRAS_NO_CODIGO = /^(USD|ARS|UVA|MTS|M2|MT2|AMB|COD|REF|WWW)/;

const TIPOS = [
  ['Casa', /\b(casa|casas|chalet|casita)\b/],
  ['Departamento', /\b(departamento|departamentos|depto|dpto|depa|monoambiente)\b/],
  ['Terreno', /\b(lote|lotes|terreno|terrenos)\b/],
  ['PH', /\bph\b/],
  ['Local', /\b(local comercial|un local|el local)\b/],
  ['Oficina', /\boficinas?\b/],
  ['Quinta', /\bquintas?\b/],
];

const OPERACIONES = [
  ['Alquiler temporario', /\b(temporario|temporaria|temporada|quincena)\b/],
  ['Alquiler', /\b(alquiler|alquilar|alquilo|alquila|alquilan|alquilarla|alquilarlo|renta|rentar)\b/],
  ['Venta', /\b(venta|vende|vendo|venden|vendes|comprar|compra|compro|comprarla|comprarlo)\b/],
];

function etiquetaDe(linea) {
  const m = linea.match(RE_LINEA_ETIQUETA);
  if (!m) return null;
  const etiqueta = normalizar(m[1]);
  const def = ETIQUETAS.find((e) => e.re.test(etiqueta));
  return def ? { campo: def.campo, valor: m[2].trim() } : null;
}

function capitalizar(nombre) {
  return nombre
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

function unicos(lista) {
  return [...new Set(lista.filter(Boolean))];
}

export function extraerEmails(texto) {
  return unicos((texto.match(RE_EMAIL) ?? []).map((e) => e.toLowerCase()));
}

export function extraerUrls(texto) {
  return unicos((texto.match(RE_URL) ?? []).map((u) => u.replace(/[.,;:!?)]+$/, '')));
}

// Teléfonos argentinos con o sin +54, 9, 0, 15, guiones o espacios. Se descartan montos y medidas.
export function extraerTelefonos(texto) {
  const salida = [];
  for (const m of texto.matchAll(RE_TELEFONO)) {
    const crudo = m[0].trim();
    const digitos = crudo.replace(/\D/g, '');
    if (digitos.length < 8 || digitos.length > 13) continue;
    if (/^\d{1,3}(\.\d{3})+$/.test(crudo)) continue; // 1.200.000 es un monto
    const antes = texto.slice(Math.max(0, m.index - 8), m.index);
    const despues = texto.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (RE_MONEDA_ANTES.test(antes) || RE_UNIDAD_DESPUES.test(despues)) continue;
    salida.push(crudo);
  }
  return unicos(salida);
}

function idsDeUrl(url) {
  const ids = [];
  for (const m of url.matchAll(/(?:^|[/=_-])(\d{5,9})(?=[-_/.?&#]|$)/g)) ids.push(m[1]);
  return ids;
}

export function extraerCodigos(texto) {
  const codigos = [];
  for (const m of texto.matchAll(/\b(?:ref(?:erencia)?|c[oó]d(?:igo)?)\.?\s*(?:de referencia)?\s*[:#nº°]*\s*([A-Za-z]{1,6}[-\s]?\d{1,7})\b/gi)) codigos.push(m[1]);
  for (const m of texto.matchAll(/\b([A-Z]{1,6}-\d{2,7})\b/g)) codigos.push(m[1]);
  for (const m of texto.matchAll(/\b([A-Z]{2,6}\d{3,7})\b/g)) codigos.push(m[1]);
  for (const m of texto.matchAll(/\b([a-z]{2,4}-\d{2,7})\b/gi)) codigos.push(m[1]);
  const vistos = new Set();
  return codigos
    .map((c) => c.trim())
    .filter((c) => !PALABRAS_NO_CODIGO.test(normalizarCodigo(c)))
    .filter((c) => {
      const k = normalizarCodigo(c);
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

// Números sueltos de 5 a 8 dígitos que podrían ser un ID de Tokko (se confirman contra el caché).
function extraerNumerosSueltos(texto) {
  const salida = [];
  for (const m of texto.matchAll(/(?<![\d.,])\d{5,8}(?![\d.,])/g)) {
    const antes = texto.slice(Math.max(0, m.index - 8), m.index);
    const despues = texto.slice(m.index + m[0].length, m.index + m[0].length + 10);
    if (RE_MONEDA_ANTES.test(antes) || RE_UNIDAD_DESPUES.test(despues)) continue;
    salida.push(m[0]);
  }
  return unicos(salida);
}

// Detecta barrios y localidades. Primero los nombres más largos, y cada coincidencia se tapa
// para que "canning chico" no cuente también como "canning".
// Si después del nombre viene "chico" y "<nombre> chico" no es un barrio conocido, no se cuenta
// (pasa con "Adrogué Chico", que en Tokko es un barrio distinto de Adrogué).
export function detectarZonas(texto, zonas = []) {
  const alias = [];
  for (const z of zonas) for (const a of z.alias ?? [z.nombre]) alias.push({ alias: normalizar(a), nombre: z.nombre, tipo: z.tipo ?? 'barrio' });
  alias.sort((a, b) => b.alias.length - a.alias.length);
  const conocidos = new Set(alias.map((a) => a.alias));
  let t = ` ${normalizar(texto)} `;
  const encontradas = [];
  const desconocidas = [];
  for (const a of alias) {
    if (!a.alias) continue;
    let i = t.indexOf(` ${a.alias} `);
    while (i !== -1) {
      const fin = i + a.alias.length + 1;
      const siguiente = t.slice(fin + 1).split(' ')[0];
      if (siguiente === 'chico' && !conocidos.has(`${a.alias} chico`)) {
        desconocidas.push(`${a.alias} chico`);
      } else if (!encontradas.some((e) => e.nombre === a.nombre)) {
        encontradas.push({ nombre: a.nombre, tipo: a.tipo });
      }
      t = t.slice(0, i + 1) + '#'.repeat(a.alias.length) + t.slice(fin);
      i = t.indexOf(` ${a.alias} `);
    }
  }
  return { zonas: encontradas, desconocidas: unicos(desconocidas) };
}

function detectar(lista, textoNormalizado) {
  return lista.filter(([, re]) => re.test(textoNormalizado)).map(([nombre]) => nombre);
}

function nombreDePresentacion(texto) {
  const m1 = texto.match(/\b(?:me llamo|mi nombre es)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i);
  if (m1) return capitalizar(m1[1]);
  const m2 = texto.match(/\b[Ss]oy\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
  return m2 ? m2[1] : null;
}

/**
 * @param {object} entrada { texto?, nombre?, telefono?, email?, mensaje?, propiedad? }
 * @param {object} opciones { zonas: [{ nombre, tipo, alias }] }
 */
export function parsearConsulta(entrada = {}, { zonas = [] } = {}) {
  const textoPegado = String(entrada.texto ?? '').replace(/\r\n?/g, '\n');
  const etiquetado = {};
  const lineasLibres = [];
  let autoresWhatsapp = [];
  let campoAbierto = null;

  for (const linea of textoPegado.split('\n')) {
    const wa = linea.match(RE_WHATSAPP);
    if (wa) {
      autoresWhatsapp.push(wa[3].trim());
      lineasLibres.push(wa[4]);
      campoAbierto = null;
      continue;
    }
    const et = etiquetaDe(linea);
    if (et) {
      etiquetado[et.campo] = et.valor;
      campoAbierto = et.campo === 'mensaje' ? 'mensaje' : null;
      continue;
    }
    if (campoAbierto === 'mensaje') {
      etiquetado.mensaje = `${etiquetado.mensaje ?? ''}\n${linea}`.trim();
      continue;
    }
    lineasLibres.push(linea);
  }
  autoresWhatsapp = unicos(autoresWhatsapp);

  const textoLibre = lineasLibres.join('\n').trim();
  const mensaje = String(entrada.mensaje ?? '').trim() || (etiquetado.mensaje ?? '').trim() || textoLibre;
  const textoPropiedad = String(entrada.propiedad ?? '').trim() || etiquetado.propiedad || null;

  // Texto completo donde se buscan referencias a la propiedad.
  const todo = [textoPegado, entrada.mensaje, entrada.propiedad].filter(Boolean).join('\n');
  const urls = unicos([...extraerUrls(todo), etiquetado.url].filter(Boolean));
  let sinUrls = todo;
  for (const u of urls) sinUrls = sinUrls.split(u).join(' ');
  const emails = unicos([String(entrada.email ?? '').trim().toLowerCase(), etiquetado.email?.toLowerCase(), ...extraerEmails(sinUrls)]);
  let sinContacto = sinUrls;
  for (const e of emails) sinContacto = sinContacto.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');

  const telefonos = unicos([String(entrada.telefono ?? '').trim(), etiquetado.telefono, ...extraerTelefonos(sinContacto)]);
  for (const t of telefonos) sinContacto = sinContacto.split(t).join(' ');

  // Autor de WhatsApp: si es un número, es el teléfono; si no, el nombre.
  let nombreWhatsapp = null;
  for (const autor of autoresWhatsapp) {
    if (autor.replace(/\D/g, '').length >= 8) telefonos.push(autor);
    else if (!nombreWhatsapp) nombreWhatsapp = autor;
  }

  const nombreEtiquetado = [etiquetado.nombre, etiquetado.apellido].filter(Boolean).join(' ').trim();
  const nombre = String(entrada.nombre ?? '').trim() || nombreEtiquetado || nombreWhatsapp || nombreDePresentacion(mensaje) || null;

  const codigos = extraerCodigos([sinContacto, etiquetado.codigo].filter(Boolean).join('\n'));
  if (etiquetado.codigo && !codigos.some((c) => normalizarCodigo(c) === normalizarCodigo(etiquetado.codigo))) codigos.unshift(etiquetado.codigo.trim());

  const ids = unicos([...(etiquetado.id ? [etiquetado.id.replace(/\D/g, '')] : []), ...urls.flatMap(idsDeUrl)]);
  const numeros = extraerNumerosSueltos(sinContacto).filter((n) => !ids.includes(n));

  const paraDetectar = normalizar([mensaje, textoPropiedad].filter(Boolean).join(' '));
  const { zonas: zonasEncontradas, desconocidas } = detectarZonas([mensaje, textoPropiedad].filter(Boolean).join(' '), zonas);

  return {
    nombre,
    telefonos: unicos(telefonos),
    emails,
    mensaje,
    textoPropiedad,
    referencias: {
      ids,
      numeros,
      codigos,
      urls,
      zonas: zonasEncontradas,
      zonasDesconocidas: desconocidas,
      tipos: detectar(TIPOS, paraDetectar),
      operaciones: detectar(OPERACIONES, paraDetectar),
    },
  };
}

