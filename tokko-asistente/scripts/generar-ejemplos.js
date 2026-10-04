// Genera docs/EJEMPLOS.md corriendo el flujo real sobre cinco consultas de ejemplo (modo mock).
// Uso: npm run ejemplos

import fs from 'node:fs';
import path from 'node:path';
import { cargarConfig, RAIZ } from '../src/config.js';
import { crearRepositorio } from '../src/repositorio.js';
import { analizarConsulta, cargarDatosInmobiliaria } from '../src/analizar.js';

const EJEMPLOS = [
  {
    titulo: 'Mail con etiquetas: disponibilidad, expensas y visita con día propuesto',
    texto: 'Nombre: Martina Ejemplo\nEmail: martina@example.com\nTeléfono: +54 9 11 0000-1111\nPropiedad: EJEMPLO - Casa en Santa Juana (EJ-101)\nMensaje: Hola, sigue disponible? cuanto son las expensas? Se puede ir a ver el sábado a la mañana?',
  },
  {
    titulo: 'WhatsApp sin código, en Canning Chico (primero pide elegir la propiedad)',
    texto: '[4/10/26, 10:15] Ramiro Ejemplo: Hola buenas! vi la casa de alquiler en canning chico, acepta mascotas? tengo un perro mediano. q requisitos piden?',
    elegir: 900002,
  },
  {
    titulo: 'Mala ortografía: precio y metros del lote en El Rodal',
    texto: 'ola kiero saver el presio del lote en el rodal y cuantos metros tiene',
    elegir: 900003,
  },
  {
    titulo: 'Datos que faltan en la ficha: precio sin publicar y cochera',
    texto: 'Hola cuanto sale el alquiler del depto EJ-104? tiene cochera? Gracias, Sofía Ejemplo 11 0000 3333',
  },
  {
    titulo: 'Negociación: se deriva a una persona',
    texto: 'Hola, la casa de Terralagos ref EJ-106 la dejan en 350 mil dolares? tengo el efectivo',
  },
];

const config = cargarConfig({ rutaEnv: '/no-existe', entorno: {} });
const repo = crearRepositorio({ config });
await repo.iniciar();
const datos = cargarDatosInmobiliaria();

const cita = (t) => t.split('\n').map((l) => `> ${l}`).join('\n');
const partes = [
  '# Ejemplos de borradores',
  '',
  `Generado con \`npm run ejemplos\` el ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}, en modo mock, con las propiedades de EJEMPLO de \`fixtures/propiedades-ejemplo.json\` y la configuración actual de \`datos-inmobiliaria.json\`. Los textos son la salida real del programa, sin retoques.`,
  '',
  'Las propiedades y los contactos son inventados. Los campos de Tokko están SIN VALIDAR contra la API real.',
];

for (const [i, ej] of EJEMPLOS.entries()) {
  let r = await analizarConsulta({ entrada: { texto: ej.texto }, repo, datos, config, registrar: false });
  partes.push('', `## ${i + 1}. ${ej.titulo}`, '', '**Consulta pegada:**', '', cita(ej.texto), '');
  if (ej.elegir) {
    partes.push(`**Primer análisis:** identificación \`${r.identificacion.estado}\`, candidatas: ${r.identificacion.candidatos.map((c) => c.codigo).join(', ') || 'ninguna'}. La pantalla muestra "DERIVAR A PERSONA: mensaje ambiguo" hasta que elegís una. Se eligió ${ej.elegir}.`, '');
    r = await analizarConsulta({ entrada: { texto: ej.texto }, propiedadId: ej.elegir, repo, datos, config, registrar: false });
  }
  partes.push(`**Propiedad:** ${r.ficha ? `${r.ficha.codigo} (${r.identificacion.motivos.join(', ')})` : 'sin identificar'}  `);
  partes.push(`**Pregunta por:** ${r.intenciones.map((x) => x.texto).concat(r.caracteristicasPedidas.map((c) => c.nombre)).join(', ') || 'nada reconocido'}  `);
  partes.push(`**Derivar:** ${r.derivacion.derivar ? `sí (${r.derivacion.motivos.map((m) => m.texto).join('; ')})` : 'no'}`, '');
  partes.push('**Borrador:**', '', '```text', r.borrador.texto, '```', '');
  if (r.borrador.aConfirmar.length) partes.push('**A confirmar:**', '', ...r.borrador.aConfirmar.map((a) => `- ${a.texto}`), '');
  const avisos = r.borrador.avisos.filter((a) => !a.startsWith('Modo mock') && !a.startsWith('Campos de Tokko SIN VALIDAR'));
  if (avisos.length) partes.push('**Avisos:**', '', ...avisos.map((a) => `- ${a}`), '');
  if (r.borrador.notaInterna) partes.push('**Nota interna:**', '', '```text', r.borrador.notaInterna, '```', '');
}
partes.push('', 'Todos los borradores en modo mock muestran además dos avisos fijos: "Modo mock: la ficha es un EJEMPLO" y "Campos de Tokko SIN VALIDAR contra la API real".', '');

const destino = path.join(RAIZ, 'docs', 'EJEMPLOS.md');
fs.writeFileSync(destino, partes.join('\n').replace(/\n{3,}/g, '\n\n'));
console.log(`Escrito ${path.relative(RAIZ, destino)}`);
