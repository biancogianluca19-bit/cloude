# GB Soluciones Tecnológicas · sitio portfolio

Sitio estático (HTML, CSS y JavaScript sin dependencias) que presenta a GB Soluciones Tecnológicas y cuatro proyectos.

## Archivos

| Archivo | Qué contiene |
|---|---|
| `index.html` | Todo el contenido: inicio, proyectos, servicios, proceso, sobre GB y contacto |
| `styles.css` | Paleta, tipografías, diseño adaptable y modo oscuro |
| `app.js` | Menú, animaciones, vitrina de la portada, selector computadora/celular y formulario de consulta |
| `img/` | Capturas reales de los cuatro proyectos (computadora 1440×900 y celular 390×844) |

Paleta: azul noche `#071330`, azul real `#2450E0`, amarillo `#FFC72C`.
Tipografías (Google Fonts): Bricolage Grotesque, Onest y JetBrains Mono.

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

Las imágenes de `img/` se tomaron de los sitios publicados el 27/09/2026. Si cambia algún proyecto, reemplazá el archivo con el mismo nombre y tamaño (`<proyecto>-desk.jpg` y `<proyecto>-mob.jpg`).

## Enlaces de los proyectos

- La Pasión de Rosas (demo): https://la-pasion-de-rosas-demo.biancogianluca19.chatgpt.site
- Lo de Gus (demo): https://menu-lodegus-demo.biancogianluca19.chatgpt.site
- CV virtual: https://gianluca-bianco-cv.biancogianluca19.chatgpt.site
- Recorrido 3D UF 208: https://gazda-rossi-uf208-recorrido.biancogianluca19.chatgpt.site
  (se eligió esta versión porque tiene el recorrido 3D completo; la de `-visita` es una portada que enlaza a esta)
