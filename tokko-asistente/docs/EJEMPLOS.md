# Ejemplos de borradores

Generado con `npm run ejemplos` el 3/10/2026, en modo mock, con las propiedades de EJEMPLO de `fixtures/propiedades-ejemplo.json` y la configuración actual de `datos-inmobiliaria.json`. Los textos son la salida real del programa, sin retoques.

Las propiedades y los contactos son inventados. Los campos de Tokko están SIN VALIDAR contra la API real.

## 1. Mail con etiquetas: disponibilidad, expensas y visita con día propuesto

**Consulta pegada:**

> Nombre: Martina Ejemplo
> Email: martina@example.com
> Teléfono: +54 9 11 0000-1111
> Propiedad: EJEMPLO - Casa en Santa Juana (EJ-101)
> Mensaje: Hola, sigue disponible? cuanto son las expensas? Se puede ir a ver el sábado a la mañana?

**Propiedad:** EJ-101 (código de referencia, título, zona (Santa Juana), tipo)  
**Pregunta por:** Disponibilidad, Expensas, Coordinar visita  
**Derivar:** no

**Borrador:**

```text
Hola Martina! 👋

Gracias por consultar por la casa en venta en Santa Juana, Canning (ref. EJ-101).

Por lo que figura en nuestra ficha, está disponible.
Las expensas figuran en 180.000 [A CONFIRMAR: moneda de las expensas].

Sobre la visita, [A CONFIRMAR: si se puede el día u horario que propone el cliente].

Gianluca | Gazda Rossi Propiedades
```

**A confirmar:**

- moneda de las expensas
- si se puede el día u horario que propone el cliente

**Avisos:**

- La disponibilidad sale de Tokko (campo de estado), dato de las 22:12. Confirmá antes de enviar.

## 2. WhatsApp sin código, en Canning Chico (primero pide elegir la propiedad)

**Consulta pegada:**

> [4/10/26, 10:15] Ramiro Ejemplo: Hola buenas! vi la casa de alquiler en canning chico, acepta mascotas? tengo un perro mediano. q requisitos piden?

**Primer análisis:** identificación `candidatos`, candidatas: EJ-102. La pantalla muestra "DERIVAR A PERSONA: mensaje ambiguo" hasta que elegís una. Se eligió 900002.

**Propiedad:** EJ-102 (elegida a mano)  
**Pregunta por:** Requisitos de alquiler, Características, mascotas  
**Derivar:** no

**Borrador:**

```text
Hola Ramiro! 👋

Gracias por consultar por la casa en alquiler en Canning Chico, Canning (ref. EJ-102).

Según la ficha, acepta mascotas.
Para alquilar, los requisitos son:
- Garantía propietaria
- Un mes de alquiler
- Un mes de depósito
- Honorarios: 4,15% + IVA sobre el total de 24 meses
- Sellado: 1%
- Certificados: aprox. ARS 200.000

Si querés conocerla, coordinamos una visita. ¿Qué día y horario te quedan cómodos?

Gianluca | Gazda Rossi Propiedades
```

**Avisos:**

- VERIFICAR IMPORTES ANTES DE ENVIAR: el borrador incluye requisitos y costos de alquiler de referencia (datos-inmobiliaria.json).

## 3. Mala ortografía: precio y metros del lote en El Rodal

**Consulta pegada:**

> ola kiero saver el presio del lote en el rodal y cuantos metros tiene

**Primer análisis:** identificación `candidatos`, candidatas: EJ-103. La pantalla muestra "DERIVAR A PERSONA: mensaje ambiguo" hasta que elegís una. Se eligió 900003.

**Propiedad:** EJ-103 (elegida a mano)  
**Pregunta por:** Precio, Superficie  
**Derivar:** no

**Borrador:**

```text
Hola! 👋

Gracias por consultar por el lote en venta en El Rodal, Esteban Echeverria (ref. EJ-103).

El valor publicado es USD 48.000.
Tiene una superficie de 1.000 m².

Si querés conocerlo, coordinamos una visita. ¿Qué día y horario te quedan cómodos?

Gianluca | Gazda Rossi Propiedades
```

**Avisos:**

- El precio sale de Tokko, dato de las 22:12. Confirmá antes de enviar.

## 4. Datos que faltan en la ficha: precio sin publicar y cochera

**Consulta pegada:**

> Hola cuanto sale el alquiler del depto EJ-104? tiene cochera? Gracias, Sofía Ejemplo 11 0000 3333

**Propiedad:** EJ-104 (código de referencia, tipo, operación)  
**Pregunta por:** Precio, Cocheras  
**Derivar:** no

**Borrador:**

```text
Hola! 👋

Gracias por consultar por el departamento en alquiler en Canning, Esteban Echeverria (ref. EJ-104).

Sobre el valor, [A CONFIRMAR: precio].
Cocheras: [A CONFIRMAR: si tiene cochera y cuántas].

Si querés conocerlo, coordinamos una visita. ¿Qué día y horario te quedan cómodos?

Gianluca | Gazda Rossi Propiedades
```

**A confirmar:**

- precio
- si tiene cochera y cuántas

## 5. Negociación: se deriva a una persona

**Consulta pegada:**

> Hola, la casa de Terralagos ref EJ-106 la dejan en 350 mil dolares? tengo el efectivo

**Propiedad:** EJ-106 (código de referencia, zona (Terralagos), tipo)  
**Pregunta por:** nada reconocido  
**Derivar:** sí (Negociación de precio u oferta)

**Borrador:**

```text
Hola! 👋

Gracias por escribirnos por la casa en venta en Terralagos, Ezeiza (ref. EJ-106). Recibimos tu consulta y la está viendo un asesor, que te responde por este medio.

Gianluca | Gazda Rossi Propiedades
```

**Nota interna:**

```text
DERIVAR A PERSONA.
- Negociación de precio u oferta: detectado en el mensaje
```

Todos los borradores en modo mock muestran además dos avisos fijos: "Modo mock: la ficha es un EJEMPLO" y "Campos de Tokko SIN VALIDAR contra la API real".
