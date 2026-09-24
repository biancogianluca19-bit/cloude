// Webhook del bot de Telegram.
// Para vincular tu chat: abrí t.me/<tu_bot>?start=<CLAVE_WEB> (o mandale "/start <CLAVE_WEB>").
// Después, cada audio o texto se anota en la libreta.
const datos = require('../lib/datos');
const { crearBot, AYUDA } = require('../lib/bot');
const { iguales, hoyAR, leerJSON } = require('../lib/http');
const { transcribir } = require('../lib/transcribir');

const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

// El bot escribe *negrita* estilo WhatsApp; Telegram lo recibe como HTML.
function aHTML(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
}

async function enviar(chatId, texto) {
  const r = await fetch(`${API()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: aHTML(texto).slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!r.ok) console.error('No se pudo responder por Telegram:', r.status, await r.text());
}

async function audioDeTelegram(fileId) {
  const f = await fetch(`${API()}/getFile?file_id=${encodeURIComponent(fileId)}`).then(r => r.json());
  if (!f.ok) throw new Error('Telegram no dio el audio: ' + JSON.stringify(f));
  const a = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${f.result.file_path}`);
  if (!a.ok) throw new Error('No se pudo bajar el audio: ' + a.status);
  const nombre = f.result.file_path.split('/').pop() || 'audio.ogg';
  return transcribir(await a.arrayBuffer(), { tipo: 'audio/ogg', nombre: /\.(oga|ogg)$/.test(nombre) ? 'audio.ogg' : nombre });
}

async function atender(msg) {
  const chatId = String(msg.chat.id);
  const texto0 = (msg.text || '').trim();

  // Vincular el chat con la clave de la web.
  const mStart = texto0.match(/^\/start(?:@\w+)?\s*(\S*)/);
  const vinculados = await datos.chatsTelegram();
  if (!vinculados.includes(chatId)) {
    if (mStart && process.env.CLAVE_WEB && mStart[1] && iguales(mStart[1], process.env.CLAVE_WEB)) {
      await datos.vincularTelegram(chatId);
      return enviar(chatId, '¡Listo! Tu chat quedó vinculado con la libreta.\n\n' + AYUDA);
    }
    console.warn('Chat de Telegram sin vincular:', chatId);
    return enviar(chatId, 'Este bot es privado. Para usarlo, mandá /start seguido de tu clave de la libreta.');
  }
  if (!(await datos.marcarMensaje('tg' + chatId + '_' + msg.message_id))) return;

  const bot = crearBot({ datos, hoy: hoyAR(), urlWeb: process.env.URL_WEB || '', origen: 'telegram' });
  try {
    let texto = texto0, prefijo = '';
    const audio = msg.voice || msg.audio;
    if (mStart) texto = 'ayuda';
    else if (audio) {
      texto = await audioDeTelegram(audio.file_id);
      if (!texto) return enviar(chatId, 'No entendí el audio. ¿Me lo mandás de nuevo o por escrito?');
      prefijo = `🎙️ «${texto}»\n\n`;
    } else if (!texto) {
      return enviar(chatId, 'Por ahora entiendo audios y mensajes de texto. Contame qué gastaste o cobraste.');
    }
    texto = texto.replace(/^\/(\w+)(?:@\w+)?/, '$1');
    await enviar(chatId, prefijo + (await bot(texto)));
  } catch (e) {
    console.error(e);
    await enviar(chatId, 'Tuve un problema y no anoté nada. Probá de nuevo en un rato.');
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const secreto = process.env.TELEGRAM_SECRET;
  if (!secreto || !iguales(req.headers['x-telegram-bot-api-secret-token'] || '', secreto)) { res.statusCode = 401; return res.end(); }
  try {
    const u = await leerJSON(req);
    const msg = u.message || u.edited_message;
    if (msg && msg.chat && msg.chat.type === 'private') await atender(msg);
  } catch (e) {
    console.error(e);
  }
  res.statusCode = 200;
  res.end('ok');
};
