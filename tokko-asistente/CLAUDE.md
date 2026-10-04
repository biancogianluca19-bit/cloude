# CLAUDE.md – tokko-asistente

Asistente local de Gazda Rossi Propiedades (cliente cero; después producto de GB Soluciones Tecnológicas). Tokko es el CRM y la fuente de las propiedades: no armar base de propiedades ni CRM paralelo.

## Qué hace la v0.1

Recibe una consulta pegada, identifica la propiedad, trae la ficha de Tokko (o de `fixtures/` en modo mock), clasifica la pregunta y arma un borrador de WhatsApp. El usuario lo revisa y lo manda a mano. **La herramienta no envía nada.**

## Reglas del borrador (no negociables)

- Solo datos de la ficha y de `datos-inmobiliaria.json`. Lo que falte va como `[A CONFIRMAR: ...]` en el texto y en la lista aparte.
- No promete precio, disponibilidad ni horarios no confirmados. Sin horarios en `datos-inmobiliaria.json`, pregunta qué día le queda cómodo al cliente.
- Deriva a persona (el borrador solo acusa recibo + nota interna con el motivo) ante: negociación u ofertas, reservas o señas, documentación/escritura/legal, financiación o crédito, reclamos, propiedad no disponible o no encontrada, mensaje ambiguo o con más de una propiedad.
- Ficha no disponible: deriva. Propiedad no encontrada: "no la encuentro, revisar en Tokko", nunca "no existe".
- Sin adjetivos que no estén en la ficha. Nada de "increíble oportunidad". No usar la descripción ni el título de la publicación.
- Requisitos de alquiler: siempre con el aviso "VERIFICAR IMPORTES ANTES DE ENVIAR".
- Canning (localidad) y Canning Chico (barrio privado) nunca son sinónimos. Lo mismo Adrogué y Adrogué Chico.
- Español argentino con voseo, corto, con un próximo paso.

## Técnica

- Node.js 20+, sin dependencias externas (`fetch` nativo, `node:http`, `node:test`). Plantillas deterministas, sin IA.
- `npm test` tiene que pasar antes de dar algo por terminado. Mostrar la salida real.
- Modo `mock` por defecto si no hay `TOKKO_API_KEY`. En `live` el código solo hace GET.
- Normalizador con lista blanca: la "información interna" de Tokko (propietarios, productor, comisiones) nunca se guarda ni se muestra.
- Caché con sincronización cada 15 a 30 minutos (no hay webhooks de propiedades). GET puntual solo si un ID no está en caché.

## Límites de autonomía

Sin preguntar: crear y editar archivos de esta carpeta, correr tests y el servidor local, GET a Tokko y a su documentación pública, decisiones técnicas menores.

Pedir OK antes de: instalar dependencias npm, cualquier llamada a Tokko que no sea GET (sobre todo el POST a `webcontact`), usar servicios de pago o APIs de IA (explicar costo y alternativa), publicar o desplegar (Vercel u otro), leer Gmail, enviar mails o mensajes, `git push` o crear repos remotos, borrar archivos que no se crearon en la tarea.

Nunca: poner la API key en código, logs, commits o chat; inventar campos de la API, propiedades, precios o datos de contacto; decir que se probó algo que no se corrió.

## Datos personales

Las consultas traen datos de terceros: todo queda local. Logs solo con hora, id de consulta e id de propiedad. Fixtures sin datos reales. No abrir ni listar nada fuera de esta carpeta; en la carpeta de arriba hay un archivo con códigos de recuperación de Vercel que no se toca.

## Estado

Ver `docs/PENDIENTES.md`. La v0.2 (lectura automática de los mails de Tokko) no se empieza sin pedido explícito.
