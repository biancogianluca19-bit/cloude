// Cuentas de usuario: registro, ingreso, sesiones, vínculo con Telegram y
// traspaso de los datos de antes de que existieran las cuentas.
//   libreta:cuenta:<usuario>            JSON  { nombre, sal, hash, ver, creado }
//   libreta:intentos:<usuario>          contador de ingresos fallidos (15 min)
//   libreta:vinculo:<código>            usuario que pidió vincular Telegram (15 min)
//   libreta:telegram:chat:<chatId>      usuario dueño de ese chat
const crypto = require('crypto');
const { cmd, pipeline } = require('./redis');

const DIAS_SESION = 365;
const RE_USUARIO = /^[a-z0-9_.]{3,20}$/;

class ErrorCuenta extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

function normalizarUsuario(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
}

function secreto() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new ErrorCuenta('Falta configurar AUTH_SECRET en Vercel.', 500);
  return s;
}

const hashear = (contrasena, sal) => crypto.scryptSync(String(contrasena), sal, 32).toString('hex');
const firmar = texto => crypto.createHmac('sha256', secreto()).update(texto).digest('base64url');

function iguales(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function leerCuenta(usuario) {
  const r = await cmd('GET', 'libreta:cuenta:' + usuario);
  return r ? JSON.parse(r) : null;
}

function tokenPara(usuario, cuenta) {
  const vence = Date.now() + DIAS_SESION * 864e5;
  const cuerpo = `${usuario}.${cuenta.ver}.${vence}`;
  return `${cuerpo}.${firmar(cuerpo)}`;
}

function sesion(usuario, cuenta) {
  return { token: tokenPara(usuario, cuenta), usuario, nombre: cuenta.nombre || usuario };
}

async function registrar(usuarioCrudo, contrasena, nombre) {
  const usuario = normalizarUsuario(usuarioCrudo);
  if (!RE_USUARIO.test(usuario)) throw new ErrorCuenta('El usuario tiene que tener entre 3 y 20 letras o números, sin espacios.');
  if (String(contrasena || '').length < 6) throw new ErrorCuenta('La contraseña tiene que tener al menos 6 caracteres.');
  const sal = crypto.randomBytes(16).toString('hex');
  const cuenta = { nombre: String(nombre || '').trim().slice(0, 40) || usuario, sal, hash: hashear(contrasena, sal), ver: 1, creado: Date.now() };
  const ok = await cmd('SET', 'libreta:cuenta:' + usuario, JSON.stringify(cuenta), 'NX');
  if (ok !== 'OK') throw new ErrorCuenta('Ese usuario ya existe. Elegí otro.', 409);
  return sesion(usuario, cuenta);
}

async function entrar(usuarioCrudo, contrasena) {
  const usuario = normalizarUsuario(usuarioCrudo);
  if (!RE_USUARIO.test(usuario)) throw new ErrorCuenta('Usuario o contraseña incorrectos.', 401);
  const [intentos] = await pipeline([['INCR', 'libreta:intentos:' + usuario], ['EXPIRE', 'libreta:intentos:' + usuario, '900']]);
  if (intentos > 10) throw new ErrorCuenta('Demasiados intentos. Probá de nuevo en 15 minutos.', 429);
  const cuenta = await leerCuenta(usuario);
  if (!cuenta || !iguales(hashear(contrasena, cuenta.sal), cuenta.hash)) throw new ErrorCuenta('Usuario o contraseña incorrectos.', 401);
  await cmd('DEL', 'libreta:intentos:' + usuario);
  return sesion(usuario, cuenta);
}

// Devuelve { usuario, nombre } o null si el token no vale.
async function usuarioDeToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 4) return null;
  const [usuario, ver, vence, firma] = partes;
  if (!RE_USUARIO.test(usuario) || !(Number(vence) > Date.now())) return null;
  if (!iguales(firma, firmar(`${usuario}.${ver}.${vence}`))) return null;
  const cuenta = await leerCuenta(usuario);
  if (!cuenta || String(cuenta.ver) !== ver) return null;
  return { usuario, nombre: cuenta.nombre || usuario };
}

async function cambiarContrasena(usuario, actual, nueva) {
  const cuenta = await leerCuenta(usuario);
  if (!cuenta || !iguales(hashear(actual, cuenta.sal), cuenta.hash)) throw new ErrorCuenta('La contraseña actual no es correcta.', 401);
  if (String(nueva || '').length < 6) throw new ErrorCuenta('La contraseña nueva tiene que tener al menos 6 caracteres.');
  cuenta.sal = crypto.randomBytes(16).toString('hex');
  cuenta.hash = hashear(nueva, cuenta.sal);
  cuenta.ver = (cuenta.ver || 1) + 1; // cierra las sesiones abiertas en otros dispositivos
  await cmd('SET', 'libreta:cuenta:' + usuario, JSON.stringify(cuenta));
  return sesion(usuario, cuenta);
}

// ---- Telegram ----
async function codigoTelegram(usuario) {
  const codigo = crypto.randomBytes(12).toString('hex');
  await cmd('SET', 'libreta:vinculo:' + codigo, usuario, 'EX', '900');
  return codigo;
}

async function vincularChat(codigo, chatId) {
  if (!/^[a-f0-9]{24}$/.test(codigo || '')) return null;
  const [usuario] = await pipeline([['GET', 'libreta:vinculo:' + codigo], ['DEL', 'libreta:vinculo:' + codigo]]);
  if (!usuario) return null;
  await cmd('SET', 'libreta:telegram:chat:' + chatId, usuario);
  return usuario;
}

async function usuarioDeChat(chatId) {
  return cmd('GET', 'libreta:telegram:chat:' + chatId);
}

// ---- Datos de antes de las cuentas ----
// Pasa las claves viejas (libreta:mes:*, etc.) a la cuenta indicada. Funciona una sola vez.
async function traspasarDatosViejos(usuario) {
  const ok = await cmd('SET', 'libreta:migrado', usuario, 'NX');
  if (ok !== 'OK') throw new ErrorCuenta('Los datos anteriores ya se pasaron a otra cuenta.', 409);
  const P = 'libreta:u:' + usuario + ':';
  let cursor = '0';
  const meses = [];
  do {
    const [sig, claves] = await cmd('SCAN', cursor, 'MATCH', 'libreta:mes:*', 'COUNT', '500');
    cursor = String(sig);
    meses.push(...claves);
  } while (cursor !== '0');
  const cmds = meses.map(k => ['RENAME', k, P + k.slice('libreta:'.length)]);
  const [a, p, ul, chats] = await pipeline([['EXISTS', 'libreta:aprendidas'], ['EXISTS', 'libreta:presupuestos'], ['EXISTS', 'libreta:ultimo'], ['SMEMBERS', 'libreta:telegram:chats']]);
  if (a) cmds.push(['RENAME', 'libreta:aprendidas', P + 'aprendidas']);
  if (p) cmds.push(['RENAME', 'libreta:presupuestos', P + 'presupuestos']);
  if (ul) cmds.push(['RENAME', 'libreta:ultimo', P + 'ultimo']);
  for (const c of chats || []) cmds.push(['SET', 'libreta:telegram:chat:' + c, usuario]);
  if ((chats || []).length) cmds.push(['DEL', 'libreta:telegram:chats']);
  await pipeline(cmds);
  return { meses: meses.length, chats: (chats || []).length };
}

async function hayDatosViejos() {
  const [migrado, chats] = await pipeline([['EXISTS', 'libreta:migrado'], ['SCARD', 'libreta:telegram:chats']]);
  if (migrado) return false;
  if (chats) return true;
  let cursor = '0';
  do {
    const [sig, claves] = await cmd('SCAN', cursor, 'MATCH', 'libreta:mes:*', 'COUNT', '500');
    if (claves.length) return true;
    cursor = String(sig);
  } while (cursor !== '0');
  return false;
}

module.exports = { ErrorCuenta, normalizarUsuario, registrar, entrar, usuarioDeToken, cambiarContrasena, codigoTelegram, vincularChat, usuarioDeChat, traspasarDatosViejos, hayDatosViejos };
