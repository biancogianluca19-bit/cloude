# Asistente de consultas sobre Tokko (v0.1)

Aplicación local para Gazda Rossi Propiedades. Pegás una consulta (mail de Tokko o WhatsApp), la app identifica la propiedad, trae la ficha y arma un borrador de respuesta para WhatsApp. Vos lo revisás y lo mandás a mano. **La app no envía nada.**

> **SIN VALIDAR CONTRA LA API REAL.** El normalizador se armó sin API key. Hay nombres de campo confirmados en el schema público de Tokko y otros supuestos (ver `src/normalizador.js` y `docs/PENDIENTES.md`). Hasta correr `npm run descubrir` con una key real, revisá cada número del borrador contra Tokko.

## Qué hace

1. Recibe el texto pegado o los datos cargados a mano (nombre, teléfono, mail, mensaje y propiedad).
2. Detecta la propiedad por ID de Tokko, código de referencia, URL, dirección o título. Si no está seguro, muestra candidatas y elegís.
3. Trae la ficha desde un caché que se sincroniza con Tokko cada 20 minutos (modo `live`) o desde las propiedades de EJEMPLO (modo `mock`).
4. Clasifica la pregunta: disponibilidad, precio, expensas, ubicación, ambientes, dormitorios, baños, cocheras, superficie, características, visita, requisitos de alquiler o pedido de info general.
5. Arma el borrador con voseo, la respuesta concreta y un próximo paso.
6. Lo que falta en la ficha aparece como `[A CONFIRMAR: ...]` en el texto y en una lista aparte.
7. Deriva a una persona (el borrador solo acusa recibo) cuando hay negociación, reserva o seña, documentación o temas legales, financiación o crédito, reclamos, propiedad no disponible o no encontrada, mensaje ambiguo o más de una propiedad.

## Requisitos

- Windows 10 u 11.
- Node.js 20 o más nuevo. Para ver si lo tenés, abrí PowerShell y escribí `node --version`.
  - Si dice que no existe o muestra una versión menor a 20: entrá a https://nodejs.org, bajá el instalador **LTS** para Windows, instalalo con las opciones por defecto y cerrá y volvé a abrir PowerShell.
- No hace falta instalar paquetes de npm: el proyecto no tiene dependencias.

## Instalar

1. Copiá la carpeta `tokko-asistente` a `C:\COSAS\PROYECTOS IA\GB SOLUCIONES TECH\tokko-asistente`.
   - Con git: `git clone` del repo y `git checkout claude/focused-rubin-qtd44g`. La app está en la subcarpeta `tokko-asistente`.
   - Sin git: en GitHub, botón **Code > Download ZIP** sobre esa rama, y copiás la subcarpeta.
2. Abrí PowerShell en esa carpeta:
   ```powershell
   cd "C:\COSAS\PROYECTOS IA\GB SOLUCIONES TECH\tokko-asistente"
   ```

## Configurar `.env`

1. Copiá el ejemplo:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Abrí `.env` con el Bloc de notas (`notepad .env`).
3. Para probar con propiedades de EJEMPLO no cambies nada: queda `TOKKO_MODE=mock`.
4. Para usar Tokko de verdad:
   - Pedile la API key a un usuario administrador de Tokko: la ve en **Mi empresa > Permisos**.
   - Pegala en `TOKKO_API_KEY=` y poné `TOKKO_MODE=live`.
   - No la mandes por chat ni la pegues en otro archivo. `.env` está en `.gitignore` y no se sube a git.

## Correr

```powershell
npm start
```

Abrí http://127.0.0.1:3000 en el navegador. Para cortar: `Ctrl + C` en PowerShell.

### Usarlo desde el celular

Por defecto solo responde en tu PC. Para abrirlo desde el celular en la misma red WiFi:

1. En `.env` poné `HOST=0.0.0.0`.
2. Buscá la IP de la PC con `ipconfig` (línea "Dirección IPv4", por ejemplo 192.168.0.15).
3. En el celular abrí `http://192.168.0.15:3000`.

Ojo: así cualquiera en esa red WiFi puede abrir la página y ver las consultas que pegás. Usalo solo en la red de la oficina o de tu casa. Windows puede pedirte permiso en el firewall la primera vez.

## Probar

```powershell
npm test
```

Corre 56 tests (parser, normalizador, clasificador, borradores, cada caso de derivación, cliente de Tokko, servidor y controles de seguridad).

Para probar a mano en modo mock, en la página usá el selector **Probar con un ejemplo**.

### Validar contra la API real (cuando tengas la key)

```powershell
npm run descubrir
```

Trae **una** propiedad con `GET /property/?limit=1`, guarda una copia saneada en `fixtures/propiedad-real-saneada.json` (sin datos internos, mails ni teléfonos) y muestra qué campos del normalizador aparecen en la respuesta real, sin mostrar valores. Esos dos archivos están en `.gitignore`.

Después:

1. Compará la copia saneada con la ficha de esa propiedad en Tokko (ambientes, dormitorios, superficies, expensas, estado).
2. Si algo no coincide, pasale a Claude la lista de campos (`fixtures/campos-detectados.json`, no tiene valores) para ajustar `src/normalizador.js`.
3. Cuando esté todo bien, poné `TOKKO_CAMPOS_VALIDADOS=true` en `.env`. Desaparece la banda "SIN VALIDAR".

### Regenerar los ejemplos

```powershell
npm run ejemplos
```

Reescribe `docs/EJEMPLOS.md` con la salida real del programa.

## Cómo se configura el tono

Todo está en `datos-inmobiliaria.json`:

- `tono`: saludo (`Hola {nombre}!`), saludo sin nombre y si usa emoji.
- `firma`: nombre del asesor. Con `texto` podés poner una firma completa.
- `visitas.horarios`: lista de horarios confirmados. Vacía = el borrador pregunta qué día le queda cómodo al cliente.
- `privacidad.direccionExacta`: `nunca`, `solo_fuera_de_barrios_cerrados` o `siempre`.
- `requisitosAlquiler.items`: lo que se lista cuando preguntan requisitos. Siempre sale con el aviso "VERIFICAR IMPORTES ANTES DE ENVIAR".
- `barrios` y `zonas`: nombres y variantes para detectar barrios. Agregá `"cerrado": false` a un barrio que no sea cerrado.

## Datos personales

- Todo corre en tu PC. Nada se manda a servicios externos ni a modelos de IA.
- `logs/consultas.log` guarda solo hora, id de consulta e id de propiedad.
- `data/cache-propiedades.json` guarda fichas normalizadas (sin datos internos ni de propietarios).
- Los fixtures tienen datos inventados (mails `example.com`, teléfonos con ceros).

## Estructura

```
server.js                  servidor local (node:http)
src/config.js              lectura de .env
src/tokko-cliente.js       cliente de Tokko, solo GET, oculta la key en errores
src/normalizador.js        JSON de Tokko -> ficha interna (lista blanca de campos)
src/repositorio.js         caché y sincronización
src/parser.js              contacto y referencias desde el texto pegado
src/identificador.js       qué propiedad es (o candidatas)
src/clasificador.js        qué pregunta y qué se deriva
src/borrador.js            plantillas del borrador
src/analizar.js            une todo el flujo
src/saneador.js, src/log.js
public/index.html          la página
fixtures/                  propiedades y consultas de EJEMPLO
docs/                      PENDIENTES, EJEMPLOS y schemas públicos de Tokko
scripts/                   descubrir-campos y generar-ejemplos
test/                      tests con node:test
```
