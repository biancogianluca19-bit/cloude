// Servidor local. Sin dependencias: node:http + archivos de public/.
// No envía mensajes ni mails. En modo live solo hace GET a Tokko.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarConfig, RAIZ } from './src/config.js';
import { crearClienteTokko } from './src/tokko-cliente.js';
import { crearRepositorio } from './src/repositorio.js';
import { analizarConsulta, cargarDatosInmobiliaria, fichaParaPantalla } from './src/analizar.js';

const CARPETA_PUBLICA = path.join(RAIZ, 'public');
const LIMITE_CUERPO = 100 * 1024;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function responderJson(res, status, cuerpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let tamanio = 0;
    const partes = [];
    req.on('data', (c) => {
      tamanio += c.length;
      if (tamanio > LIMITE_CUERPO) {
        reject(Object.assign(new Error('La consulta es demasiado larga'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      try {
        resolve(partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function servirEstatico(req, res, rutaUrl) {
  const relativa = rutaUrl === '/' ? 'index.html' : decodeURIComponent(rutaUrl).replace(/^\/+/, '');
  const absoluta = path.resolve(CARPETA_PUBLICA, relativa);
  if (!absoluta.startsWith(CARPETA_PUBLICA + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(absoluta, (err, contenido) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(absoluta)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(contenido);
  });
}

export function crearServidor({ config, repo, datos, consultasEjemplo = [] }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/estado') {
        return responderJson(res, 200, {
          version: '0.1.0',
          modo: config.modo,
          avisoModo: config.avisoModo,
          sinValidar: !config.camposValidados,
          syncMinutos: config.syncMinutos,
          ...repo.estado(),
          inmobiliaria: datos.inmobiliaria?.nombre ?? '',
          pendientes: Object.entries(datos).filter(([, v]) => v && typeof v === 'object' && v._pendiente).map(([k]) => k),
        });
      }
      if (req.method === 'GET' && url.pathname === '/api/propiedades') {
        const lista = repo.buscarTexto(url.searchParams.get('q') ?? '');
        return responderJson(res, 200, { propiedades: lista.map(fichaParaPantalla) });
      }
      if (req.method === 'GET' && url.pathname === '/api/ejemplos') {
        return responderJson(res, 200, { consultas: config.modo === 'mock' ? consultasEjemplo : [] });
      }
      if (req.method === 'POST' && url.pathname === '/api/analizar') {
        const cuerpo = await leerCuerpo(req);
        const entrada = {
          texto: cuerpo.texto ?? '',
          nombre: cuerpo.nombre ?? '',
          telefono: cuerpo.telefono ?? '',
          email: cuerpo.email ?? '',
          mensaje: cuerpo.mensaje ?? '',
          propiedad: cuerpo.propiedad ?? '',
        };
        if (!Object.values(entrada).some((v) => String(v).trim())) {
          return responderJson(res, 400, { error: 'Pegá una consulta o completá el mensaje.' });
        }
        const resultado = await analizarConsulta({ entrada, propiedadId: cuerpo.propiedadId ?? null, repo, datos, config });
        return responderJson(res, 200, resultado);
      }
      if (req.method === 'POST' && url.pathname === '/api/sincronizar') {
        return responderJson(res, 200, await repo.sincronizar());
      }
      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return servirEstatico(req, res, url.pathname);
      }
      return responderJson(res, 404, { error: 'No encontrado' });
    } catch (e) {
      // No se loguea el cuerpo de la consulta: puede tener datos personales.
      return responderJson(res, e.status ?? 500, { error: e.status ? e.message : 'Error interno. Revisá la consola del servidor.' });
    }
  });
}

async function iniciar() {
  const config = cargarConfig();
  const datos = cargarDatosInmobiliaria();
  const cliente = config.modo === 'live' ? crearClienteTokko({ obtenerApiKey: config.obtenerApiKey, baseUrl: config.baseUrl }) : null;
  const repo = crearRepositorio({ config, cliente });
  const estado = await repo.iniciar();
  let consultasEjemplo = [];
  try {
    consultasEjemplo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'fixtures', 'consultas-ejemplo.json'), 'utf8')).consultas;
  } catch {
    consultasEjemplo = [];
  }

  const servidor = crearServidor({ config, repo, datos, consultasEjemplo });
  servidor.listen(config.puerto, config.host, () => {
    console.log(`Asistente de consultas Tokko v0.1 - modo ${config.modo.toUpperCase()}`);
    if (config.avisoModo) console.log(config.avisoModo);
    if (!config.camposValidados) console.log('Campos de Tokko SIN VALIDAR contra la API real.');
    console.log(`Propiedades cargadas: ${estado.cantidad}${estado.errorSync ? ` (error de sincronización: ${estado.errorSync})` : ''}`);
    console.log(`Abrí http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.puerto} en el navegador. Ctrl+C para cortar.`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  iniciar().catch((e) => {
    console.error(`No se pudo iniciar: ${e.message}`);
    process.exit(1);
  });
}
