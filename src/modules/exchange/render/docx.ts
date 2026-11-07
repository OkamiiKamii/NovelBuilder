import { strToU8, zipSync } from 'fflate';
import type { Block, Compiled, Run } from '../compile';

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

/** Text with tabs and line breaks as Word elements; spaces are kept exactly (`xml:space="preserve"`). */
function content(text: string): string {
  return text
    .split(/(\n|\t)/)
    .map((piece) => (piece === '\n' ? '<w:br/>' : piece === '\t' ? '<w:tab/>' : piece ? `<w:t xml:space="preserve">${esc(piece)}</w:t>` : ''))
    .join('');
}

function run(r: Run): string {
  const props = `${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.strike ? '<w:strike/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${content(r.text)}</w:r>`;
}

const paragraph = (style: string | null, body: string, extra = '') => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : ''}${body}</w:p>`;
const JC = { left: 'left', center: 'center', right: 'right', justify: 'both' };

function block(b: Block): string {
  if (b.type === 'heading') {
    const style = b.role === 'title' ? 'Title' : b.role === 'subtitle' ? 'Subtitle' : `Heading${Math.min(6, Math.max(1, b.level - 1))}`;
    return paragraph(style, run({ text: b.text }), b.pageBreak ? '<w:pageBreakBefore/>' : '');
  }
  if (b.type === 'paragraph') return paragraph(b.quote ? 'Quote' : null, b.runs.map(run).join(''), b.align ? `<w:jc w:val="${JC[b.align]}"/>` : '');
  if (b.type === 'divider') return paragraph('SceneBreak', run({ text: '* * *' }));
  if (b.type === 'field') return paragraph('Field', run({ text: `${b.label}:`, bold: true }) + (b.text ? run({ text: ` ${b.text}` }) : ''));
  return b.items.map((item, i) => paragraph('ListItem', run({ text: `${b.ordered ? `${i + 1}.` : '•'}\t${item}` }))).join('');
}

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const heading = (n: number, size: number, extra = '') =>
  `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/><w:outlineLvl w:val="${n - 1}"/>${extra}</w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="32"/></w:rPr></w:style>
${heading(1, 40, '<w:jc w:val="center"/>')}${heading(2, 32)}${heading(3, 28)}${heading(4, 26)}${heading(5, 24)}${heading(6, 24)}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="SceneBreak"><w:name w:val="Scene Break"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Field"><w:name w:val="Field"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListItem"><w:name w:val="List Item"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="60"/></w:pPr></w:style>
</w:styles>`;

/**
 * A Word document. Volumes and chapters use real heading styles (so Word's
 * navigation pane and table of contents see the hierarchy) and start on a
 * new page; scene breaks are centred; bold, italic, underline, strikethrough,
 * alignment, tabs and line breaks carry over.
 */
export function renderDocx(compiled: Compiled): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${compiled.blocks.map(block).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(STYLES),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(compiled.title)}</dc:title><dc:creator>${esc(compiled.author)}</dc:creator></cp:coreProperties>`),
  });
}
