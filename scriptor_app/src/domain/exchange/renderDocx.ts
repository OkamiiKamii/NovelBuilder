// A Word document (.docx) from the compiled manuscript. Volumes and chapters use real heading styles (so Word's
// navigation pane and table of contents see the hierarchy) and start on a new page; scene breaks are centred; bold,
// italic, underline, strikethrough, alignment, tabs and line breaks carry over. A port of
// flutter_app/lib/shared/domain/exchange/render_docx.dart; the zip is made with fflate (the parts are the Dart's, byte
// for byte; the zip's own framing differs, as package:archive's does from any other zip writer).

import { strToU8, zipSync } from 'fflate';

import { type Align, type Block, Run, type Compiled } from './compile';

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

/** Text with tabs and line breaks as Word elements; spaces are kept exactly (`xml:space="preserve"`). */
function content(text: string): string {
  let out = '';
  let start = 0;
  for (const m of text.matchAll(/\n|\t/g)) {
    if (m.index > start) out += `<w:t xml:space="preserve">${esc(text.substring(start, m.index))}</w:t>`;
    out += m[0] === '\n' ? '<w:br/>' : '<w:tab/>';
    start = m.index + m[0].length;
  }
  if (start < text.length) out += `<w:t xml:space="preserve">${esc(text.substring(start))}</w:t>`;
  return out;
}

function run(r: Run): string {
  const props = `${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.strike ? '<w:strike/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}`;
  return `<w:r>${props.length > 0 ? `<w:rPr>${props}</w:rPr>` : ''}${content(r.text)}</w:r>`;
}

function paragraph(style: string | null, body: string, extra = ''): string {
  const pPr = style !== null || extra.length > 0 ? `<w:pPr>${style !== null ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : '';
  return `<w:p>${pPr}${body}</w:p>`;
}

const jc: Readonly<Record<Align, string>> = { left: 'left', center: 'center', right: 'right', justify: 'both' };

function block(b: Block): string {
  switch (b.type) {
    case 'heading':
      return paragraph(
        b.role === 'title' ? 'Title' : b.role === 'subtitle' ? 'Subtitle' : `Heading${Math.min(6, Math.max(1, b.level - 1))}`,
        run(new Run(b.text)),
        b.pageBreak ? '<w:pageBreakBefore/>' : '',
      );
    case 'paragraph':
      return paragraph(b.quote ? 'Quote' : null, b.runs.map(run).join(''), b.align !== null ? `<w:jc w:val="${jc[b.align]}"/>` : '');
    case 'divider':
      return paragraph('SceneBreak', run(new Run('* * *')));
    case 'field':
      return paragraph('Field', run(new Run(`${b.label}:`, { bold: true })) + (b.text.length > 0 ? run(new Run(` ${b.text}`)) : ''));
    case 'list':
      return b.items.map((item, i) => paragraph('ListItem', run(new Run(`${b.ordered ? `${i + 1}.` : '•'}\t${item}`)))).join('');
  }
}

const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const headingStyle = (n: number, size: number, extra = '') =>
  `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="${n - 1}"/>${extra}</w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${ns}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="32"/></w:rPr></w:style>
${headingStyle(1, 40, '<w:jc w:val="center"/>')}${headingStyle(2, 32)}${headingStyle(3, 28)}${headingStyle(4, 26)}${headingStyle(5, 24)}${headingStyle(6, 24)}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="SceneBreak"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Field"><w:name w:val="Field"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListItem"><w:name w:val="List Item"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>`;

/** The body of a Word document: what the agreement tests compare with the original's. */
export function docxDocumentXml(compiled: Compiled): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${ns}><w:body>${compiled.blocks.map(block).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

/** Every part of the Word file, by name, in the order the Dart writes them. */
export function docxParts(compiled: Compiled): [string, string][] {
  return [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ],
    [
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ['word/document.xml', docxDocumentXml(compiled)],
    ['word/styles.xml', styles],
    [
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(compiled.title)}</dc:title><dc:creator>${esc(compiled.author)}</dc:creator></cp:coreProperties>`,
    ],
  ];
}

/** The Word document's bytes. */
export function renderDocx(compiled: Compiled): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const [name, text] of docxParts(compiled)) files[name] = strToU8(text);
  return zipSync(files, { level: 6 });
}
