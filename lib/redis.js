// Cliente mínimo de Upstash Redis por REST. Acepta las variables que crea la
// integración de Vercel (KV_REST_API_*) o las de Upstash (UPSTASH_REDIS_REST_*).
const URL_BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function configurado() {
  return !!(URL_BASE && TOKEN);
}

async function llamar(ruta, cuerpo) {
  if (!configurado()) throw new Error('Falta configurar la base de datos (KV_REST_API_URL y KV_REST_API_TOKEN).');
  const r = await fetch(URL_BASE.replace(/\/$/, '') + ruta, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error(`Redis respondió ${r.status}`);
  return j;
}

async function cmd(...args) {
  const j = await llamar('', args);
  if (j.error) throw new Error(j.error);
  return j.result;
}

async function pipeline(comandos) {
  if (!comandos.length) return [];
  const j = await llamar('/pipeline', comandos);
  return j.map(x => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

module.exports = { cmd, pipeline, configurado };
