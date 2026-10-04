// Utilidades de texto compartidas por el parser, el identificador y el clasificador.

// Minúsculas, sin tildes ni diéresis, signos de puntuación como espacios, espacios simples.
// "¿Está DISPONIBLE la casa de Santa Inés?" -> "esta disponible la casa de santa ines"
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Igual que normalizar pero conserva puntos, barras y guiones (útil para códigos y URLs).
export function normalizarSuave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "EJ-101", "ej 101", "Ej101" -> "EJ101"
export function normalizarCodigo(codigo) {
  return String(codigo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

const formatoNumero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

export function formatearNumero(n) {
  return formatoNumero.format(n);
}

export function formatearPrecio({ moneda, monto }) {
  return `${moneda} ${formatearNumero(monto)}`;
}

// Quita el partido entre paréntesis que agrega Tokko: "Canning (E. Echeverria)" -> "Canning".
export function sinParentesis(texto) {
  return String(texto ?? '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
