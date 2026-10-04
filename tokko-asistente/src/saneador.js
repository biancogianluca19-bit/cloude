// Sanea un JSON crudo de Tokko antes de guardarlo como fixture:
// - borra ramas con información interna o datos de personas (propietarios, productor, sucursal, usuarios)
// - reemplaza mails y teléfonos que aparezcan en cualquier texto
// Se usa solo en scripts/descubrir-campos.js. El normalizador no lo necesita porque trabaja con lista blanca.

const RE_CLAVE_PRIVADA = /(internal|interno|owner|propietari|producer|productor|branch|sucursal|agent|user|contact|commission|comision|key|token|password|email|e_mail|mail|phone|cellphone|telefono|celular|document|dni|cuit|keys_location|real_address)/i;
const RE_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const RE_TELEFONO = /\+?\d[\d\s\-()]{7,}\d/g;

export function sanearValor(valor) {
  if (typeof valor !== 'string') return valor;
  return valor.replace(RE_EMAIL, '[MAIL REDACTADO]').replace(RE_TELEFONO, (m) => (m.replace(/\D/g, '').length >= 8 ? '[TEL REDACTADO]' : m));
}

export function sanearPropiedad(raw) {
  if (Array.isArray(raw)) return raw.map(sanearPropiedad);
  if (raw && typeof raw === 'object') {
    const salida = {};
    for (const [clave, valor] of Object.entries(raw)) {
      if (RE_CLAVE_PRIVADA.test(clave)) {
        salida[clave] = '[OMITIDO: dato interno o personal]';
        continue;
      }
      salida[clave] = sanearPropiedad(valor);
    }
    return salida;
  }
  return sanearValor(raw);
}

// Lista de rutas de campos con su tipo, sin valores. Ej: "operations[].prices[].currency: string".
export function listarCampos(valor, prefijo = '', salida = new Map()) {
  if (Array.isArray(valor)) {
    if (valor.length === 0) salida.set(`${prefijo}[]`, 'array vacío');
    for (const item of valor.slice(0, 3)) listarCampos(item, `${prefijo}[]`, salida);
  } else if (valor && typeof valor === 'object') {
    for (const [clave, v] of Object.entries(valor)) listarCampos(v, prefijo ? `${prefijo}.${clave}` : clave, salida);
  } else {
    const tipo = valor === null ? 'null' : typeof valor;
    const previo = salida.get(prefijo);
    salida.set(prefijo, previo && previo !== tipo ? `${previo}|${tipo}` : tipo);
  }
  return salida;
}
