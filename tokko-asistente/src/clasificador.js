// Clasifica qué pregunta el cliente y detecta los temas que se derivan a una persona.
// Trabaja sobre el texto normalizado (minúsculas, sin tildes: "baño" -> "bano", "seña" -> "sena").
// Las expresiones contemplan errores comunes ("presio", "kiero", "vicita", "q").

import { normalizar } from './texto.js';

export const INTENCIONES = {
  disponibilidad: 'Disponibilidad',
  precio: 'Precio',
  expensas: 'Expensas',
  ubicacion: 'Ubicación',
  ambientes: 'Ambientes',
  dormitorios: 'Dormitorios',
  banos: 'Baños',
  cocheras: 'Cocheras',
  superficie: 'Superficie',
  caracteristicas: 'Características',
  visita: 'Coordinar visita',
  requisitos_alquiler: 'Requisitos de alquiler',
  info_general: 'Pedido de información general',
};

const REGLAS_INTENCION = [
  ['disponibilidad', /\b(disponib\w*|dispo|sigue(n)? (en venta|en alquiler|disponible|vigente|publicad\w*|estando)|todavia (esta|la tienen|lo tienen|se vende|se alquila|sigue|esta disponible)|se vendio|se alquilo|ya (se )?(vendio|alquilo|vendieron|alquilaron)|esta (libre|reservad\w*|vendid\w*|alquilad\w*)|sigue\s*$|la tienen todavia|esta vigente)\b/],
  ['precio', /\b(pre[cs]io\w*|valor|cuesta|cotizacion|cuanto (sale|cuesta|esta|piden|vale|es|seria|saldria|pagaria)|que (precio|valor)|cuanto\s*$|sale\s*$|en cuanto (esta|sale))\b/],
  ['expensas', /\b(expensas?|expenzas?|espensas?)\b/],
  ['ubicacion', /\b(donde (queda|esta|es|se ubica)|ubicacion|ubicad\w*|direccion|que barrio|en que (barrio|zona|calle|parte)|que zona|calle|como (llego|se llega)|maps|altura)\b/],
  ['ambientes', /\b(ambientes?|amb)\b/],
  ['dormitorios', /\b(dormitorios?|dormis?|habitacion(es)?|cuartos?|piezas?|dorm)\b/],
  ['banos', /\b(banos?|banio|toilettes?|toilets?)\b/],
  ['cocheras', /\b(cocheras?|garages?|garajes?|estacionamiento|lugar para (el |los )?autos?|guardar (el )?auto)\b/],
  ['superficie', /\b(metros|m2|mts2?|mt2|superficie|cubiertos?|medidas|dimensiones|metraje|cuanto mide|que mide|de terreno|tamano)\b/],
  ['visita', /\b([vb]i[scz]it\w*|ver(la|lo)|conocer(la|lo)|conoser(la|lo)|ir a ver|pasar a ver|recorrer(la|lo)?|mostrar(la|lo|nos|me)|coordinar|cuando (se )?(puede|podria|podemos) (ver|ir|pasar)|que dia|que horario|cita)\b/],
  ['requisitos_alquiler', /\b(requisitos?|garantias?|garante|que (piden|necesito|hace falta) para alquilar|deposito|honorarios|comision|recibos? de sueldo|seguro de caucion|caucion|mes de adelanto|adelanto|para entrar|costos de entrada|sellado|certificados?|que papeles (necesito|piden))\b/],
  ['info_general', /\b(info|informacion|mas datos|detalles|me interesa|interesad\w*|quisiera saber|quiero saber|kiero saber|mas info|me pasas|me pasan|me podrian pasar|caracteristicas)\b/],
];

// Características puntuales que se responden con la ficha.
export const CARACTERISTICAS = [
  { clave: 'mascotas', nombre: 'mascotas', re: /\b(mascotas?|perros?|gatos?|perrito|gatito|animales)\b/ },
  { clave: 'pileta', nombre: 'pileta', re: /\b(pileta|piscina|pile)\b/ },
  { clave: 'apto_credito', nombre: 'apto crédito', re: /\b(apto\s*(a\s*)?credito|apta\s*credito|acepta(n)? credito|sirve para (un )?credito)\b/ },
  { clave: 'parrilla', nombre: 'parrilla', re: /\bparrilla\b/ },
  { clave: 'quincho', nombre: 'quincho', re: /\bquincho\b/ },
  { clave: 'jardin', nombre: 'jardín', re: /\b(jardin|parque)\b/ },
  { clave: 'patio', nombre: 'patio', re: /\bpatio\b/ },
  { clave: 'balcon', nombre: 'balcón', re: /\bbalcon\b/ },
  { clave: 'amoblado', nombre: 'amoblado', re: /\b(amoblad\w*|amueblad\w*|muebles)\b/ },
  { clave: 'aire_acondicionado', nombre: 'aire acondicionado', re: /\b(aire acondicionado|aires acondicionados|split)\b/ },
  { clave: 'calefaccion', nombre: 'calefacción', re: /\b(calefaccion|losa radiante|radiadores)\b/ },
  { clave: 'gas', nombre: 'gas natural', re: /\b(gas natural|tiene gas|hay gas)\b/ },
  { clave: 'cloacas', nombre: 'cloacas', re: /\bcloacas?\b/ },
  { clave: 'agua', nombre: 'agua corriente', re: /\b(agua corriente|agua de red)\b/ },
  { clave: 'seguridad', nombre: 'seguridad', re: /\b(seguridad|vigilancia)\b/ },
  { clave: 'lavadero', nombre: 'lavadero', re: /\blavadero\b/ },
];

export const DERIVACIONES = {
  negociacion: 'Negociación de precio u oferta',
  reserva: 'Reserva o seña',
  documentacion: 'Documentación, escritura o tema legal',
  financiacion: 'Financiación o crédito',
  reclamo: 'Reclamo',
  no_disponible: 'La propiedad no figura disponible',
  no_encontrada: 'No encuentro la propiedad en Tokko',
  ambiguo: 'Mensaje ambiguo',
  varias_propiedades: 'La consulta menciona más de una propiedad',
};

const RE_NEGOCIACION = /\b(ofert\w*|ofrezco|ofrecer|ofrecemos|le ofrezco|te ofrezco|negociable|negocia\w*|rebaj\w*|descuento|ultimo precio|mejor precio|precio final|acepta(n|s|rian)? (\d+|u\$s|usd|dolares)|contraoferta|permuta\w*|tomas? (mi )?(auto|propiedad|depto|casa)|se puede hablar|regate\w*|bajar el precio|baja(n|s)? (algo|el precio)|(la|lo) deja(n|s|rian)? en|en cuanto (la|lo) deja(n|s)|por menos|algo menos|un poco menos|charlar el precio|hablar el precio)\b/;
const RE_RESERVA = /\b(senar\w*|sena|senia|senal|reservar(la|lo)?|hacer (una |la )?reserva|dejar (una |la )?(sena|reserva|senal)|boleto de reserva|quiero reservar)\b/;
const RE_RESERVA_VISITA = /\breservar (un |una |el |la )?(turno|visita|horario|cita|dia)\b/;
const RE_DOCUMENTACION = /\b(escritur\w*|escriban\w*|titulo|documentacion|papeles (en regla|al dia)|tiene (los )?papeles|esta todo en regla|sucesion|boleto( de compraventa)?|abogad\w*|legal\w*|contrato|planos (aprobados|municipales)|final de obra|hipotecad\w*|embargad\w*|inhibicion|inhibid\w*|posesion|usucapion|cesion|fideicomiso|libre deuda|deudas?|subdivision|mensura)\b/;
const RE_FINANCIACION = /\b(financ\w*|cuotas?|credito\w*|hipotecario|prestamo|banco|anticipo|plan de pagos|pagar en partes|uva|procrear)\b/;
const RE_RECLAMO = /\b(reclam\w*|queja|denuncia\w*|estafa\w*|nadie (me )?(contesta|responde)|no me (contestan|responden|respondieron|contestaron|llamaron|devolvieron)|pesim\w*|mala atencion|verguenza|indignad\w*|devolucion|devuelvan|me cobraron|soy (el |la )?inquilin\w*|como inquilin\w*|se rompio|no funciona|el propietario no)\b/;

function detectarDerivaciones(t) {
  const motivos = [];
  if (RE_NEGOCIACION.test(t)) motivos.push('negociacion');
  if (RE_RESERVA.test(t) && !RE_RESERVA_VISITA.test(t)) motivos.push('reserva');
  if (RE_DOCUMENTACION.test(t)) motivos.push('documentacion');
  // "¿Es apto crédito?" es una característica de la ficha; cualquier otra mención de crédito o financiación se deriva.
  const sinAptoCredito = t.replace(CARACTERISTICAS.find((c) => c.clave === 'apto_credito').re, ' ');
  if (RE_FINANCIACION.test(sinAptoCredito)) motivos.push('financiacion');
  if (RE_RECLAMO.test(t)) motivos.push('reclamo');
  return motivos;
}

// Separa en oraciones y devuelve las preguntas que no matchean ninguna intención conocida.
function preguntasSinClasificar(mensaje) {
  const oraciones = String(mensaje)
    .split(/(?<=[?¿!.\n])\s*/)
    .map((o) => o.trim())
    .filter((o) => o.includes('?'));
  return oraciones.filter((o) => {
    const t = normalizar(o);
    if (!t) return false;
    const conocida = REGLAS_INTENCION.some(([, re]) => re.test(t)) || CARACTERISTICAS.some((c) => c.re.test(t));
    const derivada = detectarDerivaciones(t).length > 0;
    return !conocida && !derivada;
  });
}

export function clasificar(mensaje) {
  const t = normalizar(mensaje);
  const intenciones = REGLAS_INTENCION.filter(([, re]) => re.test(t)).map(([clave]) => clave);
  const caracteristicas = CARACTERISTICAS.filter((c) => c.re.test(t)).map(({ clave, nombre }) => ({ clave, nombre }));
  if (caracteristicas.length) intenciones.push('caracteristicas');
  return {
    intenciones: [...new Set(intenciones)],
    caracteristicas,
    derivaciones: detectarDerivaciones(t),
    preguntasSinClasificar: preguntasSinClasificar(mensaje),
    vacio: t.length === 0,
  };
}
