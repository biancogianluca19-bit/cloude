// Log local mínimo: solo hora, id de consulta e id de propiedad.
// Nunca se guardan nombre, teléfono, mail ni el texto de la consulta.

import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './config.js';

export const RUTA_LOG = path.join(RAIZ, 'logs', 'consultas.log');

export function lineaDeLog({ hora, consultaId, propiedadId }) {
  const prop = propiedadId === null || propiedadId === undefined ? '-' : String(propiedadId).replace(/[^0-9A-Za-z_-]/g, '');
  const id = String(consultaId).replace(/[^0-9A-Za-z_-]/g, '');
  return `${hora}\tconsulta=${id}\tpropiedad=${prop}\n`;
}

export function registrarConsulta(datos, ruta = RUTA_LOG) {
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.appendFileSync(ruta, lineaDeLog(datos));
  } catch {
    // El log no debe frenar el flujo.
  }
}
