// Cálculo del estado del presupuesto mensual por categoría.
// Lo usan la página web y el bot de WhatsApp. Solo cuenta gastos en pesos.
(function (raiz) {
  const CERCA = 0.8;

  // items: movimientos del mes. topes: { categoria: monto mensual en pesos }.
  function estado(items, topes) {
    const gastado = {};
    for (const x of items || []) {
      if (x.tipo !== 'gasto' || x.moneda === 'USD') continue;
      gastado[x.cat] = (gastado[x.cat] || 0) + x.monto;
    }
    const cats = new Set([...Object.keys(gastado), ...Object.keys(topes || {})]);
    const filas = [];
    for (const cat of cats) {
      const g = gastado[cat] || 0;
      const tope = topes && topes[cat] > 0 ? topes[cat] : 0;
      const pct = tope ? g / tope : null;
      const nivel = !tope ? 'sin-tope' : pct >= 1 ? 'pasado' : pct >= CERCA ? 'cerca' : 'ok';
      filas.push({ cat, gastado: g, tope, pct, nivel, resta: tope ? tope - g : null });
    }
    filas.sort((a, b) => (b.tope ? 1 : 0) - (a.tope ? 1 : 0) || (b.pct || 0) - (a.pct || 0) || b.gastado - a.gastado);
    const conTope = filas.filter(f => f.tope);
    return {
      filas,
      totalTope: conTope.reduce((s, f) => s + f.tope, 0),
      totalGastadoConTope: conTope.reduce((s, f) => s + f.gastado, 0),
      alertas: conTope.filter(f => f.nivel === 'pasado' || f.nivel === 'cerca'),
    };
  }

  const Presupuesto = { estado, CERCA };
  if (typeof module === 'object' && module.exports) module.exports = Presupuesto;
  else raiz.Presupuesto = Presupuesto;
})(typeof self !== 'undefined' ? self : this);
