import type { Block, Compiled, Run } from '../compile';

const plain = (runs: Run[]) => runs.map((r) => r.text).join('');

/**
 * Plain text. Headings are set off by blank lines (volume and chapter titles
 * in capitals), paragraphs are separated by one blank line, and the text
 * inside a paragraph is written exactly as typed.
 */
export function renderText({ blocks }: Compiled): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      const loud = block.role === 'title' || block.role === 'part' || block.role === 'chapter' || block.role === 'section';
      const title = loud ? block.text.toUpperCase() : block.text;
      const rule = block.role === 'title' ? '='.repeat([...title].length) : block.role === 'part' || block.role === 'section' ? '-'.repeat([...title].length) : '';
      out.push(...(block.pageBreak ? ['', ''] : ['']), title, ...(rule ? [rule] : []), '');
    } else if (block.type === 'paragraph') {
      const indent = block.quote ? '    ' : '';
      out.push(plain(block.runs).split('\n').map((line) => indent + line).join('\n'), '');
    } else if (block.type === 'divider') {
      out.push('* * *', '');
    } else if (block.type === 'field') {
      out.push(block.text ? `${block.label}: ${block.text}` : `${block.label}:`, ...(block.text ? [''] : []));
    } else {
      out.push(...block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${item}`), '');
    }
  }
  return `${out.join('\n').trim()}\n`;
}

const escapeMd = (text: string) => text.replace(/([\\`*_{}[\]<>#|])/g, '\\$1');

function mdRuns(runs: Run[]): string {
  return runs
    .map((run) => {
      if (run.text === '\n') return '  \n';
      // Emphasis markers must hug the words, so surrounding spaces stay outside them.
      const [, lead, core, trail] = run.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      if (!core) return run.text;
      let text = escapeMd(core);
      if (run.strike) text = `~~${text}~~`;
      if (run.underline) text = `<u>${text}</u>`;
      if (run.italic) text = `*${text}*`;
      if (run.bold) text = `**${text}**`;
      return lead + text + trail;
    })
    .join('');
}

/** Markdown: `#` headings that mirror the hierarchy, `* * *` scene breaks, and inline formatting. */
export function renderMarkdown({ blocks }: Compiled): string {
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') out.push(block.role === 'subtitle' ? `*${escapeMd(block.text)}*` : `${'#'.repeat(block.level)} ${escapeMd(block.text)}`, '');
    else if (block.type === 'paragraph') {
      const body = mdRuns(block.runs).replace(/^(\s*)(\d+)\. /, '$1$2\\. ').replace(/^(\s*)([-+]) /, '$1\\$2 ');
      // A blank line the author left is kept as a non-breaking space, or Markdown would swallow it.
      out.push(body.trim() ? (block.quote ? body.split('\n').map((l) => `> ${l}`).join('\n') : body) : '&nbsp;', '');
    } else if (block.type === 'divider') out.push('* * *', '');
    else if (block.type === 'field') out.push(block.text ? `**${escapeMd(block.label)}:** ${escapeMd(block.text).replace(/\n/g, '  \n')}` : `**${escapeMd(block.label)}:**`, '');
    else out.push(...block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${escapeMd(item).replace(/\n/g, ' ')}`), '');
  }
  return `${out.join('\n').trim()}\n`;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function htmlRuns(runs: Run[]): string {
  return runs
    .map((run) => {
      if (run.text === '\n') return '<br>';
      let text = escapeHtml(run.text);
      if (run.strike) text = `<s>${text}</s>`;
      if (run.underline) text = `<u>${text}</u>`;
      if (run.italic) text = `<em>${text}</em>`;
      if (run.bold) text = `<strong>${text}</strong>`;
      return text;
    })
    .join('');
}

const block2html = (block: Block): string => {
  if (block.type === 'heading') {
    if (block.role === 'subtitle') return `<p class="subtitle">${escapeHtml(block.text)}</p>`;
    const tag = `h${block.level}`;
    return `<${tag} class="${block.role}${block.pageBreak ? ' new-page' : ''}">${escapeHtml(block.text)}</${tag}>`;
  }
  if (block.type === 'paragraph') {
    const style = block.align ? ` style="text-align:${block.align}"` : '';
    const body = htmlRuns(block.runs) || '<br>';
    return block.quote ? `<blockquote><p${style}>${body}</p></blockquote>` : `<p${style}>${body}</p>`;
  }
  if (block.type === 'divider') return '<p class="scene-break">* * *</p>';
  if (block.type === 'field') return `<p class="field"><strong>${escapeHtml(block.label)}:</strong> ${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`;
  const tag = block.ordered ? 'ol' : 'ul';
  return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item).replace(/\n/g, '<br>')}</li>`).join('')}</${tag}>`;
};

/** A self-contained web page. It also prints cleanly: each volume and chapter starts on a new page. */
export function renderHtml(compiled: Compiled): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(compiled.title)}</title>
${compiled.author ? `<meta name="author" content="${escapeHtml(compiled.author)}">\n` : ''}<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; max-width: 40em; margin: 3em auto; padding: 0 1.2em; color: #111; }
  p { margin: 0 0 0.6em; white-space: pre-wrap; tab-size: 4; overflow-wrap: break-word; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2em 0 0.8em; }
  h1.title { font-size: 2.2em; text-align: center; margin-top: 3em; }
  .subtitle { text-align: center; font-style: italic; font-size: 1.3em; }
  .part { text-align: center; }
  .scene-break { text-align: center; margin: 1.6em 0; }
  blockquote { margin: 0.8em 2em; }
  .field { margin-left: 1em; }
  @media print { body { margin: 0; max-width: none; } .new-page { break-before: page; } h1, h2, h3, h4 { break-after: avoid; } }
</style>
</head>
<body>
${compiled.blocks.map(block2html).join('\n')}
</body>
</html>
`;
}
