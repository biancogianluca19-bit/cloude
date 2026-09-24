import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotFoundMessage, buildOrderMessage, orderSubtotal, waLink, type OrderLine } from "../lib/whatsapp.ts";

const perot: OrderLine = {
  subject: "IPC",
  title: "Introducción al Pensamiento Científico",
  catedra: "Perot",
  programLabel: "UBA XXI",
  optionLabel: "Resumen completo",
  price: 13500,
};
const semio: OrderLine = {
  subject: "Semiología",
  title: "Semiología",
  catedra: "Verzero",
  programLabel: "UBA XXI",
  optionLabel: "Combo ambos parciales",
  price: 20000,
};

test("el link usa wa.me con el número limpio y el texto codificado", () => {
  const link = waLink("+54 9 11 6162-7734", "¡Hola Mel! 😊 ¿Tenés IPC & ICSE?");
  assert.ok(link.startsWith("https://wa.me/5491161627734?text="));
  const text = decodeURIComponent(link.split("text=")[1]!);
  assert.equal(text, "¡Hola Mel! 😊 ¿Tenés IPC & ICSE?");
  assert.ok(!link.includes(" "), "no debe tener espacios sin codificar");
  assert.ok(!link.includes("&", link.indexOf("text=")), "el & del texto tiene que ir codificado");
});

test("pedido de un solo material", () => {
  const msg = buildOrderMessage([perot]);
  assert.match(msg, /^¡Hola Mel! 😊 Vengo de tu página/);
  assert.match(msg, /📚 \*IPC\* – Introducción al Pensamiento Científico/);
  assert.match(msg, /🎓 UBA XXI · Cátedra Perot/);
  assert.match(msg, /📄 Resumen completo – \$13\.500/);
  assert.doesNotMatch(msg, /1\)/, "sin numeración cuando hay uno solo");
  assert.match(msg, /¿Me pasás los datos para pagar\?/);
});

test("pedido con varios materiales, total, descuento y datos opcionales", () => {
  const msg = buildOrderMessage([perot, semio], {
    name: "  Juli ",
    delivery: "WhatsApp",
    comment: "Rindo el lunes",
    multiSubjectPercent: 10,
  });
  assert.match(msg, /📚 1\) \*IPC\*/);
  assert.match(msg, /📚 2\) \*Semiología\*\n/, "si el título es igual a la materia no se repite");
  assert.match(msg, /Total según la web: \$33\.500/);
  assert.match(msg, /10% de descuento/);
  assert.match(msg, /Soy Juli\./);
  assert.match(msg, /📝 Rindo el lunes/);
  assert.equal(orderSubtotal([perot, semio]), 33500);
});

test("materiales sin precio se marcan a consultar", () => {
  const msg = buildOrderMessage([{ ...perot, price: undefined, optionLabel: "Resumen" }]);
  assert.match(msg, /Resumen \(a consultar\)/);
  assert.doesNotMatch(msg, /Total según la web/);
});

test("búsqueda sin resultados arma la consulta con lo que se buscó", () => {
  assert.equal(
    buildNotFoundMessage(" anatomía "),
    "¡Hola Mel! 😊 Estuve buscando «anatomía» en tu página y no lo encontré. ¿Tenés material de esta materia?",
  );
});
