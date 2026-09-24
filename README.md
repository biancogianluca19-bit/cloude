# Libreta de Plata

Tus ingresos y gastos del día, cargados por WhatsApp (audio o texto) o desde la web, con presupuesto mensual por categoría.

Le mandás al bot un audio que diga:

> Gasté 4.500 en el súper, 12 mil de nafta y un café de 2800. Me pagaron 150 lucas de un freelance.

y, si tenés un tope de $ 15.000 en Transporte, te responde:

```
🎙️ «Gasté 4.500 en el súper, 12 mil de nafta…»

Anoté 4 movimientos:
➖ $ 4.500 · Súper (Supermercado)
➖ $ 12.000 · Nafta (Transporte)
➖ $ 2.800 · Café (Comida afuera)
➕ $ 150.000 · Freelance (Trabajos extra)

⚠️ Transporte: llevás $ 12.000 de $ 15.000 (80%). Te quedan $ 3.000.

¿Algo mal? Escribí *deshacer*.
```

## Qué hace

- **Bot de WhatsApp.** Transcribe los audios con Groq (Whisper) y separa cada movimiento con el lector local: monto, gasto o ingreso, categoría y fecha ("ayer", "el lunes").
- **Comandos por WhatsApp:** `resumen`, `presupuesto`, `presupuesto súper 200 mil` (fija un tope), `presupuesto súper 0` (lo saca), `deshacer` (borra lo último que anotó), `ayuda`. También funcionan dichos en un audio.
- **Presupuesto por categoría.** Un tope mensual en pesos para cada categoría de gasto. Al llegar al 80% y al pasarte, avisa en la respuesta de WhatsApp y en la web.
- **Web.** Resumen del mes, gráfico de gastos por día, estado de cada tope y la lista de movimientos para corregir o borrar. También podés dictar ahí. Lo que llega por WhatsApp aparece marcado como tal.
- **Aprende.** Si en la web cambiás la categoría de un movimiento, guarda esas palabras y las usa también en WhatsApp.
- **CSV.** Exporta el mes separado por `;` para abrir en Excel.

## Estructura

| Ruta | Qué es |
|---|---|
| `public/` | La web: `index.html`, `app.js`, `estilos.css`. |
| `public/lector.js` | Lector de dictados (montos, categorías, fechas). Lo usan la web y el bot. |
| `public/presupuesto.js` | Cálculo del estado de cada tope. Lo usan la web y el bot. |
| `api/whatsapp.js` | Webhook de WhatsApp: recibe mensajes, transcribe audios, responde. |
| `api/movimientos.js`, `api/ajustes.js` | API de la web (protegida con `CLAVE_WEB`). |
| `lib/bot.js` | Qué responde el bot a cada mensaje. |
| `lib/datos.js`, `lib/redis.js` | Guardado en Upstash Redis. |
| `tests/` | Pruebas: `npm test`. |

Las categorías y sus palabras clave están en `CATEGORIAS`, en `public/lector.js`.

## Puesta en marcha

Necesitás cuentas en Vercel, Upstash (se crea desde Vercel), Groq y Meta for Developers. Todo tiene plan gratis suficiente para uso personal.

### 1. Vercel y la base de datos

1. En Vercel, importá este repositorio (*Add New → Project*). No hace falta tocar la configuración: `vercel.json` ya la trae.
2. En el proyecto: *Storage → Create Database → Upstash for Redis* (plan gratis) y conectala al proyecto. Eso crea `KV_REST_API_URL` y `KV_REST_API_TOKEN`.

### 2. Groq (audios)

En [console.groq.com](https://console.groq.com) → *API Keys* → creá una clave.

### 3. WhatsApp (Meta)

1. En [developers.facebook.com](https://developers.facebook.com) → *Mis apps → Crear app* → tipo *Empresa* → agregá el producto **WhatsApp**.
2. En *WhatsApp → Configuración de la API* vas a ver un número de prueba y el *Phone number ID*. En *Para*, agregá tu número personal y confirmalo con el código que te llega.
3. Token permanente: en *Configuración del negocio → Usuarios del sistema*, creá un usuario de sistema administrador, asignale la app con control total y generá un token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. El token temporal de la pantalla de la API vence en 24 horas.
4. *Configuración de la app → Básica → Clave secreta de la app*: copiala para `WHATSAPP_APP_SECRET`.

### 4. Variables de entorno en Vercel

En *Settings → Environment Variables* (entorno Production):

| Variable | Valor |
|---|---|
| `CLAVE_WEB` | Una clave larga para entrar a la web. |
| `WHATSAPP_TOKEN` | El token permanente del paso 3.3. |
| `WHATSAPP_VERIFY_TOKEN` | Cualquier texto; lo vas a repetir en Meta. |
| `WHATSAPP_APP_SECRET` | La clave secreta de la app (verifica que los mensajes vengan de Meta). |
| `WHATSAPP_NUMEROS_PERMITIDOS` | Tu número con código de país, sin `+`: `5491122334455`. Varios, separados por coma. Los demás números se ignoran. |
| `GROQ_API_KEY` | La clave de Groq. |
| `URL_WEB` | Opcional: la dirección de la web, para que el bot la incluya en sus respuestas. |

Después, *Deployments → Redeploy* para que tome las variables.

### 5. Conectar el webhook

En Meta, *WhatsApp → Configuración → Webhook → Editar*:

- URL de devolución de llamada: `https://TU-PROYECTO.vercel.app/api/whatsapp`
- Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`

Guardá y, en *Campos del webhook*, suscribite a **messages**.

Listo: mandale "hola" al número de prueba desde tu WhatsApp.

## Notas

- **Números de Argentina.** WhatsApp manda tu número como `549…`, pero Meta solo entrega mensajes a `54…` (sin el 9). El bot hace esa conversión. Si no te llegan las respuestas, poné en `WHATSAPP_RESPONDER_A` el número exacto que figura en la lista *Para* de Meta.
- **Límite de Meta.** El bot solo puede responder dentro de las 24 horas de tu último mensaje. Como siempre le escribís vos primero, no afecta el uso normal.
- **Presupuesto.** Cuenta solo gastos en pesos. Los movimientos en dólares se muestran aparte.
- **Horario.** "Hoy" y "ayer" se calculan con la hora de Argentina.
