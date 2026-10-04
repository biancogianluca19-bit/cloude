// Flujo completo: texto pegado -> contacto + propiedad + intenciones + derivación + borrador.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './config.js';
import { parsearConsulta } from './parser.js';
import { identificarPropiedad } from './identificador.js';
import { clasificar, DERIVACIONES, INTENCIONES } from './clasificador.js';
import { generarBorrador } from './borrador.js';
import { registrarConsulta } from './log.js';
import { formatearPrecio } from './texto.js';

export function cargarDatosInmobiliaria(ruta = path.join(RAIZ, 'datos-inmobiliaria.json')) {
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

export function zonasDe(datos) {
  return [
    ...(datos.zonas ?? []).map((z) => ({ ...z, tipo: 'localidad' })),
    ...(datos.barrios ?? []).map((b) => ({ ...b, tipo: 'barrio' })),
  ];
}

function motivo(clave, detalle = null) {
  return { clave, texto: DERIVACIONES[clave], detalle };
}

export function decidirDerivacion({ identificacion, ficha, clasificacion }) {
  const motivos = clasificacion.derivaciones.map((clave) => motivo(clave, 'detectado en el mensaje'));

  if (identificacion.variasEnMensaje) {
    const lista = identificacion.candidatos?.map((c) => c.codigo ?? c.id).filter(Boolean) ?? [];
    motivos.push(motivo('varias_propiedades', lista.length ? `menciona ${lista.join(', ')}` : 'menciona varias propiedades o barrios'));
  }
  if (!ficha) {
    if (identificacion.estado === 'no_encontrada') {
      motivos.push(motivo('no_encontrada', `no la encuentro entre las propiedades publicadas en la API (${identificacion.referenciasNoEncontradas.join(', ')}). Puede estar vendida, reservada o sin publicar: revisar en Tokko`));
    } else if (identificacion.estado === 'candidatos') {
      motivos.push(motivo('ambiguo', 'no pude identificar la propiedad con seguridad. Elegí una de las candidatas o derivá'));
    } else if (identificacion.estado === 'sin_referencia') {
      motivos.push(motivo('ambiguo', 'el mensaje no dice por qué propiedad consulta. Buscala a mano o derivá'));
    }
  } else if (ficha.disponibilidad?.estado === 'no_disponible') {
    motivos.push(motivo('no_disponible', `la ficha figura como "${ficha.disponibilidad.texto}"`));
  }
  const sinPregunta = clasificacion.intenciones.length === 0 && clasificacion.derivaciones.length === 0 && clasificacion.preguntasSinClasificar.length === 0;
  if (ficha && sinPregunta) {
    motivos.push(motivo('ambiguo', 'no encontré una pregunta concreta en el mensaje'));
  }
  // Sin duplicados por clave.
  const vistos = new Set();
  const unicos = motivos.filter((m) => (vistos.has(m.clave) ? false : vistos.add(m.clave)));
  return { derivar: unicos.length > 0, motivos: unicos };
}

export function fichaParaPantalla(ficha) {
  if (!ficha) return null;
  return {
    ...ficha,
    operacionesTexto: (ficha.operaciones ?? []).map((o) => `${o.tipo}: ${o.precios.length ? o.precios.map(formatearPrecio).join(' / ') : 'sin precio publicado'}`),
  };
}

/**
 * @param {object} p
 * @param {object} p.entrada       { texto?, nombre?, telefono?, email?, mensaje?, propiedad? }
 * @param {string|number} [p.propiedadId]  propiedad elegida a mano en la pantalla
 * @param {object} p.repo          repositorio (todas(), buscarPorId())
 * @param {object} p.datos         datos-inmobiliaria.json
 * @param {object} p.config        { modo, camposValidados }
 * @param {boolean} [p.registrar]  escribir la línea de log (id y hora)
 */
export async function analizarConsulta({ entrada, propiedadId = null, repo, datos, config, registrar = true, ahora = () => new Date() }) {
  const consultaId = crypto.randomUUID().slice(0, 8);
  const parseado = parsearConsulta(entrada, { zonas: zonasDe(datos) });
  let identificacion = identificarPropiedad(parseado, repo.todas());

  // Si dio un ID que no está en el caché, se intenta un GET puntual a Tokko (solo en modo live).
  if (identificacion.estado === 'no_encontrada' && parseado.referencias.ids.length === 1 && config.modo === 'live') {
    const remota = await repo.buscarPorId(parseado.referencias.ids[0]);
    if (remota) identificacion = { ...identificacion, estado: 'identificada', propiedad: remota, motivos: ['ID de Tokko (consulta directa)'], referenciasNoEncontradas: [] };
  }

  let ficha = identificacion.propiedad ?? null;
  const eleccionManual = propiedadId !== null && propiedadId !== undefined && propiedadId !== '';
  if (eleccionManual) {
    ficha = await repo.buscarPorId(propiedadId);
    if (ficha) identificacion = { ...identificacion, estado: 'identificada', propiedad: ficha, motivos: ['elegida a mano'], referenciasNoEncontradas: [] };
  }

  const clasificacion = clasificar(parseado.mensaje);
  const derivacion = decidirDerivacion({ identificacion, ficha, clasificacion });
  const borrador = generarBorrador({
    nombre: parseado.nombre,
    ficha,
    identificacion,
    clasificacion,
    derivacion,
    mensaje: parseado.mensaje,
    datos,
    contexto: { modo: config.modo, camposValidados: config.camposValidados },
  });

  if (registrar) registrarConsulta({ hora: ahora().toISOString(), consultaId, propiedadId: ficha?.id ?? null });

  return {
    consultaId,
    contacto: { nombre: parseado.nombre, telefonos: parseado.telefonos, emails: parseado.emails },
    mensaje: parseado.mensaje,
    referencias: parseado.referencias,
    identificacion: {
      estado: identificacion.estado,
      motivos: identificacion.motivos ?? [],
      candidatos: identificacion.candidatos ?? [],
      referenciasNoEncontradas: identificacion.referenciasNoEncontradas ?? [],
      zonasDesconocidas: identificacion.zonasDesconocidas ?? [],
    },
    ficha: fichaParaPantalla(ficha),
    intenciones: clasificacion.intenciones.map((i) => ({ clave: i, texto: INTENCIONES[i] })),
    caracteristicasPedidas: clasificacion.caracteristicas,
    derivacion,
    borrador,
    modo: config.modo,
    sinValidar: !config.camposValidados,
  };
}
