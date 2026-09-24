// Recorre el flujo principal en un navegador real (Chromium) y guarda capturas.
// Uso: con el servidor corriendo → BASE=http://localhost:3717 npm run e2e
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3717";
const OUT = path.resolve(process.env.SHOTS ?? "test-data/screens");
fs.mkdirSync(OUT, { recursive: true });
const DEMO = path.resolve("demo-material");

const problems: string[] = [];
function watch(page: Page, tag: string) {
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${tag}] consola: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${tag}] excepción: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`[${tag}] HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
}

const proxy = process.env.E2E_INSECURE === "1" && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const args = proxy ? ["--disable-http2"] : [];
const browser = await chromium.launch({ proxy, args }).catch(() => chromium.launch({ proxy, args, executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }));

const PASSWORD = process.env.FORJA_PASSWORD_E2E;
async function loginIfNeeded(page: Page) {
  const pw = page.getByLabel("Contraseña");
  // Esperar a que la app decida: formulario de login o contenido.
  const which = await Promise.race([
    pw.waitFor({ timeout: 20000 }).then(() => "login"),
    page.locator(".app").waitFor({ timeout: 20000 }).then(() => "app"),
  ]).catch(() => "app");
  if (which === "login") {
    if (!PASSWORD) throw new Error("La instalación pide contraseña: definí FORJA_PASSWORD_E2E");
    await pw.fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForLoadState("networkidle");
  }
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

function step(msg: string) {
  console.log("•", msg);
}

// ------------------------------------------------------------------ Escritorio
const INSECURE = process.env.E2E_INSECURE === "1"; // solo para entornos con proxy que re-firma HTTPS
const desk = await browser.newContext({ viewport: { width: 1360, height: 880 }, colorScheme: "dark", ignoreHTTPSErrors: INSECURE });
// En entornos con proxy inestable, los pedidos al almacenamiento de Vercel se hacen desde Playwright.
if (INSECURE) await desk.route(/vercel-storage\.com|vercel\.com\/api\/blob/, async (route) => route.fulfill({ response: await route.fetch() }));
const page = await desk.newPage();
watch(page, "escritorio");

let newSubjectUrl = "";
try {
  step("Inicio");
  await page.goto(BASE + "/");
  await loginIfNeeded(page);
  await page.getByRole("heading", { name: "Tus materias" }).waitFor();
  await shot(page, "01-materias");

  step("Crear materia");
  await page.getByRole("button", { name: "Nueva materia" }).click();
  await page.getByLabel("Nombre").fill("Costos (prueba e2e)");
  await page.getByLabel("Profesor/a").fill("Prof. Prueba");
  await page.getByRole("button", { name: "Crear y cargar material" }).click();
  await page.waitForURL(/\/material\?nueva=1/);

  step("Cargar archivos reales");
  // Se pasan por contenido: Playwright no dispara la carga con rutas que tienen tildes.
  const files = fs.readdirSync(DEMO).map((f) => ({ name: f, mimeType: "application/octet-stream", buffer: fs.readFileSync(path.join(DEMO, f)) }));
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await page.getByRole("heading", { name: "Resultado de la carga" }).waitFor({ timeout: 90_000 });
  await page.getByText(/Security scan: \d+ alerta/).waitFor();
  const loaded = await page.locator(".list-item").filter({ hasText: /fragmento\(s\)/ }).count();
  if (loaded < files.length) problems.push(`solo se procesaron ${loaded} de ${files.length} archivos`);
  await shot(page, "02-material-cargado");
  newSubjectUrl = page.url().replace(/\/material.*$/, "");

  step("Decidir sobre una alerta");
  await page.getByRole("button", { name: "Mantener excluido" }).first().click();
  await page.waitForTimeout(500);

  step("Configurar examen");
  await page.goto(newSubjectUrl + "/examen");
  const d = new Date(Date.now() + 4 * 86400000);
  await page.locator('input[type="date"]').fill(d.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Guardar y armar plan" }).click();
  await page.getByRole("heading", { name: "Día por día" }).waitFor();
  await shot(page, "03-plan");

  step("Hoy");
  await page.goto(newSubjectUrl);
  await page.getByText("Qué estudiar ahora").waitFor();
  await shot(page, "04-hoy");

  step("Perfil del profesor");
  await page.goto(newSubjectUrl + "/profesor");
  await page.getByRole("heading", { name: "Método observado del profesor" }).waitFor();
  await page.getByText("Terminología que usa").click().catch(() => {});
  await shot(page, "05-perfil");

  step("Tutor");
  await page.goto(newSubjectUrl + "/tutor");
  await page.getByRole("button", { name: "¿Cómo resuelve este profesor el ejercicio 1.7?" }).click();
  await page.getByText("Modo demo").first().waitFor({ timeout: 20_000 });
  await page.getByLabel("Pregunta al tutor").fill("Dame otro ejercicio parecido de punto de equilibrio");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Resolver el ejercicio" }).waitFor();
  await shot(page, "06-tutor");

  step("Resolver el ejercicio con pistas y entregar");
  await page.getByRole("link", { name: "Resolver el ejercicio" }).click();
  await page.getByRole("button", { name: "Pista mínima" }).click();
  await page.locator(".hint-box").first().waitFor();
  const inputs = page.locator(".step-input input");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(1000 * (i + 1)));
  await shot(page, "07-ejercicio");
  await page.getByRole("button", { name: "Entregar" }).click();
  await page.getByRole("heading", { name: "Paso a paso" }).waitFor();
  await shot(page, "08-correccion");

  step("Mapa");
  await page.goto(newSubjectUrl + "/mapa");
  await page.locator("svg[aria-label='Mapa de temas']").waitFor();
  await shot(page, "09-mapa");

  step("Simulacro: crear, responder una pregunta y entregar");
  await page.goto(newSubjectUrl + "/simulacros");
  await page.getByRole("button", { name: "Empezar ahora" }).click();
  await page.waitForURL(/simulacro\/\d+/);
  await page.locator(".timer").waitFor();
  const radios = page.getByRole("radio");
  if (await radios.count()) await radios.first().click();
  await shot(page, "10-simulacro");
  await page.getByRole("button", { name: "Entregar", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entregar" }).click();
  await page.getByRole("heading", { name: /corrección/ }).waitFor({ timeout: 30_000 });
  await shot(page, "11-simulacro-corregido");

  step("¿Estoy para aprobar?");
  await page.goto(newSubjectUrl + "/aprobar");
  await page.getByText(/Readiness \d+\/100/).waitFor();
  await shot(page, "12-aprobar");

  step("Errores y tarjetas");
  await page.goto(newSubjectUrl + "/errores");
  await page.getByRole("heading", { name: "Memoria de errores" }).waitFor();
  await page.goto(newSubjectUrl + "/tarjetas");
  await page.getByRole("heading", { name: "Tarjetas" }).waitFor();
  const show = page.getByRole("button", { name: "Mostrar respuesta" });
  if (await show.count()) {
    await show.click();
    await page.getByRole("button", { name: /Bien/ }).click();
  }
  await shot(page, "13-tarjetas");

  step("Sesión de estudio");
  await page.goto(newSubjectUrl + "/estudiar");
  await page.getByRole("button", { name: "30 min" }).click();
  await page.getByRole("button", { name: /Empezar 30 minutos/ }).click();
  await page.getByText(/Tarea 1/).waitFor();
  await shot(page, "14-sesion");

  step("Paleta de comandos y modo claro");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Buscá una pantalla/).fill("carga fabril");
  await page.waitForTimeout(500);
  await shot(page, "15-paleta");
  await page.keyboard.press("Escape");

  step("Persistencia: recargar");
  await page.goto(newSubjectUrl + "/errores");
  await page.reload();
  await page.getByRole("heading", { name: "Memoria de errores" }).waitFor();
} catch (e) {
  await page.screenshot({ path: path.join(OUT, "FALLA-escritorio.png"), fullPage: true }).catch(() => {});
  console.error("Falla en escritorio; captura en FALLA-escritorio.png");
  throw e;
}
await desk.close();

// ------------------------------------------------------------------ Celular
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "light", ignoreHTTPSErrors: INSECURE });
const m = await phone.newPage();
watch(m, "celular");
step("Celular: Hoy");
await m.goto(newSubjectUrl);
await loginIfNeeded(m);
await m.getByText("Qué estudiar ahora").waitFor();
await shot(m, "20-cel-hoy");
const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 1) problems.push(`[celular] scroll horizontal de ${overflow}px en Hoy`);
step("Celular: practicar");
await m.getByRole("navigation", { name: "Navegación" }).getByRole("link", { name: "Practicar" }).click();
await m.getByRole("button", { name: "Nuevo ejercicio" }).click();
await m.waitForURL(/ejercicio\/\d+/);
await m.locator(".step-input input, [role=radio]").first().waitFor();
await shot(m, "21-cel-ejercicio");
const ov2 = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (ov2 > 1) problems.push(`[celular] scroll horizontal de ${ov2}px en ejercicio`);
step("Celular: tutor y menú Más");
await m.goto(newSubjectUrl + "/tutor");
await m.getByRole("heading", { name: "Tutor" }).waitFor();
await shot(m, "22-cel-tutor");
await m.getByRole("button", { name: "Más" }).click();
await shot(m, "23-cel-mas");
await m.goto(newSubjectUrl + "/mapa");
await m.getByRole("heading", { name: "Mapa de temas" }).waitFor();
await shot(m, "24-cel-mapa");
await phone.close();

if (process.env.E2E_CLEANUP === "1") {
  step("Limpieza: borrar la materia de prueba");
  const ctx = await browser.newContext({ ignoreHTTPSErrors: INSECURE });
  const p = await ctx.newPage();
  await p.goto(newSubjectUrl + "/config");
  await loginIfNeeded(p);
  p.on("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Borrar", exact: true }).click();
  await p.waitForURL(BASE + "/");
  await ctx.close();
}
await browser.close();

console.log(`\nCapturas en ${OUT}`);
if (problems.length) {
  console.log("\nProblemas detectados:");
  for (const p of problems) console.log(" -", p);
  process.exit(1);
}
console.log("Sin errores de consola ni respuestas 5xx.");
