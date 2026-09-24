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

// La web manda la clave como "Authorization: Bearer <CLAVE_WEB>".
function autorizado(req, res) {
  const clave = process.env.CLAVE_WEB;
  if (!clave) { responder(res, 500, { error: 'Falta configurar CLAVE_WEB en Vercel.' }); return false; }
  const h = String(req.headers.authorization || '');
  if (!h.startsWith('Bearer ') || !iguales(h.slice(7), clave)) { responder(res, 401, { error: 'Clave incorrecta.' }); return false; }
  return true;
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

module.exports = { responder, autorizado, leerJSON, iguales, hoyAR };
