// The compiled document as plain text, Markdown and a self-contained web page. Pure TypeScript. A port of
// flutter_app/lib/shared/domain/exchange/render_text.dart.

import { dartTrim } from '../text/dartString';
import type { Block, Compiled, HeadingRole, Run } from './compile';
import { dartToUpperCase } from './dartUpperCase';

function plain(runs: readonly Run[]): string {
  return runs.map((r) => r.text).join('');
}

const loudRoles: ReadonlySet<HeadingRole> = new Set(['title', 'part', 'chapter', 'section']);

/** Plain text. Headings are set off by blank lines (volume and chapter titles in capitals), paragraphs are separated
 * by one blank line, and the text inside a paragraph is written exactly as typed. */
export function renderText(compiled: Compiled): string {
  const out: string[] = [];
  for (const block of compiled.blocks) {
    switch (block.type) {
      case 'heading': {
        const title = loudRoles.has(block.role) ? dartToUpperCase(block.text) : block.text;
        const length = Array.from(title).length;
        const rule =
          block.role === 'title'
            ? '='.repeat(length)
            : block.role === 'part' || block.role === 'section'
              ? '-'.repeat(length)
              : '';
        out.push(...(block.pageBreak ? ['', ''] : ['']), title, ...(rule.length > 0 ? [rule] : []), '');
        break;
      }
      case 'paragraph': {
        const indent = block.quote ? '    ' : '';
        out.push(
          plain(block.runs)
            .split('\n')
            .map((line) => indent + line)
            .join('\n'),
          '',
        );
        break;
      }
      case 'divider':
        out.push('* * *', '');
        break;
      case 'field':
        out.push(block.text.length > 0 ? `${block.label}: ${block.text}` : `${block.label}:`);
        if (block.text.length > 0) out.push('');
        break;
      case 'list':
        out.push(...block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${item}`), '');
        break;
    }
  }
  return `${dartTrim(out.join('\n'))}\n`;
}

function escapeMd(text: string): string {
  return text.replace(/([\\`*_{}[\]<>#|])/g, (_, c: string) => `\\${c}`);
}

function mdRuns(runs: readonly Run[]): string {
  return runs
    .map((run) => {
      if (run.text === '\n') return '  \n';
      // Emphasis markers must hug the words, so surrounding spaces stay outside them.
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
      const core = m[2];
      if (core.length === 0) return run.text;
      let text = escapeMd(core);
      if (run.strike) text = `~~${text}~~`;
      if (run.underline) text = `<u>${text}</u>`;
      if (run.italic) text = `*${text}*`;
      if (run.bold) text = `**${text}**`;
      return `${m[1]}${text}${m[3]}`;
    })
    .join('');
}

/** Markdown: `#` headings that mirror the hierarchy, `* * *` scene breaks, and inline formatting. */
export function renderMarkdown(compiled: Compiled): string {
  const out: string[] = [];
  for (const block of compiled.blocks) {
    switch (block.type) {
      case 'heading':
        out.push(
          block.role === 'subtitle' ? `*${escapeMd(block.text)}*` : `${'#'.repeat(block.level)} ${escapeMd(block.text)}`,
          '',
        );
        break;
      case 'paragraph': {
        const body = mdRuns(block.runs)
          .replace(/^(\s*)(\d+)\. /, (_, a: string, b: string) => `${a}${b}\\. `)
          .replace(/^(\s*)([-+]) /, (_, a: string, b: string) => `${a}\\${b} `);
        // A blank line the author left is kept as a non-breaking space, or Markdown would swallow it.
        out.push(
          dartTrim(body).length > 0
            ? block.quote
              ? body
                  .split('\n')
                  .map((l) => `> ${l}`)
                  .join('\n')
              : body
            : '&nbsp;',
          '',
        );
        break;
      }
      case 'divider':
        out.push('* * *', '');
        break;
      case 'field':
        out.push(
          block.text.length > 0
            ? `**${escapeMd(block.label)}:** ${escapeMd(block.text).split('\n').join('  \n')}`
            : `**${escapeMd(block.label)}:**`,
          '',
        );
        break;
      case 'list':
        out.push(
          ...block.items.map(
            (item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${escapeMd(item).split('\n').join(' ')}`,
          ),
          '',
        );
        break;
    }
  }
  return `${dartTrim(out.join('\n'))}\n`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function htmlRuns(runs: readonly Run[]): string {
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

function blockHtml(block: Block): string {
  switch (block.type) {
    case 'heading':
      if (block.role === 'subtitle') return `<p class="subtitle">${escapeHtml(block.text)}</p>`;
      return `<h${block.level} class="${block.role}${block.pageBreak ? ' new-page' : ''}">${escapeHtml(block.text)}</h${block.level}>`;
    case 'paragraph': {
      const style = block.align === null ? '' : ` style="text-align:${block.align}"`;
      const runs = htmlRuns(block.runs);
      const body = runs.length === 0 ? '<br>' : runs;
      return block.quote ? `<blockquote><p${style}>${body}</p></blockquote>` : `<p${style}>${body}</p>`;
    }
    case 'divider':
      return '<p class="scene-break">* * *</p>';
    case 'field':
      return `<p class="field"><strong>${escapeHtml(block.label)}:</strong> ${escapeHtml(block.text).split('\n').join('<br>')}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item).split('\n').join('<br>')}</li>`).join('')}</${tag}>`;
    }
  }
}

/** A self-contained web page. It also prints cleanly: each volume and chapter starts on a new page. */
export function renderHtml(compiled: Compiled): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(compiled.title)}</title>
${compiled.author.length > 0 ? `<meta name="author" content="${escapeHtml(compiled.author)}">\n` : ''}<style>
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
${compiled.blocks.map(blockHtml).join('\n')}
</body>
</html>
`;
}
