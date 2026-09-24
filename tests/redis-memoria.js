// Redis en memoria para las pruebas: reemplaza a lib/redis.js.
function crear() {
  const db = new Map();
  const glob = p => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  function ej([c, k, ...r]) {
    const C = c.toUpperCase();
    switch (C) {
      case 'GET': return db.has(k) ? db.get(k) : null;
      case 'SET': { if (r.includes('NX') && db.has(k)) return null; db.set(k, r[0]); return 'OK'; }
      case 'DEL': return db.delete(k) ? 1 : 0;
      case 'EXISTS': return db.has(k) ? 1 : 0;
      case 'INCR': { const v = Number(db.get(k) || 0) + 1; db.set(k, String(v)); return v; }
      case 'EXPIRE': return 1;
      case 'RENAME': { if (!db.has(k)) throw new Error('no such key'); db.set(r[0], db.get(k)); db.delete(k); return 'OK'; }
      case 'HGETALL': return Object.entries(db.get(k) || {}).flat();
      case 'HSET': { const h = db.get(k) || {}; for (let i = 0; i < r.length; i += 2) h[r[i]] = r[i + 1]; db.set(k, h); return r.length / 2; }
      case 'HDEL': { const h = db.get(k) || {}; let n = 0; for (const f of r) if (f in h) { delete h[f]; n++; } return n; }
      case 'SADD': { const s = db.get(k) || new Set(); r.forEach(x => s.add(x)); db.set(k, s); return r.length; }
      case 'SMEMBERS': return [...(db.get(k) || [])];
      case 'SCARD': return (db.get(k) || new Set()).size;
      case 'SCAN': { const re = glob(r[1]); return ['0', [...db.keys()].filter(x => re.test(x))]; }
      default: throw new Error('Comando no simulado: ' + C);
    }
  }
  return {
    db,
    cmd: async (...a) => ej(a),
    pipeline: async cs => cs.map(ej),
    configurado: () => true,
  };
}
module.exports = { crear };
