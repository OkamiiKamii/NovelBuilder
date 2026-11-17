// A strict XML reader for the tests (saxes, the conformant parser jsdom uses): it throws on anything that is not
// well-formed, and gives back a small tree to look things up in, as package:xml does in the Flutter app's tests.

import { SaxesParser } from 'saxes';

export type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: (XmlElement | string)[];
};

export function parseXml(text: string): XmlElement {
  const parser = new SaxesParser({ xmlns: false });
  const root: XmlElement = { name: '#document', attributes: {}, children: [] };
  const stack: XmlElement[] = [root];
  parser.on('error', (e) => {
    throw e;
  });
  parser.on('opentag', (tag) => {
    const el: XmlElement = { name: tag.name, attributes: { ...(tag.attributes as Record<string, string>) }, children: [] };
    stack[stack.length - 1].children.push(el);
    stack.push(el);
  });
  parser.on('closetag', () => {
    stack.pop();
  });
  parser.on('text', (t) => {
    stack[stack.length - 1].children.push(t);
  });
  parser.on('cdata', (t) => {
    stack[stack.length - 1].children.push(t);
  });
  parser.write(text).close();
  return root;
}

export function findAll(el: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (e: XmlElement) => {
    for (const c of e.children) {
      if (typeof c === 'string') continue;
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

export function innerText(el: XmlElement): string {
  return el.children.map((c) => (typeof c === 'string' ? c : innerText(c))).join('');
}

export function single(el: XmlElement, name: string): XmlElement {
  const all = findAll(el, name);
  if (all.length !== 1) throw new Error(`${all.length} <${name}> elements, expected one`);
  return all[0];
}
