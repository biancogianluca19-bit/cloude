// GET  /api/ajustes                         palabras aprendidas y presupuestos
// POST /api/ajustes {aprender?, olvidar?, presupuestos?}
const datos = require('../lib/datos');
const { responder, autorizado, leerJSON } = require('../lib/http');

module.exports = async (req, res) => {
  if (!autorizado(req, res)) return;
  try {
    if (req.method === 'POST') {
      const b = await leerJSON(req);
      if (b.olvidar) await datos.olvidar();
      if (b.aprender) await datos.aprender(b.aprender);
      if (b.presupuestos) await datos.fijarPresupuestos(b.presupuestos);
    } else if (req.method !== 'GET') {
      return responder(res, 405, { error: 'Método no permitido.' });
    }
    responder(res, 200, await datos.ajustes());
  } catch (e) {
    console.error(e);
    responder(res, 500, { error: e.message || 'Error del servidor.' });
  }
};
