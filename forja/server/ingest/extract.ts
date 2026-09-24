import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { parseXml, find, findAll, child, textOf, type XNode } from "./xml.ts";

export interface HiddenSpan {
  text: string;
  reason: string;
}

export interface Unit {
  /** Ubicación legible: "p. 3", "diapositiva 4", "hoja «Costos»", "sección «Unidad 2»". */
  location: string;
  page?: number;
  heading?: string;
  text: string;
  hidden: HiddenSpan[];
}

export interface ExcelCell {
  sheet: string;
  cell: string;
  formula: string;
  value: string;
  label: string;
}

export interface Extraction {
  units: Unit[];
  cells: ExcelCell[];
  extractor: string;
  warnings: string[];
  /** Páginas o imágenes sin texto que necesitan OCR. */
  needsOcr: boolean;
}

export const SUPPORTED = ["pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "xlsm", "csv", "txt", "md", "png", "jpg", "jpeg", "webp", "gif"];
export const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif"];

export async function extractFile(filePath: string, ext: string): Promise<Extraction> {
  ext = ext.toLowerCase();
  const buf = fs.readFileSync(filePath);
  switch (ext) {
    case "pdf":
      return extractPdf(buf);
    case "pptx":
      return extractPptx(buf);
    case "ppt":
      return extractLegacyOffice(filePath, "pptx", extractPptx);
    case "docx":
      return extractDocx(buf);
    case "doc":
      return extractDoc(filePath);
    case "xlsx":
    case "xlsm":
    case "xls":
    case "csv":
      return extractSheet(buf);
    case "txt":
    case "md":
      return extractText(buf);
    default:
      if (IMAGE_EXT.includes(ext)) {
        return { units: [], cells: [], extractor: "imagen", warnings: [], needsOcr: true };
      }
      throw new Error(`Formato no soportado: .${ext}`);
  }
}

// ---------------------------------------------------------------- PDF

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const req = createRequire(import.meta.url);
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const worker = req.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(worker).href;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

function hexIsWhite(hex: string): boolean {
  const h = hex.replace("#", "").toLowerCase();
  if (h.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return r >= 245 && g >= 245 && b >= 245;
}

async function extractPdf(buf: Buffer): Promise<Extraction> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;
  const units: Unit[] = [];
  const warnings: string[] = [];
  let emptyPages = 0;
  const OPS = pdfjs.OPS;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const hidden: HiddenSpan[] = [];

    // 1) Texto dibujado en blanco o en modo invisible, leyendo la lista de operadores.
    const hiddenStrings: { text: string; reason: string }[] = [];
    try {
      const ops = await page.getOperatorList();
      let fill = "#000000";
      let mode = 0;
      const stack: [string, number][] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const args = ops.argsArray[i];
        if (fn === OPS.save) stack.push([fill, mode]);
        else if (fn === OPS.restore) [fill, mode] = stack.pop() ?? ["#000000", 0];
        else if (fn === OPS.setFillRGBColor) {
          fill = typeof args?.[0] === "string" ? args[0] : "#" + [args[0], args[1], args[2]].map((v: number) => Math.round(v > 1 ? v : v * 255).toString(16).padStart(2, "0")).join("");
        } else if (fn === OPS.setFillGray) {
          const g = Number(args?.[0] ?? 0);
          fill = g >= 0.96 ? "#ffffff" : "#000000";
        } else if (fn === OPS.setTextRenderingMode) mode = Number(args?.[0] ?? 0);
        else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
          const white = hexIsWhite(fill);
          const invisible = mode === 3 || mode === 7;
          if (!white && !invisible) continue;
          const glyphs = (fn === OPS.nextLineSetSpacingShowText ? args[2] : args[0]) ?? [];
          const s = (Array.isArray(glyphs) ? glyphs : [])
            .map((g: any) => (typeof g === "number" ? (g < -200 ? " " : "") : g?.unicode ?? ""))
            .join("");
          if (s.trim()) hiddenStrings.push({ text: s, reason: white ? "texto en color blanco" : "texto con modo de renderizado invisible" });
        }
      }
    } catch {
      // Si falla la lista de operadores seguimos con el texto normal.
    }
    const hiddenJoined = hiddenStrings.map((h) => h.text.replace(/\s+/g, " ").trim()).filter(Boolean);

    // 2) Texto con tamaño diminuto o fuera de la página.
    const content = await page.getTextContent();
    type Item = { str: string; x: number; y: number; h: number; eol: boolean };
    const items: Item[] = [];
    for (const it of content.items as any[]) {
      if (typeof it.str !== "string") continue;
      const [a, b, c, d, e, f] = it.transform as number[];
      const size = Math.hypot(c, d) || Math.hypot(a, b);
      const x = e;
      const y = f;
      const str = it.str;
      if (!str.trim()) {
        if (it.hasEOL && items.length) items[items.length - 1].eol = true;
        continue;
      }
      const norm = str.replace(/\s+/g, " ").trim();
      if (size > 0 && size < 1.6) {
        hidden.push({ text: norm, reason: `texto de tamaño diminuto (${size.toFixed(1)} pt)` });
        continue;
      }
      if (x > viewport.width + 2 || x < -50 || y < -20 || y > viewport.height + 20) {
        hidden.push({ text: norm, reason: "texto ubicado fuera del área visible de la página" });
        continue;
      }
      const hiddenMatch = norm.length >= 3 && hiddenJoined.find((h) => h.includes(norm));
      if (hiddenMatch) {
        const reason = hiddenStrings.find((h) => h.text.replace(/\s+/g, " ").includes(norm))?.reason ?? "texto invisible";
        hidden.push({ text: norm, reason });
        continue;
      }
      items.push({ str, x, y, h: size, eol: !!it.hasEOL });
    }

    // Agrupar por líneas (misma coordenada y).
    items.sort((a, b) => (Math.abs(b.y - a.y) > Math.max(2, a.h * 0.4) ? b.y - a.y : a.x - b.x));
    const lines: { text: string; h: number }[] = [];
    let cur: Item[] = [];
    const flush = () => {
      if (!cur.length) return;
      cur.sort((a, b) => a.x - b.x);
      let t = "";
      for (const it of cur) t += (t && !t.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str;
      lines.push({ text: t.replace(/\s+/g, " ").trim(), h: Math.max(...cur.map((c) => c.h)) });
      cur = [];
    };
    for (const it of items) {
      if (cur.length && Math.abs(cur[0].y - it.y) > Math.max(2, it.h * 0.4)) flush();
      cur.push(it);
    }
    flush();

    // Agrupar spans ocultos consecutivos con el mismo motivo.
    const merged: HiddenSpan[] = [];
    for (const h of hidden) {
      const last = merged[merged.length - 1];
      if (last && last.reason === h.reason) last.text += " " + h.text;
      else merged.push({ ...h });
    }

    const heights = lines.map((l) => l.h).sort((a, b) => a - b);
    const median = heights[Math.floor(heights.length / 2)] ?? 0;
    const heading = lines.find((l) => l.h >= median * 1.25 && l.text.length > 3 && l.text.length < 90)?.text;
    const text = lines.map((l) => l.text).join("\n").trim();
    if (!text) emptyPages++;
    units.push({ location: `p. ${p}`, page: p, heading, text, hidden: merged });
  }
  if (emptyPages) warnings.push(`${emptyPages} de ${doc.numPages} páginas no tienen capa de texto (probablemente escaneadas).`);
  await task.destroy();
  return { units, cells: [], extractor: "pdfjs", warnings, needsOcr: emptyPages > 0 && emptyPages >= doc.numPages / 2 };
}

// ---------------------------------------------------------------- PPTX

async function extractPptx(buf: Buffer): Promise<Extraction> {
  const zip = await JSZip.loadAsync(buf);
  const presXml = await zip.file("ppt/presentation.xml")?.async("string");
  const relsXml = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  if (!presXml || !relsXml) throw new Error("El archivo PPTX no tiene la estructura esperada.");
  const pres = parseXml(presXml);
  const rels = parseXml(relsXml);
  const relMap = new Map<string, string>();
  for (const r of findAll(rels, "Relationship")) relMap.set(r.attrs.Id, r.attrs.Target);
  const sz = find(pres, "p:sldSz");
  const slideW = Number(sz?.attrs.cx ?? 12192000);
  const slideH = Number(sz?.attrs.cy ?? 6858000);
  const order = findAll(pres, "p:sldId").map((n) => relMap.get(n.attrs["r:id"])).filter(Boolean) as string[];

  const units: Unit[] = [];
  const warnings: string[] = [];
  let n = 0;
  for (const target of order) {
    n++;
    const slidePath = path.posix.join("ppt", target.replace(/^\/?ppt\//, ""));
    const xml = await zip.file(slidePath)?.async("string");
    if (!xml) continue;
    const tree = parseXml(xml);
    const sld = find(tree, "p:sld");
    const slideHidden = sld?.attrs.show === "0";
    const hidden: HiddenSpan[] = [];
    const visible: string[] = [];
    let title = "";

    for (const sp of [...findAll(tree, "p:sp"), ...findAll(tree, "p:graphicFrame")]) {
      const ph = find(sp.children, "p:ph");
      const isTitle = ph && /title|ctrTitle/i.test(ph.attrs.type ?? "");
      const off = find(sp.children, "a:off");
      const offX = Number(off?.attrs.x ?? 0);
      const offY = Number(off?.attrs.y ?? 0);
      const outside = off && (offX >= slideW || offY >= slideH || offX < -slideW * 0.2 || offY < -slideH * 0.2);
      for (const para of findAll(sp.children, "a:p")) {
        let vis = "";
        for (const r of para.children.filter((c) => c.tag === "a:r" || c.tag === "a:fld")) {
          const t = textOf(child(r, "a:t") ?? { tag: "", attrs: {}, children: [] });
          if (!t) continue;
          const rPr = child(r, "a:rPr");
          const size = Number(rPr?.attrs.sz ?? 0);
          const clr = rPr ? find(rPr.children, "a:srgbClr")?.attrs.val : undefined;
          let reason = "";
          if (slideHidden) reason = "diapositiva oculta";
          else if (outside) reason = "cuadro de texto ubicado fuera de la diapositiva";
          else if (size > 0 && size < 400) reason = `texto de tamaño diminuto (${size / 100} pt)`;
          else if (clr && hexIsWhite(clr) && !hasDarkBackground(tree)) reason = "texto en color blanco sobre fondo claro";
          if (reason) hidden.push({ text: t, reason });
          else vis += t;
        }
        if (vis.trim()) {
          visible.push(vis.trim());
          if (isTitle && !title) title = vis.trim();
        }
      }
    }

    // Notas del orador: suelen tener explicaciones del profesor.
    const slideRels = await zip.file(slidePath.replace("slides/", "slides/_rels/") + ".rels")?.async("string");
    let notes = "";
    if (slideRels) {
      const notesTarget = findAll(parseXml(slideRels), "Relationship").find((r) => /notesSlide/.test(r.attrs.Type))?.attrs.Target;
      if (notesTarget) {
        const np = path.posix.normalize(path.posix.join(path.posix.dirname(slidePath), notesTarget));
        const nx = await zip.file(np)?.async("string");
        if (nx) {
          const ntree = parseXml(nx);
          notes = findAll(ntree, "p:sp")
            .filter((sp) => (find(sp.children, "p:ph")?.attrs.type ?? "body") === "body")
            .flatMap((sp) => findAll(sp.children, "a:p").map((p) => findAll(p.children, "a:t").map(textOf).join("")))
            .filter((s) => s.trim())
            .join("\n");
        }
      }
    }

    const mergedHidden: HiddenSpan[] = [];
    for (const h of hidden) {
      const last = mergedHidden[mergedHidden.length - 1];
      if (last && last.reason === h.reason) last.text += " " + h.text;
      else mergedHidden.push({ ...h });
    }
    let text = visible.join("\n");
    if (notes.trim()) text += `\n[Notas del orador] ${notes.trim()}`;
    // Si la diapositiva no usa el marcador de título, tomamos la primera línea corta.
    if (!title && visible[0] && visible[0].length < 90) title = visible[0];
    units.push({ location: `diapositiva ${n}`, page: n, heading: title || undefined, text: text.trim(), hidden: mergedHidden });
  }
  return { units, cells: [], extractor: "pptx", warnings, needsOcr: false };
}

function hasDarkBackground(tree: XNode[]): boolean {
  const bg = find(tree, "p:bg");
  const c = bg ? find(bg.children, "a:srgbClr")?.attrs.val : undefined;
  if (!c) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (r + g + b) / 3 < 110;
}

// ---------------------------------------------------------------- DOCX

async function extractDocx(buf: Buffer): Promise<Extraction> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("El archivo DOCX no tiene word/document.xml.");
  const tree = parseXml(xml);
  const body = find(tree, "w:body");
  const warnings: string[] = [];

  type Para = { text: string; hidden: HiddenSpan[]; heading: boolean };
  const paras: Para[] = [];

  const readPara = (p: XNode): Para => {
    const style = find(child(p, "w:pPr")?.children ?? [], "w:pStyle")?.attrs["w:val"] ?? "";
    const heading = /heading|t[ií]tulo|ttulo|title/i.test(style);
    let text = "";
    const hidden: HiddenSpan[] = [];
    for (const r of findAll(p.children, "w:r")) {
      const rPr = child(r, "w:rPr");
      const vanish = rPr && (child(rPr, "w:vanish") || child(rPr, "w:webHidden"));
      const color = rPr ? child(rPr, "w:color")?.attrs["w:val"] : undefined;
      const sz = rPr ? Number(child(rPr, "w:sz")?.attrs["w:val"] ?? 0) : 0;
      let t = "";
      for (const c of r.children) {
        if (c.tag === "w:t") t += textOf(c);
        else if (c.tag === "w:tab") t += "\t";
        else if (c.tag === "w:br" || c.tag === "w:cr") t += "\n";
      }
      if (!t) continue;
      let reason = "";
      if (vanish) reason = "texto marcado como oculto en Word";
      else if (color && /^[0-9a-f]{6}$/i.test(color) && hexIsWhite(color)) reason = "texto en color blanco";
      else if (sz > 0 && sz < 5) reason = `texto de tamaño diminuto (${sz / 2} pt)`;
      if (reason) hidden.push({ text: t, reason });
      else text += t;
    }
    return { text: text.trim(), hidden, heading: heading && text.trim().length > 0 };
  };

  for (const node of body?.children ?? []) {
    if (node.tag === "w:p") paras.push(readPara(node));
    else if (node.tag === "w:tbl") {
      for (const row of findAll(node.children, "w:tr")) {
        const cells = findAll(row.children, "w:tc").map((tc) => {
          const ps = findAll(tc.children, "w:p").map(readPara);
          return { text: ps.map((x) => x.text).filter(Boolean).join(" "), hidden: ps.flatMap((x) => x.hidden) };
        });
        paras.push({ text: cells.map((c) => c.text).join(" | "), hidden: cells.flatMap((c) => c.hidden), heading: false });
      }
    }
  }

  // Agrupar en secciones por título; si no hay títulos, bloques de ~12 párrafos.
  const units: Unit[] = [];
  let sec: Para[] = [];
  let secHeading = "";
  let startIdx = 1;
  const push = (endIdx: number) => {
    const text = sec.map((p) => p.text).filter(Boolean).join("\n").trim();
    const hidden = mergeHidden(sec.flatMap((p) => p.hidden));
    if (!text && !hidden.length) return;
    const where = secHeading ? `sección «${secHeading.slice(0, 60)}»` : `párrafos ${startIdx}–${endIdx}`;
    units.push({ location: where, heading: secHeading || undefined, text, hidden });
  };
  paras.forEach((p, i) => {
    const idx = i + 1;
    const blockFull = !secHeading && sec.length >= 12;
    if ((p.heading && sec.length) || blockFull) {
      push(idx - 1);
      sec = [];
      startIdx = idx;
      secHeading = "";
    }
    if (p.heading) secHeading = p.text;
    sec.push(p);
  });
  push(paras.length);

  // Comentarios (p. ej. correcciones del profesor en un parcial corregido).
  const cx = await zip.file("word/comments.xml")?.async("string");
  if (cx) {
    const ctree = parseXml(cx);
    const comments = findAll(ctree, "w:comment").map((c) => ({
      author: c.attrs["w:author"] ?? "",
      text: findAll(c.children, "w:t").map(textOf).join("").trim(),
    }));
    if (comments.length) {
      units.push({
        location: "comentarios del documento",
        heading: "Comentarios",
        text: comments.map((c) => `[Comentario${c.author ? " de " + c.author : ""}] ${c.text}`).join("\n"),
        hidden: [],
      });
    }
  }
  return { units, cells: [], extractor: "docx", warnings, needsOcr: false };
}

function mergeHidden(h: HiddenSpan[]): HiddenSpan[] {
  const out: HiddenSpan[] = [];
  for (const x of h) {
    const last = out[out.length - 1];
    if (last && last.reason === x.reason) last.text += x.text;
    else out.push({ ...x });
  }
  return out.map((x) => ({ ...x, text: x.text.replace(/\s+/g, " ").trim() })).filter((x) => x.text);
}

async function extractDoc(filePath: string): Promise<Extraction> {
  const req = createRequire(import.meta.url);
  const WordExtractor = req("word-extractor");
  const doc = await new WordExtractor().extract(filePath);
  const body: string = doc.getBody() ?? "";
  const units = splitPlain(body, "párrafos");
  return {
    units,
    cells: [],
    extractor: "word-extractor",
    warnings: ["Formato .doc antiguo: no se puede detectar texto oculto por formato. Si podés, guardalo como .docx."],
    needsOcr: false,
  };
}

async function extractLegacyOffice(filePath: string, to: string, next: (b: Buffer) => Promise<Extraction>): Promise<Extraction> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forja-"));
  try {
    execFileSync("soffice", ["--headless", "--convert-to", to, "--outdir", tmp, filePath], { timeout: 90_000, stdio: "ignore" });
    const out = fs.readdirSync(tmp).find((f) => f.endsWith("." + to));
    if (!out) throw new Error("conversión vacía");
    const r = await next(fs.readFileSync(path.join(tmp, out)));
    r.extractor += " (convertido con LibreOffice)";
    return r;
  } catch {
    throw new Error(`No pude leer este formato antiguo. Instalá LibreOffice o guardá el archivo como .${to}.`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- XLSX / CSV

async function extractSheet(buf: Buffer): Promise<Extraction> {
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true, cellNF: false, cellText: true });
  const units: Unit[] = [];
  const cells: ExcelCell[] = [];
  const warnings: string[] = [];
  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name];
    const hiddenState = wb.Workbook?.Sheets?.[i]?.Hidden ?? 0;
    if (!ws || !ws["!ref"]) return;
    const range = XLSX.utils.decode_range(ws["!ref"]);
    const hiddenRows = new Set<number>();
    (ws["!rows"] ?? []).forEach((r: any, idx: number) => r?.hidden && hiddenRows.add(idx));
    const hiddenCols = new Set<number>();
    (ws["!cols"] ?? []).forEach((c: any, idx: number) => c?.hidden && hiddenCols.add(idx));

    const lines: string[] = [];
    const hidden: HiddenSpan[] = [];
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 400); r++) {
      const parts: string[] = [];
      const hparts: string[] = [];
      let rowLabel = "";
      for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 40); c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as XLSX.CellObject | undefined;
        if (!cell || (cell.v === undefined && !cell.f)) continue;
        const shown = cell.w ?? String(cell.v ?? "");
        if (!rowLabel && cell.t === "s") rowLabel = String(cell.v);
        const piece = cell.f ? `${addr}: ${shown} [=${cell.f}]` : `${addr}: ${shown}`;
        if (hiddenRows.has(r) || hiddenCols.has(c)) hparts.push(piece);
        else parts.push(piece);
        if (cell.f) {
          cells.push({ sheet: name, cell: addr, formula: "=" + cell.f, value: shown, label: rowLabel || findHeader(ws, r, c) });
        }
      }
      if (parts.length) lines.push(parts.join(" | "));
      if (hparts.length) hidden.push({ text: hparts.join(" | "), reason: "fila o columna oculta en Excel" });
    }
    const text = lines.join("\n");
    if (hiddenState) {
      units.push({
        location: `hoja «${name}»`,
        heading: name,
        text: "",
        hidden: [{ text: text.slice(0, 4000), reason: hiddenState === 2 ? "hoja de Excel muy oculta (veryHidden)" : "hoja de Excel oculta" }],
      });
    } else {
      units.push({ location: `hoja «${name}»`, heading: name, text, hidden: mergeHidden(hidden) });
    }
  });
  return { units, cells, extractor: "sheetjs", warnings, needsOcr: false };
}

function findHeader(ws: XLSX.WorkSheet, r: number, c: number): string {
  for (let rr = r - 1; rr >= Math.max(0, r - 6); rr--) {
    const cell = ws[XLSX.utils.encode_cell({ r: rr, c })];
    if (cell?.t === "s") return String(cell.v);
  }
  return "";
}

// ---------------------------------------------------------------- TXT

async function extractText(buf: Buffer): Promise<Extraction> {
  let s = buf.toString("utf8");
  if (s.includes("�")) s = buf.toString("latin1");
  return { units: splitPlain(s, "líneas"), cells: [], extractor: "texto", warnings: [], needsOcr: false };
}

function splitPlain(s: string, label: "líneas" | "párrafos"): Unit[] {
  const lines = s.replace(/\r\n?/g, "\n").split("\n");
  const units: Unit[] = [];
  let buf: string[] = [];
  let start = 1;
  let heading: string | undefined;
  const flush = (end: number) => {
    const text = buf.join("\n").trim();
    if (text) units.push({ location: `${label} ${start}–${end}`, heading, text, hidden: [] });
    buf = [];
  };
  lines.forEach((line, i) => {
    const isHead = /^(#{1,3}\s|unidad\s+\d+|tema\s+\d+|cap[ií]tulo\s+\d+)/i.test(line.trim());
    if ((isHead && buf.join("").trim()) || buf.join("\n").length > 2500) {
      flush(i);
      start = i + 1;
      heading = undefined;
    }
    if (isHead) heading = line.replace(/^#+\s*/, "").trim();
    buf.push(line);
  });
  flush(lines.length);
  return units;
}

// Exportado para tests.
export const _internal = { hexIsWhite, splitPlain };
