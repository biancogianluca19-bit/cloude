import { XMLParser } from "fast-xml-parser";

// Árbol XML ordenado mínimo. fast-xml-parser con preserveOrder devuelve nodos
// { tag: [hijos], ":@": {atributos} } y nodos de texto { "#text": "..." }.

export interface XNode {
  tag: string;
  attrs: Record<string, string>;
  children: XNode[];
  text?: string;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
});

function convert(raw: any): XNode[] {
  const out: XNode[] = [];
  for (const item of raw ?? []) {
    const attrs = (item[":@"] ?? {}) as Record<string, string>;
    for (const key of Object.keys(item)) {
      if (key === ":@") continue;
      if (key === "#text") {
        out.push({ tag: "#text", attrs: {}, children: [], text: String(item[key]) });
      } else {
        out.push({ tag: key, attrs, children: convert(item[key]) });
      }
    }
  }
  return out;
}

export function parseXml(xml: string): XNode[] {
  return convert(parser.parse(xml));
}

export function find(nodes: XNode[], tag: string): XNode | undefined {
  for (const n of nodes) {
    if (n.tag === tag) return n;
    const f = find(n.children, tag);
    if (f) return f;
  }
  return undefined;
}

export function findAll(nodes: XNode[], tag: string, out: XNode[] = []): XNode[] {
  for (const n of nodes) {
    if (n.tag === tag) out.push(n);
    findAll(n.children, tag, out);
  }
  return out;
}

export function child(n: XNode | undefined, tag: string): XNode | undefined {
  return n?.children.find((c) => c.tag === tag);
}

export function textOf(n: XNode): string {
  if (n.tag === "#text") return n.text ?? "";
  return n.children.map(textOf).join("");
}
