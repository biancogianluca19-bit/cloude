// Pasa un audio a texto con Groq (Whisper). Lo usan los bots de WhatsApp y Telegram.
async function transcribir(buffer, { tipo = 'audio/ogg', nombre = 'audio.ogg' } = {}) {
  if (!process.env.GROQ_API_KEY) throw new Error('Falta GROQ_API_KEY');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: tipo.split(';')[0] }), nombre);
  fd.append('model', process.env.GROQ_MODELO || 'whisper-large-v3-turbo');
  fd.append('language', 'es');
  fd.append('temperature', '0');
  fd.append('prompt', 'Gastos e ingresos en pesos argentinos. Gasté 4.500 en el súper, 12 mil de nafta, cargué la SUBE, pagué las expensas y el monotributo. Me pagaron 150 lucas. Cobré el sueldo.');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Groq respondió ' + r.status + ': ' + JSON.stringify(j.error || j));
  return String(j.text || '').trim();
}

module.exports = { transcribir };
