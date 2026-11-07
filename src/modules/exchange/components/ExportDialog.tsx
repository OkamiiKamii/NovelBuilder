import { useEffect, useMemo, useState } from 'react';
import { exchange } from '@/core';
import { buildTree, flatten } from '@/modules/manuscript/tree';
import type { Project } from '@/modules/projects/types';
import { downloadBlob, fileSlug } from '@/shared/download';
import { formatNumber } from '@/shared/format';
import { Modal } from '@/shared/Modal';
import { PRESETS, type Compiled, type ExportData, type ExportOptions } from '../compile';
import { compile } from '../compile';
import { pdfCanDraw, pdfTextOf } from '../render/pdf';
import { renderHtml } from '../render/text';
import { EXPORT_FORMATS, FORMAT_LABELS, renderExport, type ExportFormat } from '../service';

const SWITCHES: { key: keyof Omit<ExportOptions, 'scopeId'>; label: string; hint: string }[] = [
  { key: 'manuscript', label: 'Manuscript content', hint: 'The text of chapters and scenes' },
  { key: 'titles', label: 'Chapter titles & scene break dividers', hint: 'Title page, volume and chapter headings, * * * between scenes' },
  { key: 'notes', label: 'Author private notes', hint: 'Your notes on chapters, scenes and codex entries' },
  { key: 'lore', label: 'Worldbuilding & lore profiles', hint: 'Codex entries, as an appendix' },
  { key: 'planning', label: 'Chapter/scene planning sheets', hint: 'Objectives, summaries, beats, dynamics' },
  { key: 'history', label: 'Draft revision history', hint: 'The log of saved versions and the text of alternate drafts' },
];

const same = (a: ExportOptions, b: ExportOptions) => SWITCHES.every(({ key }) => a[key] === b[key]);

/** Opens the browser's print dialog on a document, where "Save as PDF" produces the file. */
function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.append(frame);
}

export function ExportDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('docx');
  const [options, setOptions] = useState<ExportOptions>(PRESETS.reader);
  const [scopeId, setScopeId] = useState('');
  const [data, setData] = useState<ExportData | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    exchange.forProject(project.id).gather().then(
      (gathered) => alive && setData(gathered),
      () => alive && setMessage({ text: 'This project could not be read.', error: true }),
    );
    return () => {
      alive = false;
    };
  }, [project.id]);

  const scopes = useMemo(() => flatten(buildTree(data?.nodes ?? [])).filter((t) => t.node.kind !== 'scene'), [data]);
  const compiled: Compiled | null = useMemo(() => (data ? compile(data, { ...options, scopeId: scopeId || null }) : null), [data, options, scopeId]);
  const nothing = compiled !== null && compiled.blocks.length === 0;

  const run = async () => {
    if (!compiled) return;
    setWorking(true);
    setMessage(null);
    try {
      const name = `${fileSlug(compiled.title)}${scopeId ? `-${fileSlug(scopes.find((s) => s.node.id === scopeId)?.node.title ?? '')}` : ''}`;
      if (format === 'pdf' && !pdfCanDraw(pdfTextOf(compiled))) {
        // The PDF's built-in fonts cannot draw some characters in this text; the browser's own fonts can.
        printHtml(renderHtml(compiled));
        setMessage({ text: 'Your text uses characters the built-in PDF fonts cannot draw, so the print dialog was opened instead. Choose “Save as PDF” there.' });
      } else {
        downloadBlob(await renderExport(compiled, format), `${name}.${format}`);
        setMessage({ text: `Exported ${name}.${format}` });
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'The export failed.', error: true });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal title="Export manuscript" onClose={onClose}>
      <div className="stack export-dialog">
        <div className="field">
          <span>Format</span>
          <div className="segmented wrap" role="radiogroup" aria-label="Format">
            {EXPORT_FORMATS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={format === f} className={format === f ? 'active' : ''} onClick={() => setFormat(f)}>
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Start from a preset</span>
          <div className="actions start">
            <button type="button" className={same(options, PRESETS.reader) ? 'btn primary' : 'btn'} aria-pressed={same(options, PRESETS.reader)} onClick={() => setOptions(PRESETS.reader)}>
              Clean reader manuscript
            </button>
            <button type="button" className={same(options, PRESETS.bible) ? 'btn primary' : 'btn'} aria-pressed={same(options, PRESETS.bible)} onClick={() => setOptions(PRESETS.bible)}>
              Complete bible
            </button>
          </div>
        </div>

        <fieldset className="export-switches">
          <legend>Include</legend>
          {SWITCHES.map(({ key, label, hint }) => (
            <label key={key} className="switch">
              <input type="checkbox" checked={options[key]} onChange={(e) => setOptions({ ...options, [key]: e.target.checked })} />
              <span>
                <strong>{label}</strong>
                <span className="muted small">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span>Which part</span>
          <select value={scopeId} aria-label="Which part" onChange={(e) => setScopeId(e.target.value)}>
            <option value="">Whole manuscript</option>
            {scopes.map(({ node, depth }) => (
              <option key={node.id} value={node.id}>
                {'  '.repeat(depth) + node.title}
              </option>
            ))}
          </select>
        </label>

        <p className="muted small" role="status">
          {!compiled
            ? 'Reading the project…'
            : nothing
              ? 'Nothing is selected to export.'
              : `${compiled.chapterCount} ${compiled.chapterCount === 1 ? 'chapter' : 'chapters'}${options.manuscript ? ` · ${formatNumber(compiled.wordCount)} words of manuscript` : ' · no manuscript text'}`}
        </p>
        {message && (
          <p className={message.error ? 'error' : 'notice'} role={message.error ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn primary" disabled={!compiled || nothing || working} onClick={() => void run()}>
            {working ? 'Exporting…' : `Export ${format === 'md' ? 'Markdown' : format === 'txt' ? 'text' : format === 'html' ? 'web page' : format === 'pdf' ? 'PDF' : 'Word document'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
