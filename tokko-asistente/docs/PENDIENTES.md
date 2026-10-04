# Pendientes de la v0.1

Estado al 4/10/2026.

## Qué quedó sin validar

### Campos de la propiedad en la API de Tokko

No hubo API key durante el desarrollo, así que no se pudo traer ninguna propiedad real. Lo que se sabe:

| Fuente | Qué confirma |
|---|---|
| Schema público del playground (`docs/referencia-tokko/playground-schema-properties.json`) | Existen estos campos de propiedad (se usan para ordenar y filtrar): `price`, `location`, `suite_amount`, `age`, `situation`, `expenses`, `room_amount`, `bathroom_amount`, `toilet_amount`, `parking_lot_amount`, `floors_amount`, `surface`, `roofed_surface`, `semiroofed_surface`, `total_surface`. Tipos de operación 1 Venta, 2 Alquiler, 3 Alquiler temporario. Monedas USD y ARS. Tipos de tag: 1 servicios, 2 ambientes, 3 adicionales. |
| Respuesta real de `/location/quicksearch/` (endpoint público, sin key) | Formato de listas `{ meta: { total_count }, objects: [...] }` y objetos de ubicación con `id`, `name`, `full_location`, `type`. Guardado en `fixtures/tokko-real-location-quicksearch-canning.json`. |

Supuestos que hay que comprobar con `npm run descubrir`:

- [ ] `room_amount` = ambientes y `suite_amount` = dormitorios.
- [ ] `surface` = superficie del terreno y `total_surface` = superficie total.
- [ ] Formato de `operations[].prices[]` (`currency`, `price`, `period`) y de `operations[].operation_type`.
- [ ] Nombres `reference_code`, `publication_title`, `type.name`, `tags[].name`, `public_url`, `fake_address` / `address` / `real_address`, `web_price`.
- [ ] Campo y valores del estado de la propiedad (`status`): si es texto o número. Hoy se reconoce texto ("Disponible", "Reservada", "Vendida"); si es número, se usa la regla de Tokko "la API solo devuelve Disponibles y publicadas".
- [ ] Moneda de las expensas. Hoy sale `[A CONFIRMAR: moneda de las expensas]` porque no se encontró un campo.
- [ ] Cómo vienen "Apto crédito" y "Apto mascotas": como tag, como campo propio o no vienen.
- [ ] Si `0` en ambientes o cocheras significa "cero" o "no cargado". Hoy se trata como no cargado y pide confirmación.
- [ ] Qué devuelve `/property/{id}/` para una propiedad reservada o sin publicar.

### Otros

- [ ] Formato del mail de notificación de consultas de Tokko. El parser es genérico (líneas con etiquetas, chat de WhatsApp, texto libre). **Pegame un mail real con nombre, teléfono y mail tapados** para armar el parser sobre ese formato.
- [ ] Redacción de los requisitos de alquiler: "Un mes de alquiler" (¿es el primer mes por adelantado?) y "Sellado: 1%" (¿1% de qué base?). Los textos están tal cual los dijiste, en `datos-inmobiliaria.json`.
- [ ] Cuáles de los barrios de la lista NO son cerrados. Hoy todos cuentan como cerrados para no dar la dirección exacta. Marcá `"cerrado": false` en los que corresponda.
- [ ] Horarios y reglas de visita (`datos-inmobiliaria.json > visitas`). Vacío: el borrador pregunta qué día le queda cómodo al cliente.
- [ ] Lista de asesores, por si responde alguien más que vos.

## Qué preguntarle a soporte de Tokko

1. ¿Existe un webhook o aviso automático cuando entra una consulta nueva? ¿Se puede activar en nuestro plan?
2. El playground lista `GET /api/v1/contact/` y `/contact/{id}/` (contactos). ¿Están habilitados en nuestro plan? ¿Se pueden actualizar contactos por API?
3. El playground lista `GET /api/v1/inactiveproperty/`. ¿Qué devuelve? Serviría para decir "figura vendida/reservada" en vez de "no la encuentro".
4. ¿Nuestro plan permite traer propiedades no publicadas (con "Publicar" desactivado)?
5. El `POST /webcontact/` del playground usa campos `name`, `cellphone`, `phone`, `email`, `work_name`, `text`, `properties`, `tags`, `agent_mail`. Por soporte nos dijeron nombre, mail, teléfono, mensaje y `property_id`. ¿Cuál es el formato correcto? (No se usa en la v0.1.)
6. ¿Qué valores puede tener el campo de estado de una propiedad y cómo viene la moneda de las expensas?
7. ¿Hay límite de pedidos por minuto en la API?

## Decisiones técnicas tomadas sin consultar

- El proyecto quedó en la subcarpeta `tokko-asistente/` del repo `cloude`, porque la sesión corrió en la nube sin acceso a `C:\`.
- Intención extra **expensas**, separada de precio, porque es una pregunta frecuente en barrios cerrados.
- Intención **pedido de info general** ("me interesa, ¿me pasás info?"): responde precio, ubicación y lo que tenga la ficha, sin marcar como faltante lo que no se preguntó.
- "Contrato" y "deudas" se derivan como tema legal.
- "¿Es apto crédito?" se responde con la ficha. Cualquier otra mención de crédito, banco, cuotas o financiación se deriva.
- Las coincidencias solo por barrio, tipo u operación siempre muestran candidatas para elegir, aunque haya una sola.
- Una consulta por "Canning" no ofrece la propiedad de Canning Chico como candidata (y "Adrogué" no cuenta "Adrogué Chico").
- El valor `0` en un campo numérico se trata como "no cargado".
- Sincronización del caché cada 20 minutos.
- El servidor escucha solo en 127.0.0.1. Para el celular hay que cambiar `HOST` a propósito.
- Los nombres que Tokko escribe sin tilde ("Adrogue", "Santa Ines") se muestran con la ortografía de `datos-inmobiliaria.json`.
- Las preguntas que el clasificador no reconoce quedan en el borrador como `[A CONFIRMAR: respuesta a «...»]`.

## Próximos pasos

- **v0.2** – Lectura automática de los mails de notificación de Tokko (necesita el formato real del mail y tu OK para leer Gmail).
- **v0.3** – Webhook de consultas nuevas, si Tokko lo habilita.
- **v0.4** – Envío por WhatsApp Business API solo para respuestas simples (sin derivación y sin datos a confirmar).
