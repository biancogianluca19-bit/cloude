# Mel In Books · sitio web

Sitio oficial de **Mel In Books**, resúmenes y material de estudio para UBA XXI, CBC y Edición (FILO).

**Publicado en:** https://melinbooks.vercel.app (proyecto `melinbooks` en Vercel, plan gratuito).

Quien entra desde Instagram busca su materia, elige cátedra y opción (un parcial, el combo, el final), arma su pedido y lo envía por WhatsApp con el mensaje ya escrito. Mel solo tiene que responder, cobrar y mandar el PDF.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4. Sin base de datos ni panel: todo el contenido está en la carpeta `data/`.
- **Sitio estático:** `npm run build` genera la carpeta `out/` con HTML, CSS, JS e imágenes. No necesita servidor: se puede publicar en Vercel (configurado) o en cualquier hosting de archivos.
- **Dependencias de producción:** `next`, `react`, `react-dom` y `@vercel/analytics`.

---

## Instalar y ver el sitio en tu compu

Hace falta Node.js 20.9 o más nuevo.

```bash
cd melinbooks
npm install
npm run dev        # abre http://localhost:3000
```

Otros comandos:

| Comando             | Qué hace                                                  |
| ------------------- | --------------------------------------------------------- |
| `npm run build`     | Arma la versión de producción (hay que correrlo antes de publicar). |
| `npm start`         | Sirve la versión ya armada (carpeta `out/`) en http://localhost:3000. |
| `npm test`          | Pruebas del mensaje de WhatsApp, del buscador y del catálogo. |
| `npm run lint`      | Revisa el código.                                         |
| `npm run typecheck` | Revisa los tipos de TypeScript.                           |

## Publicar en Vercel

1. En [vercel.com](https://vercel.com) → **Add New… → Project** → importá este repositorio de GitHub.
2. En **Root Directory** elegí `melinbooks` (el repositorio tiene otro proyecto en la raíz).
3. No hace falta tocar nada más: `melinbooks/vercel.json` ya indica cómo armarlo (`npm run build`) y qué publicar (la carpeta `out/`). Tocá **Deploy**.
4. Opcional: en **Settings → Domains** conectá un dominio propio y cargá la variable `NEXT_PUBLIC_SITE_URL` con esa dirección (por ejemplo `https://www.melinbooks.com.ar`). Si no la cargás, se usa el dominio `.vercel.app` del proyecto.
5. Cambiá el link de la bio de Instagram y del Linktree por la nueva dirección.

Cada vez que se sube un cambio a la rama principal, Vercel vuelve a publicar el sitio solo.

---

## Dónde se cambia cada cosa

Todo lo editable está en `data/`. No hace falta tocar componentes.

| Quiero cambiar…                                  | Archivo                  |
| ------------------------------------------------ | ------------------------ |
| Número de WhatsApp                               | `data/site.ts` → `whatsapp` |
| Redes (Instagram, TikTok, Facebook, Goodreads)   | `data/site.ts` → `social` |
| Medios de pago y forma de entrega                | `data/site.ts` → `payment`, `delivery` |
| Descuentos (10% por 2 materias, notas de combos) | `data/site.ts` → `promos` |
| Búsquedas sugeridas debajo del buscador          | `data/site.ts` → `popularSearches` |
| Materias, cátedras, precios, páginas, índices    | `data/catalog.ts` → `products` |
| Programas y grupos (UBA XXI, CBC, Edición, Extras) | `data/catalog.ts` → `programs` |
| Preguntas frecuentes                             | `data/faq.ts` |
| Opiniones de estudiantes                         | `data/testimonials.ts` |
| Portadas                                         | `public/img/covers/` y `public/img/fichas/` |
| Foto de Mel                                      | `public/img/mel.webp` |
| Imagen que aparece al compartir el link          | `public/og.jpg` (1200 × 630) |

### Cambiar el WhatsApp

En `data/site.ts`:

```ts
whatsapp: {
  number: "5491161627734",        // 54 + 9 + código de área sin 0 + número sin 15
  display: "+54 9 11 6162-7734",  // cómo se muestra en la web
},
```

### Cambiar un precio

En `data/catalog.ts`, buscá el material (por ejemplo `slug: "sociologia-bustos"`) y cambiá los números:

```ts
options: perParcial(8000, 15000),   // precio por parcial, precio del combo
```

Otras formas que ya se usan en el archivo:

```ts
options: single("Resumen completo", 13500),   // una sola opción
options: single("Consulta"),                  // sin precio: se muestra "A consultar"
options: [                                     // opciones a medida
  { id: "parcial", label: "Parcial", price: 20000 },
  { id: "final", label: "Final", price: 30000 },
  { id: "combo", label: "Combo completo", price: 40000 },
],
```

### Agregar un resumen nuevo

1. Guardá la portada en `public/img/covers/` (horizontal, idealmente `.webp` de unos 800 px de ancho). Ejemplo: `public/img/covers/antropologia.webp`.
2. En `data/catalog.ts`, copiá un bloque de la lista `products` y pegalo debajo, en la sección que corresponda:

```ts
{
  slug: "antropologia-perez",               // único, minúsculas, sin espacios ni tildes
  subject: "Antropología",                  // cómo lo busca la gente (nombre corto o sigla)
  title: "Antropología",                    // nombre completo de la materia
  catedra: "Pérez",                         // opcional
  kind: "resumen",                          // resumen | curso | seminario | servicio
  listings: [{ program: "uba-xxi", group: "sociales" }],
  pages: "30",                              // opcional
  facts: ["Actualizado en 2026"],           // opcional: datos cortos de la ficha
  cover: "/img/covers/antropologia.webp",
  options: perParcial(12000, 20000),
  keywords: ["antro"],                      // opcional: otras formas de buscarlo
},
```

3. Guardá, corré `npm test` (avisa si falta la imagen o si el slug está repetido) y publicá.

La página `/resumen/antropologia-perez`, el buscador, los filtros, el pedido y el sitemap se actualizan solos.

Para que un material aparezca en dos lugares (como IPC, que está en UBA XXI y en "Ingresantes" de Edición), agregá otra línea en `listings`. El primer lugar de la lista es el principal.

Para quitar un material, borrá su bloque. Si alguien lo tenía en un pedido guardado, desaparece solo.

### Preguntas frecuentes

`data/faq.ts` tiene una lista de preguntas. Cada respuesta es una lista de párrafos. El orden de la lista es el orden en la web. Las preguntas también se envían a Google como datos estructurados.

### Opiniones

La sección **Opiniones** está preparada pero no se muestra mientras `data/testimonials.ts` esté vacío. Cargá solo opiniones reales, con permiso de quien la escribió (por ejemplo, las de la historia destacada "Opiniones" de Instagram). Al cargar la primera, aparecen la sección y el link "Opiniones" en el menú.

---

## Cómo funciona el pedido por WhatsApp

- El pedido se guarda en el navegador de la persona (si cierra la página y vuelve, sigue ahí).
- El botón **Pedir por WhatsApp** abre `https://wa.me/<número>?text=<mensaje>`. En el celular abre la app; en la computadora, WhatsApp Web o la app de escritorio.
- El mensaje incluye cada material con programa, cátedra, opción y precio, el total según la web, el pedido de descuento si son 2 o más materias, cómo quiere recibirlo y, si los completó, nombre y comentario.
- Si alguien suma los dos parciales de una materia, se le avisa que el combo sale menos y puede cambiarlo con un toque.
- Si una búsqueda no da resultados, el botón **Consultarle a Mel** abre WhatsApp con lo que buscó.
- Si WhatsApp no se abre, hay un botón para copiar el mensaje.

El texto de los mensajes está en `lib/whatsapp.ts`.

## Analítica

El sitio registra estos eventos, sin datos personales:

| Evento              | Cuándo                                         |
| ------------------- | ---------------------------------------------- |
| `catalog_view`      | Alguien abre el catálogo                        |
| `search`            | Búsqueda con resultados (incluye el texto)      |
| `search_no_results` | Búsqueda sin resultados (ideas de materias nuevas) |
| `product_view`      | Alguien abre la página de un material           |
| `add_to_order`      | Suma un material al pedido (material y opción)  |
| `whatsapp_order`    | Toca "Pedir por WhatsApp" (lista de materiales) |
| `whatsapp_single`   | Pide un solo material directo                   |
| `whatsapp_consult`  | Consulta sin pedido (botón flotante, sin resultados, servicios) |

Los **materiales más consultados** salen de `add_to_order` y `whatsapp_order`, agrupando por la propiedad `product` / `products`.

Se puede activar una o varias herramientas. Todas se configuran con variables de entorno en Vercel (**Settings → Environment Variables**) y después hay que volver a publicar:

- **Vercel Web Analytics** (lo más simple si el sitio está en Vercel): activalo en la pestaña **Analytics** del proyecto y cargá `NEXT_PUBLIC_VERCEL_ANALYTICS=true`. Las visitas se ven en el plan gratuito; los eventos personalizados requieren el plan Pro.
- **Plausible** (sin cookies, pago): `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=tu-dominio.com`. Los eventos aparecen en *Goals* al crearlos con el mismo nombre.
- **Google Analytics 4** (gratis): `NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX`. Los eventos aparecen en *Informes → Eventos*.

Si no se configura ninguna, el sitio funciona igual y no se carga ningún script de terceros. Ver `.env.example`.

---

## Estructura del código

```
app/                 páginas (inicio, catálogo, resumen/[slug], 404, sitemap, robots)
components/
  home/              secciones de la página de inicio
  catalog/           buscador, filtros y tarjetas del catálogo
  order/             pedido: estado, selector de opción, cajón "Tu pedido", barra inferior
  product/           compra desde la página de un material
  layout/            encabezado, pie, logo, analítica
  ui/                diálogo accesible, animación al hacer scroll, estilos de botones
data/                contenido editable (catálogo, textos, FAQ, opiniones)
lib/                 búsqueda, mensaje de WhatsApp, formato de precios, analítica
public/img/          portadas, fichas, logo y foto
tests/               pruebas automáticas
```

Detalles técnicos:

- Diseño pensado primero para celular (390 × 844) y adaptado a tablet y escritorio.
- Animaciones con CSS, sin librerías. Con "reducir movimiento" activado en el teléfono, se desactivan.
- Diálogos con `<dialog>` nativo: se cierran con Escape o tocando afuera, y mantienen el foco dentro.
- El buscador ignora tildes y mayúsculas y busca en materia, sigla, nombre completo, cátedra, programa y palabras clave.
- El catálogo guarda la búsqueda y los filtros en la URL (`/catalogo?q=ipc&programa=uba-xxi`), así se pueden compartir. Como el sitio es estático, la URL se lee en el navegador; el HTML trae el catálogo completo.
- SEO: título y descripción por página, Open Graph y Twitter, `sitemap.xml`, `robots.txt`, URLs limpias y datos estructurados (tienda, productos con precios, preguntas frecuentes).
- Lighthouse en celular: Accesibilidad, Buenas prácticas y SEO en 100; Rendimiento entre 93 y 97.

## Fuentes de la información

Toda la información comercial se tomó de fuentes públicas de Mel In Books en septiembre de 2026:

- Sitio de Canva: `melinbooks.my.canva.site` (catálogo, precios, páginas, cátedras, preguntas frecuentes, "¿Por qué elegirme?", redes).
- Sitio de Canva de cátedras: `icsecatedras.my.canva.site` e `icsecatedras.my.canva.site/ipc` (fichas, índices y precios de IPC e ICSE por cátedra).
- Instagram `@melinbooks`: bio, publicación fijada de presentación e historias destacadas "Q&A" (medios de pago, envío, compra por parcial, descuentos).
- Linktree `linktr.ee/melinbooks` (redes).

Las portadas, fichas, logo y foto son de Mel, tomados de esos sitios.
