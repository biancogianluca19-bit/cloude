# Libreta de Plata

App para cargar tus ingresos y gastos del día dictándolos. Le decís algo como:

> Hoy gasté 4.500 en el súper, 12 mil de nafta y un café de 2800. Me pagaron 150 lucas de un trabajo freelance. Ayer pagué la luz, 38.000 pesos.

y arma 5 movimientos, cada uno con tipo (gasto o ingreso), monto, categoría, descripción y fecha. Antes de guardar podés corregir cualquier campo.

## Qué hace

- Separa un dictado en varios movimientos y detecta el monto de cada uno: `4.500`, `12 mil`, `quince mil quinientos`, `150 lucas`, `un palo`, `5k`, `300 dólares`.
- Distingue gastos de ingresos por el verbo (gasté, pagué, compré / cobré, me pagaron, vendí) o por la categoría.
- Asigna una de 21 categorías (15 de gasto y 6 de ingreso), pensadas para Argentina: súper, nafta, SUBE, expensas, Edenor, monotributo, etc.
- Entiende fechas dichas en el texto: "ayer", "anteayer", "el lunes", "el 15 de septiembre".
- Aprende: si cambiás la categoría de un movimiento, guarda esas palabras y la próxima vez lo clasifica igual.
- Muestra un resumen mensual (ingresos, gastos, saldo), un gráfico de gastos por día y el total por categoría.
- Exporta el mes a CSV (separado por `;`, se abre bien en Excel en español).

## Dos formas de usarla

**1. En claude.ai (Artifact).** Es la versión principal. Los movimientos se guardan en la nube, en la base de datos del Artifact, y los ves desde cualquier dispositivo con tu cuenta. Solo vos (y quien tenga permiso de edición) puede leerlos o escribirlos. Si lo permitís, el dictado lo interpreta Claude, que entiende mejor frases raras. Si no, usa el lector local.
Para dictar, usá el micrófono del teclado del celular: el visor de claude.ai no le da acceso al micrófono a la página.

**2. Página independiente (`index.html`).** Funciona sola en cualquier navegador y guarda los datos en ese navegador (localStorage). Trae un botón **Dictar** que usa el reconocimiento de voz del navegador (Chrome, Edge y Safari) en castellano rioplatense. Para usarla en el celular, publicala con GitHub Pages: *Settings → Pages → Deploy from branch*, y abrila desde la URL que te da.

## Archivos

| Archivo | Qué es |
|---|---|
| `app.html` | La app completa (HTML, CSS y JS en un archivo). Es la que se publica como Artifact. |
| `index.html` | Versión independiente. Se genera con `./build.sh` a partir de `app.html`; no la edites a mano. |
| `tests/lector.test.js` | Pruebas del lector de dictados. Correr con `node --test tests/*.test.js`. |

El lector local está entre los comentarios `// PARSER-START` y `// PARSER-END` de `app.html`. Las categorías y sus palabras clave están en la lista `CATEGORIAS` de ese bloque: para agregar una palabra, sumala al array `claves` de la categoría.
