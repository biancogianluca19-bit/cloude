# GB Soluciones Tecnológicas · sitio portfolio

Sitio estático (HTML, CSS y JavaScript sin dependencias) que presenta a GB Soluciones Tecnológicas y doce proyectos.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `index.html` | Todo el contenido: inicio, proyectos, servicios, proceso, sobre GB y contacto |
| `styles.css` | Paleta, tipografías, diseño adaptable y modo oscuro |
| `app.js` | Menú, animaciones, vitrina de la portada y formulario de consulta |
| `img/` | Recortes de capturas reales: `<proyecto>-principal.jpg` (1800×1200, computadora) y `<proyecto>-detalle.jpg` (780×975) |

Paleta: azul marino `#1C2A48` / `#16213A`, dorado `#B8964F` (detalles) y blanco frío `#F4F5F7`.
Tipografías (Google Fonts): Newsreader (títulos) y Albert Sans (texto).

## Probarlo en tu computadora

```bash
cd gb-soluciones
npx serve .
```

Abrí la dirección que muestra la terminal (por ejemplo `http://localhost:3000`).

## Publicarlo (cuando lo apruebes)

### Opción A · Vercel (recomendada)

1. Entrá a vercel.com → **Add New… → Project** e importá el repositorio `biancogianluca19-bit/cloude`.
2. En **Root Directory** elegí `gb-soluciones`.
3. En **Framework Preset** dejá **Other**. No hace falta comando de build ni carpeta de salida.
4. Tocá **Deploy**. Vercel te da una dirección `.vercel.app`.
5. Para usar un dominio propio: **Settings → Domains**, agregá el dominio y cargá en tu proveedor los registros DNS que te indique Vercel.

Importante: la raíz del repositorio tiene su propio `vercel.json` para la app Libreta de Plata. Por eso el proyecto nuevo tiene que apuntar a la carpeta `gb-soluciones` y no a la raíz.

### Opción B · Netlify

Arrastrá la carpeta `gb-soluciones` a app.netlify.com/drop.

## Actualizar las capturas

Las imágenes de `img/` son recortes de capturas de los sitios publicados, tomadas el 27/09/2026. Si cambia algún proyecto, reemplazá el archivo con el mismo nombre y proporción (3:2 para `-principal`, 4:5 para `-detalle`).

## Proyectos incluidos (12)

Sitios para negocios:
- UMBRAL Canning (demo, barrio ficticio): https://umbral-canning.vercel.app
- Casa Serena (sitio de muestra, residencia ficticia): https://casa-serena-demo.vercel.app
- La Pasión de Rosas (demo): https://la-pasion-de-rosas-demo.biancogianluca19.chatgpt.site
- Lo de Gus (demo): https://menu-lodegus-demo.biancogianluca19.chatgpt.site
- Mel In Books: https://melinbooks.vercel.app
- Barbería Modelo (demo, salón ficticio): https://claude.ai/artifact/VMn46npnZJK6YwMJ5KY1sJ
- Recorrido 3D UF 208 (Gazda Rossi): https://gazda-rossi-uf208-recorrido.biancogianluca19.chatgpt.site
  (se eligió esta versión porque tiene el recorrido 3D completo; la de `-visita` es una portada que enlaza a esta)

Apps:
- Libreta de Plata: https://libreta-de-plata.vercel.app (la captura usa datos de ejemplo)
- FORJA: https://forja-sage.vercel.app
- Inbox de Vida: https://inbox-de-vida.vercel.app (requiere cuenta)

Personales:
- CV virtual: https://gianluca-bianco-cv.biancogianluca19.chatgpt.site
- osviStreet (juego): https://biancogianluca19-bit.github.io/osviStreet/

Para agregar un proyecto: sumá sus dos recortes en `img/` y copiá un bloque `<article class="work">` en `index.html` con su `data-cat` (`negocios`, `apps` o `personal`). Actualizá los números de los filtros.
