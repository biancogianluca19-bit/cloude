// GET  /api/cuenta                              sesión actual
// POST /api/cuenta {accion: 'registrar', usuario, contrasena, nombre}
// POST /api/cuenta {accion: 'entrar', usuario, contrasena}
// POST /api/cuenta {accion: 'cambiar', actual, nueva}          (con sesión)
// POST /api/cuenta {accion: 'telegram'}                       (con sesión) link para vincular el bot
// POST /api/cuenta {accion: 'traspasar', claveVieja}          (con sesión) pasa los datos de antes de las cuentas
const cuentas = require('../lib/cuentas');
const { responder, sesionDe, leerJSON, iguales } = require('../lib/http');

let usuarioBot = null;
async function nombreDelBot() {
  if (usuarioBot || !process.env.TELEGRAM_TOKEN) return usuarioBot;
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getMe`).then(x => x.json()).catch(() => null);
  usuarioBot = r && r.ok ? r.result.username : null;
  return usuarioBot;
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const s = await sesionDe(req, res);
      if (s) responder(res, 200, s);
      return;
    }
    if (req.method !== 'POST') return responder(res, 405, { error: 'Método no permitido.' });
    const b = await leerJSON(req);
    if (b.accion === 'registrar') return responder(res, 200, await cuentas.registrar(b.usuario, b.contrasena, b.nombre));
    if (b.accion === 'entrar') return responder(res, 200, await cuentas.entrar(b.usuario, b.contrasena));

    const s = await sesionDe(req, res);
    if (!s) return;
    if (b.accion === 'cambiar') return responder(res, 200, await cuentas.cambiarContrasena(s.usuario, b.actual, b.nueva));
    if (b.accion === 'telegram') {
      const bot = await nombreDelBot();
      if (!bot) return responder(res, 503, { error: 'El bot de Telegram no está configurado.' });
      const codigo = await cuentas.codigoTelegram(s.usuario);
      return responder(res, 200, { link: `https://t.me/${bot}?start=${codigo}`, bot });
    }
    if (b.accion === 'traspasar') {
      const clave = process.env.CLAVE_WEB;
      if (!clave || !b.claveVieja || !iguales(b.claveVieja, clave)) return responder(res, 403, { error: 'La clave anterior no coincide.' });
      return responder(res, 200, await cuentas.traspasarDatosViejos(s.usuario));
    }
    responder(res, 400, { error: 'Acción desconocida.' });
  } catch (e) {
    if (!e.estado) console.error(e);
    responder(res, e.estado || 500, { error: e.message || 'Error del servidor.' });
  }
};
