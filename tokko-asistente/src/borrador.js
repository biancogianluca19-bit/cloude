// Generador de borradores para WhatsApp. Plantillas fijas, sin IA.
//
// Reglas:
// - Solo usa datos de la ficha (y los requisitos de alquiler de datos-inmobiliaria.json).
// - Todo dato que falta va como "[A CONFIRMAR: ...]" en el texto y también en la lista aConfirmar.
// - No promete precio, disponibilidad ni horarios: dice "valor publicado", "según nuestra ficha"
//   y pide confirmación en los avisos.
// - No usa adjetivos ni copia la descripción ni el título de la publicación.
// - Si hay que derivar, el borrador solo acusa recibo y la nota interna explica el motivo.

import { formatearNumero, formatearPrecio, normalizar } from './texto.js';

const ARTICULO_TIPO = {
  casa: ['la casa', 'la'],
  departamento: ['el departamento', 'lo'],
  terreno: ['el lote', 'lo'],
  lote: ['el lote', 'lo'],
  ph: ['el PH', 'lo'],
  local: ['el local', 'lo'],
  oficina: ['la oficina', 'la'],
  quinta: ['la quinta', 'la'],
  galpon: ['el galpón', 'lo'],
  cochera: ['la cochera', 'la'],
};

const RE_DIA_U_HORA = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|finde|fin de semana|\d{1,2}\s*(hs|h|am|pm)|\d{1,2}:\d{2}|a la tarde|a la noche|al mediodia)\b/;

function plural(n, singular, pluralTexto) {
  return `${formatearNumero(n)} ${n === 1 ? singular : pluralTexto}`;
}

function unirLista(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

function horaArgentina(iso) {
  if (!iso) return 'sin hora';
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
}

function primerNombre(nombre) {
  const limpio = String(nombre ?? '').trim();
  if (!limpio || /@|\d{4,}/.test(limpio)) return null;
  const primero = limpio.split(/\s+/)[0];
  return primero[0].toUpperCase() + primero.slice(1).toLowerCase();
}

export function articuloDe(ficha) {
  const tipo = normalizar(ficha?.tipo ?? '');
  return ARTICULO_TIPO[tipo] ?? ['la propiedad', 'la'];
}

// Tokko escribe algunos nombres sin tilde ("Adrogue", "Santa Ines"). Si el nombre coincide con un barrio
// o localidad de datos-inmobiliaria.json, se usa la forma de ese archivo. Solo cambia la ortografía:
// "Canning Chico" sigue siendo "Canning Chico" porque es otro alias.
export function ubicacionVisible(ficha, datos = {}) {
  const texto = ficha.ubicacion?.texto;
  if (!texto) return null;
  const nombres = [...(datos.barrios ?? []), ...(datos.zonas ?? [])];
  return texto
    .split(',')
    .map((parte) => {
      const p = normalizar(parte);
      const encontrado = nombres.find((z) => normalizar(z.nombre) === p);
      return encontrado ? encontrado.nombre : parte.trim();
    })
    .join(', ');
}

// "la casa en venta en Santa Juana, Canning (ref. EJ-101)". Sin adjetivos ni título de la publicación.
export function descripcionNeutra(ficha, datos = {}) {
  const [articulo] = articuloDe(ficha);
  const ops = (ficha.operaciones ?? []).map((o) => o.tipo.toLowerCase());
  const partes = [articulo];
  const ubicacion = ubicacionVisible(ficha, datos);
  if (ops.length) partes.push(`en ${unirLista(ops)}`);
  if (ubicacion) partes.push(`en ${ubicacion}`);
  let texto = partes.join(' ');
  if (ficha.codigo) texto += ` (ref. ${ficha.codigo})`;
  return texto;
}

function saludo(nombre, datos) {
  const tono = datos.tono ?? {};
  const pn = primerNombre(nombre);
  let linea = pn
    ? (tono.saludo || 'Hola {nombre}, ¿cómo estás?').replace('{nombre}', pn)
    : tono.saludoSinNombre || 'Hola, ¿cómo estás?';
  if (tono.usarEmojis) linea += ' 👋';
  return linea;
}

function firma(datos) {
  const f = datos.firma ?? {};
  const inmobiliaria = datos.inmobiliaria?.nombre ?? '';
  if (f.texto) return f.texto;
  if (f.asesor) return `${f.asesor} | ${inmobiliaria}`;
  return inmobiliaria;
}

function esBarrioCerrado(ficha, datos) {
  if (ficha.ubicacion?.barrioCerrado) return true;
  const nombre = normalizar(ficha.ubicacion?.texto?.split(',')[0] ?? '');
  const barrio = (datos.barrios ?? []).find((b) => normalizar(b.nombre) === nombre);
  if (barrio) return barrio.cerrado !== false;
  const localidad = (datos.zonas ?? []).find((z) => normalizar(z.nombre) === nombre);
  if (localidad) return false;
  return null;
}

function puedeDarDireccion(ficha, datos) {
  const regla = datos.privacidad?.direccionExacta ?? 'nunca';
  if (regla === 'siempre') return true;
  if (regla === 'solo_fuera_de_barrios_cerrados') return esBarrioCerrado(ficha, datos) === false;
  return false;
}

function crearAcumulador() {
  const aConfirmar = [];
  const avisos = [];
  return {
    aConfirmar,
    avisos,
    marcar(clave, texto) {
      if (!aConfirmar.some((a) => a.clave === clave)) aConfirmar.push({ clave, texto });
      return `[A CONFIRMAR: ${texto}]`;
    },
    avisar(texto) {
      if (!avisos.includes(texto)) avisos.push(texto);
    },
  };
}

function textoPrecio(ficha, acc) {
  const conPrecio = (ficha.operaciones ?? []).filter((o) => o.precios.length);
  if (ficha.precioPublicado === false || conPrecio.length === 0) {
    return `Sobre el valor, ${acc.marcar('precio', 'precio')}.`;
  }
  acc.avisar('precio_tokko');
  if (conPrecio.length === 1) {
    const op = conPrecio[0];
    const valores = op.precios.map(formatearPrecio).join(' / ');
    return /alquiler/i.test(op.tipo) ? `El valor publicado del alquiler es ${valores}.` : `El valor publicado es ${valores}.`;
  }
  return `Valores publicados: ${conPrecio.map((o) => `${o.tipo.toLowerCase()} ${o.precios.map(formatearPrecio).join(' / ')}`).join(', ')}.`;
}

function textoUbicacion(ficha, datos, acc) {
  if (!ficha.ubicacion?.texto) return `Sobre la ubicación, ${acc.marcar('ubicacion', 'ubicación')}.`;
  let texto = `Está en ${ubicacionVisible(ficha, datos)}.`;
  if (puedeDarDireccion(ficha, datos) && ficha.direccion) texto += ` La dirección es ${ficha.direccion}.`;
  else texto += ' La dirección exacta te la pasamos al coordinar la visita.';
  return texto;
}

const AMBIENTES = [
  { intencion: 'ambientes', campo: 'ambientes', singular: 'ambiente', plural: 'ambientes', falta: 'cantidad de ambientes' },
  { intencion: 'dormitorios', campo: 'dormitorios', singular: 'dormitorio', plural: 'dormitorios', falta: 'cantidad de dormitorios' },
  { intencion: 'banos', campo: 'banos', singular: 'baño', plural: 'baños', falta: 'cantidad de baños' },
  { intencion: 'cocheras', campo: 'cocheras', singular: 'cochera', plural: 'cocheras', falta: 'si tiene cochera y cuántas' },
];

function textoAmbientes(ficha, pedidos, acc, { marcarFaltantes = true } = {}) {
  const partes = [];
  const faltantes = [];
  for (const def of AMBIENTES) {
    if (!pedidos.includes(def.intencion)) continue;
    const n = ficha[def.campo];
    if (n) {
      partes.push(plural(n, def.singular, def.plural));
      if (def.campo === 'banos' && ficha.toilettes) partes.push(plural(ficha.toilettes, 'toilette', 'toilettes'));
    } else if (marcarFaltantes) {
      faltantes.push(`${def.plural[0].toUpperCase()}${def.plural.slice(1)}: ${acc.marcar(def.campo, def.falta)}.`);
    }
  }
  const lineas = [];
  if (partes.length) lineas.push(`Tiene ${unirLista(partes)}.`);
  lineas.push(...faltantes);
  return lineas;
}

function textoSuperficie(ficha, acc, { marcarFaltantes = true } = {}) {
  const s = ficha.superficies ?? {};
  if (normalizar(ficha.tipo ?? '') === 'terreno' && (s.terreno || s.total)) {
    return `Tiene una superficie de ${formatearNumero(s.terreno || s.total)} m².`;
  }
  const partes = [];
  if (s.cubierta) partes.push(`${formatearNumero(s.cubierta)} m² cubiertos`);
  if (s.semicubierta) partes.push(`${formatearNumero(s.semicubierta)} m² semicubiertos`);
  if (s.terreno) partes.push(`un terreno de ${formatearNumero(s.terreno)} m²`);
  else if (s.total) partes.push(`una superficie total de ${formatearNumero(s.total)} m²`);
  if (partes.length) return `Tiene ${unirLista(partes)}.`;
  return marcarFaltantes ? `Sobre la superficie, ${acc.marcar('superficie', 'metros cuadrados')}.` : null;
}

function textoCaracteristica(c, ficha, acc) {
  const valor = { mascotas: ficha.aptoMascotas, pileta: ficha.pileta, apto_credito: ficha.aptoCredito }[c.clave];
  if (c.clave === 'mascotas') {
    if (valor === true) return 'Según la ficha, acepta mascotas.';
    if (valor === false) return 'Según la ficha, no acepta mascotas.';
    return `Sobre mascotas, ${acc.marcar('mascotas', 'si acepta mascotas')}.`;
  }
  if (c.clave === 'pileta') {
    if (valor === true) return 'Según la ficha, tiene pileta.';
    if (valor === false) return 'Según la ficha, no tiene pileta.';
    return `Sobre la pileta, ${acc.marcar('pileta', 'si tiene pileta')}.`;
  }
  if (c.clave === 'apto_credito') {
    if (valor === true) return 'La propiedad figura como apta crédito.';
    if (valor === false) return 'La propiedad figura como no apta crédito.';
    return `Sobre si es apta crédito, ${acc.marcar('apto_credito', 'si es apta crédito')}.`;
  }
  const nombre = normalizar(c.nombre);
  const tieneTag = (ficha.caracteristicas ?? []).some((t) => normalizar(t).includes(nombre));
  if (tieneTag) return `Según la ficha, tiene ${c.nombre}.`;
  return `Sobre ${c.nombre}, ${acc.marcar(c.clave, `si tiene ${c.nombre}`)}.`;
}

function textoRequisitos(ficha, datos, acc) {
  const esAlquiler = (ficha.operaciones ?? []).some((o) => /alquiler/i.test(o.tipo));
  if (!esAlquiler) {
    return [`Sobre los costos y condiciones de la operación, ${acc.marcar('condiciones_venta', 'condiciones y honorarios de la venta')}.`];
  }
  const items = datos.requisitosAlquiler?.items ?? [];
  if (!items.length) return [`Sobre los requisitos para alquilar, ${acc.marcar('requisitos_alquiler', 'requisitos de alquiler')}.`];
  acc.avisar('VERIFICAR IMPORTES ANTES DE ENVIAR: el borrador incluye requisitos y costos de alquiler de referencia (datos-inmobiliaria.json).');
  return ['Para alquilar, los requisitos son:', ...items.map((i) => `- ${i.texto}`)];
}

function cierreVisita(ficha, clasificacion, mensaje, datos, acc) {
  const [, pronombre] = articuloDe(ficha);
  const horarios = datos.visitas?.horarios ?? [];
  const pidioVisita = clasificacion.intenciones.includes('visita');
  const proponeDia = pidioVisita && RE_DIA_U_HORA.test(normalizar(mensaje));
  if (proponeDia) {
    return `Sobre la visita, ${acc.marcar('visita', 'si se puede el día u horario que propone el cliente')}.`;
  }
  const textoHorarios = horarios.length ? ` Los horarios de visita son ${unirLista(horarios)}.` : '';
  const pregunta = horarios.length ? '¿Qué día te queda cómodo?' : '¿Qué día y horario te quedan cómodos?';
  if (pidioVisita) {
    return horarios.length
      ? `Para coordinar la visita: los horarios son ${unirLista(horarios)}. ¿Qué día te queda cómodo?`
      : 'Para coordinar la visita, ¿qué día y horario te quedan cómodos?';
  }
  return `Si querés conocer${pronombre}, coordinamos una visita.${textoHorarios} ${pregunta}`;
}

function generarDerivacion({ nombre, ficha, identificacion, derivacion, datos }) {
  const unaSola = ficha && !derivacion.motivos.some((m) => ['no_encontrada', 'varias_propiedades'].includes(m.clave));
  const referencia = unaSola ? ` por ${descripcionNeutra(ficha, datos)}` : '';
  const esReclamo = derivacion.motivos.some((m) => m.clave === 'reclamo');
  const cuerpo = esReclamo
    ? 'Recibimos tu mensaje y lo está viendo un asesor, que te responde por este medio.'
    : `Gracias por escribirnos${referencia}. Recibimos tu consulta y la está viendo un asesor, que te responde por este medio.`;
  // En un reclamo no se pregunta "¿cómo estás?".
  const pn = primerNombre(nombre);
  const inicio = esReclamo ? (pn ? `Hola ${pn}.` : 'Hola.') : saludo(nombre, datos);
  const texto = [inicio, cuerpo, firma(datos)].join('\n\n');

  const detalles = derivacion.motivos.map((m) => `- ${m.texto}${m.detalle ? `: ${m.detalle}` : ''}`);
  const notaInterna = ['DERIVAR A PERSONA.', ...detalles].join('\n');
  return { texto, aConfirmar: [], avisos: [], notaInterna, identificacion: identificacion?.estado ?? null };
}

/**
 * @param {object} p
 * @param {string|null} p.nombre        nombre del contacto
 * @param {object|null} p.ficha         ficha normalizada
 * @param {object} p.clasificacion      salida de clasificar()
 * @param {object} p.derivacion         { derivar, motivos: [{ clave, texto, detalle }] }
 * @param {string} p.mensaje            mensaje del cliente
 * @param {object} p.datos              datos-inmobiliaria.json
 * @param {object} p.contexto           { modo, camposValidados }
 */
export function generarBorrador({ nombre, ficha, identificacion, clasificacion, derivacion, mensaje, datos, contexto = {} }) {
  if (derivacion.derivar || !ficha) return generarDerivacion({ nombre, ficha, identificacion, derivacion, datos });

  const acc = crearAcumulador();
  const pide = (i) => clasificacion.intenciones.includes(i);
  const respuestas = [];

  if (pide('disponibilidad')) {
    if (ficha.disponibilidad?.estado === 'disponible') {
      respuestas.push('Por lo que figura en nuestra ficha, está disponible.');
      acc.avisar('disponibilidad_tokko');
    } else {
      respuestas.push(`Sobre la disponibilidad, ${acc.marcar('disponibilidad', 'si sigue disponible')}.`);
    }
  }
  if (pide('precio')) respuestas.push(textoPrecio(ficha, acc));
  if (pide('expensas')) {
    if (ficha.expensas?.monto && ficha.expensas.moneda) respuestas.push(`Las expensas figuran en ${formatearPrecio({ moneda: ficha.expensas.moneda, monto: ficha.expensas.monto })}.`);
    else if (ficha.expensas?.monto) respuestas.push(`Las expensas figuran en ${formatearNumero(ficha.expensas.monto)} ${acc.marcar('moneda_expensas', 'moneda de las expensas')}.`);
    else respuestas.push(`Sobre las expensas, ${acc.marcar('expensas', 'valor de las expensas')}.`);
  }
  if (pide('ubicacion')) respuestas.push(textoUbicacion(ficha, datos, acc));
  respuestas.push(...textoAmbientes(ficha, clasificacion.intenciones, acc));
  if (pide('superficie')) respuestas.push(textoSuperficie(ficha, acc));
  for (const c of clasificacion.caracteristicas ?? []) respuestas.push(textoCaracteristica(c, ficha, acc));
  if (pide('requisitos_alquiler')) respuestas.push(...textoRequisitos(ficha, datos, acc));

  // Pedido general ("me interesa, ¿me pasás info?"): resumen con lo que tenga la ficha.
  if (pide('info_general')) {
    if (!pide('precio')) respuestas.push(textoPrecio(ficha, acc));
    if (!pide('ubicacion') && ficha.ubicacion?.texto) respuestas.push(textoUbicacion(ficha, datos, acc));
    const yaPedidos = AMBIENTES.map((a) => a.intencion).filter(pide);
    const resto = AMBIENTES.map((a) => a.intencion).filter((i) => !yaPedidos.includes(i));
    respuestas.push(...textoAmbientes(ficha, resto, acc, { marcarFaltantes: false }));
    if (!pide('superficie')) {
      const sup = textoSuperficie(ficha, acc, { marcarFaltantes: false });
      if (sup) respuestas.push(sup);
    }
  }

  for (const pregunta of clasificacion.preguntasSinClasificar ?? []) {
    respuestas.push(acc.marcar(`pregunta:${pregunta}`, `respuesta a «${pregunta}»`));
  }

  const texto = [
    saludo(nombre, datos),
    `Gracias por consultar por ${descripcionNeutra(ficha, datos)}.`,
    respuestas.join('\n'),
    cierreVisita(ficha, clasificacion, mensaje, datos, acc),
    firma(datos),
  ].filter(Boolean).join('\n\n');

  // Avisos legibles.
  const avisos = [];
  const hora = horaArgentina(ficha.sincronizado);
  const usaPrecio = acc.avisos.includes('precio_tokko');
  const usaDisp = acc.avisos.includes('disponibilidad_tokko');
  if (usaPrecio || usaDisp) {
    const fuente = usaDisp && ficha.disponibilidad?.fuente ? ` (${ficha.disponibilidad.fuente})` : '';
    const sujeto = usaPrecio && usaDisp ? 'El precio y la disponibilidad salen' : usaPrecio ? 'El precio sale' : 'La disponibilidad sale';
    avisos.push(`${sujeto} de Tokko${fuente}, dato de las ${hora}. Confirmá antes de enviar.`);
  }
  avisos.push(...acc.avisos.filter((a) => !['precio_tokko', 'disponibilidad_tokko'].includes(a)));
  if (contexto.modo === 'mock') avisos.push('Modo mock: la ficha es un EJEMPLO, no una propiedad real.');
  if (!contexto.camposValidados) avisos.push('Campos de Tokko SIN VALIDAR contra la API real: revisá los números contra la ficha en Tokko antes de enviar.');

  return { texto, aConfirmar: acc.aConfirmar, avisos, notaInterna: null };
}

