// Webhook de WhatsApp Cloud API (Meta).
//   GET  verificación del webhook (hub.challenge)
//   POST mensajes entrantes: texto o audio -> movimientos -> respuesta
const crypto = require('crypto');
const datos = require('../lib/datos');
const { crearBot } = require('../lib/bot');
const { iguales, hoyAR } = require('../lib/http');

const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = () => process.env.WHATSAPP_TOKEN;
const soloDigitos = s => String(s || '').replace(/\D/g, '');
// Argentina: WhatsApp manda 549XXXXXXXXXX pero Meta entrega a 54XXXXXXXXXX.
const sinNueve = s => (s.startsWith('549') ? '54' + s.slice(3) : s);

function permitido(numero) {
  const lista = String(process.env.WHATSAPP_NUMEROS_PERMITIDOS || '').split(',').map(soloDigitos).filter(Boolean);
  if (!lista.length) return false;
  const n = sinNueve(soloDigitos(numero));
  return lista.some(x => sinNueve(x) === n);
}

// Lee el cuerpo sin parsear (hace falta para verificar la firma de Meta).
// Se lee el stream antes de tocar req.body, que en Vercel lo consume al parsear.
async function cuerpoCrudo(req) {
  try {
    const partes = [];
    for await (const p of req) partes.push(p);
    const b = Buffer.concat(partes);
    if (b.length) return b.toString('utf8');
  } catch (e) { /* stream ya leído */ }
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return null;
}

function firmaValida(crudo, firma) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return true;
  if (!crudo) { console.warn('Sin cuerpo crudo: no se puede verificar la firma.'); return true; }
  if (!firma) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(crudo, 'utf8').digest('hex');
  return iguales(esperada, firma);
}

async function enviar(phoneId, a, texto) {
  const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: process.env.WHATSAPP_RESPONDER_A || sinNueve(soloDigitos(a)), type: 'text', text: { body: texto.slice(0, 4000) } }),
  });
  if (!r.ok) console.error('No se pudo responder por WhatsApp:', r.status, await r.text());
}

async function transcribir(mediaId) {
  if (!process.env.GROQ_API_KEY) throw new Error('Falta GROQ_API_KEY');
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN()}` } }).then(r => r.json());
  if (!meta.url) throw new Error('WhatsApp no dio el audio: ' + JSON.stringify(meta.error || meta));
  const audio = await fetch(meta.url, { headers: { Authorization: `Bearer ${TOKEN()}` } });
  if (!audio.ok) throw new Error('No se pudo bajar el audio: ' + audio.status);
  const fd = new FormData();
  fd.append('file', new Blob([await audio.arrayBuffer()], { type: (meta.mime_type || 'audio/ogg').split(';')[0] }), 'audio.ogg');
  fd.append('model', process.env.GROQ_MODELO || 'whisper-large-v3-turbo');
  fd.append('language', 'es');
  fd.append('temperature', '0');
  fd.append('prompt', 'Gastos e ingresos en pesos argentinos. Gasté 4.500 en el súper, 12 mil de nafta, cargué la SUBE, pagué las expensas y el monotributo. Me pagaron 150 lucas. Cobré el sueldo.');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Groq respondió ' + r.status + ': ' + JSON.stringify(j.error || j));
  return String(j.text || '').trim();
}

async function atenderMensaje(m, phoneId) {
  if (!permitido(m.from)) { console.warn('Mensaje de un número no permitido:', m.from); return; }
  if (!(await datos.marcarMensaje(m.id))) return; // WhatsApp reintenta: ya se procesó
  const bot = crearBot({ datos, hoy: hoyAR(), urlWeb: process.env.URL_WEB || '' });
  try {
    let texto, prefijo = '';
    if (m.type === 'text') texto = m.text && m.text.body;
    else if (m.type === 'audio') {
      texto = await transcribir(m.audio.id);
      if (!texto) return enviar(phoneId, m.from, 'No entendí el audio. ¿Me lo mandás de nuevo o por escrito?');
      prefijo = `🎙️ «${texto}»\n\n`;
    } else if (m.type === 'button' || m.type === 'interactive') texto = 'ayuda';
    else return enviar(phoneId, m.from, 'Por ahora entiendo audios y mensajes de texto. Contame qué gastaste o cobraste.');
    await enviar(phoneId, m.from, prefijo + (await bot(texto)));
  } catch (e) {
    console.error(e);
    await enviar(phoneId, m.from, 'Tuve un problema y no anoté nada. Probá de nuevo en un rato.');
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    const ok = q.get('hub.mode') === 'subscribe' && process.env.WHATSAPP_VERIFY_TOKEN && q.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN;
    res.statusCode = ok ? 200 : 403;
    return res.end(ok ? q.get('hub.challenge') : 'Token de verificación incorrecto');
  }
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const crudo = await cuerpoCrudo(req);
  if (!firmaValida(crudo, req.headers['x-hub-signature-256'])) { res.statusCode = 401; return res.end('Firma inválida'); }
  let cuerpo;
  try { cuerpo = crudo ? JSON.parse(crudo) : (req.body && typeof req.body === 'object' ? req.body : null); } catch (e) { res.statusCode = 400; return res.end(); }
  const tareas = [];
  for (const entrada of (cuerpo && cuerpo.entry) || []) {
    for (const cambio of entrada.changes || []) {
      const v = cambio.value || {};
      for (const m of v.messages || []) tareas.push(atenderMensaje(m, v.metadata && v.metadata.phone_number_id));
    }
  }
  await Promise.all(tareas);
  res.statusCode = 200;
  res.end('ok');
};
