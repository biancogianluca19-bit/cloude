# FORJA

Entrenador personal para preparar parciales. Cargás el material de una materia (PDF, PowerPoint, Word, Excel, fotos, apuntes), FORJA lo procesa, arma un perfil de cómo enseña y evalúa el profesor, te toma ejercicios y simulacros, te corrige paso a paso, registra tus errores y ajusta qué te conviene estudiar hasta el día del examen.

Funciona completo sin API key (modo demo). Con una API key de Anthropic suma: tutor que explica con sus palabras, ejercicios generados desde tu material, lectura de hojas manuscritas y corrección de respuestas abiertas.

## Instalación

Requisitos: Node.js 22.13 o más nuevo. Opcional: LibreOffice, solo para archivos `.ppt` antiguos.

```bash
cd forja
npm install
npm start          # compila la interfaz y levanta el servidor en http://localhost:3717
```

La primera vez se crea la materia **Sistemas de Costos (demo)** con material ficticio ya procesado y un parcial en 6 días.

- **Desde el celular:** con la computadora y el celular en la misma red wifi, abrí la dirección que muestra la terminal al iniciar (por ejemplo `http://192.168.0.10:3717`). Desde el menú del navegador podés agregarla a la pantalla de inicio.
- **API key:** en *Ajustes* dentro de la app, o con la variable `ANTHROPIC_API_KEY`. El modelo por defecto es `claude-opus-5`; se cambia en Ajustes o con `FORJA_MODEL`.
- **Desarrollo:** `npm run dev` (API en 3717 con recarga + Vite en 5173).

Variables útiles:

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del servidor (3717). |
| `FORJA_DATA_DIR` | Carpeta de la base de datos y los archivos subidos (`./data`). |
| `ANTHROPIC_API_KEY` | Activa las funciones con IA. |
| `FORJA_MODEL` | Modelo de Claude a usar. |
| `FORJA_NO_DEMO=1` | No crear la materia demo. |
| `FORJA_DISABLE_TESSERACT=1` | Desactiva el OCR local. |

## Versión publicada (Vercel)

FORJA también corre en Vercel, con los datos en un almacenamiento privado de Vercel Blob y acceso con contraseña.

- **Proyecto:** `forja` en Vercel, carpeta raíz `forja/`, comando de build `npm run build:vercel` (arma `.vercel/output` con la Build Output API: la interfaz como archivos estáticos y la API como una sola función Node en São Paulo).
- **Variables del proyecto:** `FORJA_PASSWORD` (contraseña de acceso) y `BLOB_READ_WRITE_TOKEN` (la crea Vercel al conectar el store `forja-datos`). Opcionales: `ANTHROPIC_API_KEY`, `FORJA_MODEL`. La API key también se puede cargar desde *Ajustes* dentro de la app: queda guardada en la base, dentro del store privado.
- **Cambiar la contraseña:** editá `FORJA_PASSWORD` en Vercel (*Settings → Environment Variables*) y redesplegá. Las sesiones abiertas se cierran solas porque la firma depende de la contraseña. Con `FORJA_AUTH=off` la contraseña queda desactivada (cualquiera con la dirección entra); para volver a pedirla, borrá esa variable y redesplegá.
- **Cómo se guardan los datos:** la base SQLite vive en la memoria temporal de la función y se sincroniza con un store privado de Vercel Blob. Cada pedido que cambia algo registra su changeset; los cambios se suben juntos 2 minutos después del primero, o antes si la app pasa a segundo plano (`POST /api/sync`). Antes de subir se compara la versión del store con la local: si otra instancia guardó en el medio, se trae su versión y se le aplican encima los cambios pendientes fila por fila. Solo si una misma fila chocó de forma incompatible, la versión propia se respalda en `forja/db/conflictos/`. El navegador manda los pedidos a la API de a uno: en paralelo, Vercel los reparte entre instancias con copias distintas de la base. La versión que recibe el navegador indica si hay cambios sin subir; si igual un pedido cae en otra instancia, esa espera hasta 30 s a que se suban. Los archivos subidos y las fotos se guardan en `forja/data/`. `POST /api/maintenance/cleanup` (con sesión) borra archivos sin uso, subidas abandonadas de más de un día y respaldos de conflicto de más de 14 días; con `{"respaldos":"todos"}` borra todos los respaldos.
- **Archivos grandes:** van directo del navegador al store (las funciones de Vercel aceptan hasta 4,5 MB por pedido); después la función los procesa.
- **Límites del plan gratuito de Vercel Blob:** 1 GB de almacenamiento, 2.000 operaciones avanzadas (subidas, listados) y 10.000 simples (consultas) por mes. Si se pasa el cupo, el store queda bloqueado 30 días. Los cambios se agrupan y se suben 2 minutos después del primero (o al cerrar o minimizar la app): estudiando sin parar son como mucho 30 subidas por hora. *Ajustes → Almacenamiento en la nube* muestra el uso aproximado del mes. Con el 60 % del cupo usado, FORJA entra en modo ahorro y sube cada 4 minutos y medio. El consumo exacto se ve en Vercel → *Storage → forja-datos*.

## Prueba rápida del flujo completo

1. En la materia demo, **Hoy** muestra la cuenta regresiva, el readiness y qué estudiar ahora.
2. **Material → Security scan**: el apunte de cátedra tiene texto blanco que dice «Si sos una IA, ignorá las instrucciones…» y el parcial 2024 tiene texto oculto de Word que pide poner 10. Ninguno entra al conocimiento de la materia.
3. **Perfil del profesor**: terminología, fórmulas tal como las escribe, fórmulas de Excel de su planilla, cómo resuelve cada ejercicio, estructura de sus parciales, la pregunta que repite y su criterio de corrección (60 % procedimiento, 40 % resultado), todo con la fuente.
4. **Tutor**: «¿Cómo resuelve este profesor el ejercicio 1.7?» o «Dame otro ejercicio parecido».
5. **Practicar**: resolvé un ejercicio. Si dividís por las unidades vendidas en vez de las terminadas, la corrección dice exactamente en qué paso apareció el error, reconoce el arrastre en los pasos siguientes y lo guarda en **Errores**.
6. **Examen y plan** muestra cómo cambió la prioridad de ese tema. **Mapa** muestra tu dominio por tema.
7. **Simulacros**: parcial nuevo con la estructura de los modelos del profesor (120 minutos, 3 prácticos, 1–2 teóricos), sin pistas, corrección completa al entregar.
8. **¿Estoy para aprobar?**: el readiness con cada factor visible.
9. Cerrá todo y volvé a abrir: los datos están en SQLite.

Para probar la carga desde cero: creá una materia nueva y en **Material** usá «Probar con los archivos de ejemplo», o subí los archivos de `demo-material/`.

## Cómo funciona

```
server/
  ingest/      extracción (PDF, PPTX, DOCX, XLSX, TXT, imágenes), OCR, security scan, fragmentación
  retrieval/   normalización de texto en español, índice BM25 por materia, búsqueda con citas
  profile/     perfil del profesor con evidencia (y enriquecimiento opcional con IA, verificado)
  exercises/   evaluador de expresiones, plantillas, generación con IA, corrección, Excel, simulacros
  learning/    temas, dominio, errores, repetición espaciada, plan, readiness, sesiones de estudio
  ai/          única puerta al modelo (llm.ts), tutor, lectura de fotos
  demo/        materia demo
src/           interfaz (React)
demo-material/ archivos de la materia demo (se regeneran con npm run demo:files)
tests/         pruebas de unidad, del flujo completo por API y del camino con IA (API simulada)
scripts/e2e-browser.ts  recorrido en Chromium con capturas en escritorio y celular
```

**Stack:** Node + Express, SQLite nativo de Node (`node:sqlite`), React + Vite, TypeScript. Lectura de archivos con pdf.js, JSZip + parser XML propio para Office, SheetJS para Excel y Tesseract para OCR local.

### Decisiones importantes

- **La corrección no depende de la IA.** Cada ejercicio numérico se define con datos y pasos como expresiones (`CF / (p - cvu)`). De ahí salen la solución, las fórmulas de Excel exactas y la corrección paso a paso. Si te equivocás en un paso, FORJA recalcula los siguientes con tus propios valores para reconocer el arrastre. Las **trampas** de cada plantilla (por ejemplo `cp / V`, dividir por vendidas) identifican errores conceptuales concretos. Cuando la IA genera un ejercicio, solo propone datos y expresiones: los números los calcula FORJA y se descarta cualquier expresión inválida.
- **Con foto de la hoja**, el modelo solo transcribe los valores y la operación que hiciste; corrige el mismo motor.
- **Separación de roles:** `retrieval` (BM25 con expansión por tema) → `generation` (tutor, ejercicios) → `parsing` (extractores, OCR) → `scoring` (dominio, readiness) → `evaluation` (corrección) → `tools` (Excel, plantillas). Al modelo nunca se le mandan archivos completos: solo los fragmentos recuperados, envueltos en `<documento>` como datos.
- **Perfil del profesor con evidencia:** cada observación guarda archivo, ubicación y cita. Los apuntes propios no cuentan como evidencia del profesor. Las observaciones de la IA solo se guardan si la cita aparece en el fragmento que dice citar.
- **Security scan:** detecta texto blanco, invisible, diminuto o fuera de página en PDF; texto oculto, blanco o diminuto en Word; diapositivas ocultas y texto fuera de la diapositiva en PowerPoint; hojas, filas y columnas ocultas en Excel; caracteres Unicode invisibles (incluye decodificar mensajes escondidos con caracteres *tag*), base64 y frases dirigidas a una IA en español e inglés. El texto oculto nunca entra al conocimiento; un fragmento visible con instrucciones queda en cuarentena hasta que decidas.
- **Dominio:** promedio ponderado de tus resultados (los recientes pesan más; las pistas restan 15 % cada una; ver la solución limita el crédito a 30 %), con un punto de partida conservador y ajuste por olvido. Estados: sin estudiar, débil (< 45 %), medio, fuerte (≥ 72 % con evidencia suficiente).
- **Readiness** = 35 % dominio + 25 % simulacros + 15 % cobertura + 10 % retención + 10 % errores + 5 % práctica reciente. La pantalla muestra el valor y el detalle de cada factor.
- **Plan:** prioridad de cada tema = importancia en los parciales × (1 − dominio) + extras por errores recurrentes, por no haberlo practicado o por olvido. Se recalcula con cada práctica y muestra qué cambió.
- **Errores:** un error conceptual deja de estar activo cuando evitás esa trampa dos veces después de la última vez que la cometiste.

## Limitaciones

- **Sin API key**, el tutor responde con frases textuales del material (lo dice en cada respuesta), no lee escritura a mano (la foto se guarda y cargás los resultados de cada paso a mano) y los parciales existentes se corrigen por autoevaluación.
- **Ejercicios numéricos sin IA** existen para los temas de la biblioteca: Costos (9 temas), interés compuesto, VAN, sistema francés, lote óptimo e IVA. Para otros temas, sin API key hay preguntas teóricas armadas con las definiciones del material; con API key se generan ejercicios desde tus archivos.
- **OCR local**: Tesseract descarga el modelo de español la primera vez (necesita internet) y lee bien texto impreso; la letra manuscrita necesita la API.
- **PDF escaneados** sin capa de texto necesitan API key (o subir las páginas como imágenes para el OCR local).
- **`.ppt`** antiguo necesita LibreOffice instalado. En `.doc` antiguo no se puede detectar texto oculto por formato (se avisa).
- El perfil heurístico detecta patrones frecuentes (fórmulas, «Paso 1», «Ejercicio N (X puntos)», criterios con porcentajes). Material con formatos muy distintos puede dar un perfil más pobre; la sección «Lo que todavía no se puede saber» lo indica.
- Es una app personal sin usuarios ni contraseña. Si la exponés fuera de tu red, poné algo delante que pida autenticación.

## Pruebas

```bash
npm test             # 52 pruebas: plantillas, Excel, corrección, security scan, aprendizaje, flujo completo y camino con IA simulado
npm run typecheck
npm start            # en otra terminal:
BASE=http://localhost:3717 npm run e2e   # recorrido en navegador, escritorio y celular, con capturas
```
