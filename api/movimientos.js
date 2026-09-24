// GET    /api/movimientos?mes=AAAA-MM      movimientos del mes
// POST   /api/movimientos {items}          agrega movimientos
// PUT    /api/movimientos {item, mesAnterior}
// DELETE /api/movimientos?id=...&mes=AAAA-MM
const datos = require('../lib/datos');
const { responder, autorizado, leerJSON } = require('../lib/http');

module.exports = async (req, res) => {
  if (!autorizado(req, res)) return;
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET') {
      return responder(res, 200, { items: await datos.itemsMes(url.searchParams.get('mes') || '') });
    }
    if (req.method === 'POST') {
      const b = await leerJSON(req);
      const items = await datos.agregar(Array.isArray(b.items) ? b.items.slice(0, 100) : [], 'web');
      return responder(res, 200, { items });
    }
    if (req.method === 'PUT') {
      const b = await leerJSON(req);
      const item = await datos.actualizar(b.item, b.mesAnterior);
      return item ? responder(res, 200, { item }) : responder(res, 400, { error: 'Movimiento inválido.' });
    }
    if (req.method === 'DELETE') {
      await datos.borrar(url.searchParams.get('id') || '', url.searchParams.get('mes') || '');
      return responder(res, 200, { ok: true });
    }
    responder(res, 405, { error: 'Método no permitido.' });
  } catch (e) {
    console.error(e);
    responder(res, 500, { error: e.message || 'Error del servidor.' });
  }
};
