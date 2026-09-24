const crypto = require('crypto');

function responder(res, estado, datos) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(datos));
}

function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// La web manda el token de sesión como "Authorization: Bearer <token>".
// Devuelve { usuario, nombre } o responde 401 y devuelve null.
async function sesionDe(req, res) {
  const { usuarioDeToken } = require('./cuentas');
  const h = String(req.headers.authorization || '');
  try {
    const s = h.startsWith('Bearer ') ? await usuarioDeToken(h.slice(7)) : null;
    if (s) return s;
    responder(res, 401, { error: 'Tu sesión venció. Entrá de nuevo.' });
  } catch (e) {
    responder(res, e.estado || 500, { error: e.message });
  }
  return null;
}

async function leerJSON(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
  const partes = [];
  for await (const p of req) partes.push(p);
  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

// Fecha de hoy en Argentina, en formato AAAA-MM-DD.
function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

module.exports = { responder, sesionDe, leerJSON, iguales, hoyAR };
