import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/core';
import { analyticsCharts, readChartFilter } from '@/modules/analytics/charts';
import type { StoryModel } from '@/modules/model/types';
import { downloadBlob } from '@/shared/download';
import { Modal } from '@/shared/Modal';
import { exportFileName, filterWords, NOT_A_BACKUP, PRIVATE_FIELDS, tablesCsv, VIEW_DATA, viewRecords, type Envelope } from './exportView';
import { framedSvg, legendsIn, mainDrawing, pngOf, printableData, printDocument, printHtml, standalone } from './snapshot';
import type { VisualView } from './views';

const FORMATS = {
  print: { label: 'Print, or save as PDF', what: 'The view laid out for paper: its title, the novel, the filters, the date, the drawing with its legends (when it is shown drawn) and its records in words. In the print dialog, “Save as PDF” makes a file.' },
  png: { label: 'Picture (PNG)', what: 'The drawing as it is shown, with its title, the novel, the filters, the date and its legends.' },
  svg: { label: 'Picture (SVG)', what: 'The same, as a drawing that stays sharp at any size and opens in a browser or a drawing program.' },
  json: { label: 'Records (JSON)', what: 'The records this view is about, as the app keeps them (every field, with stable ids), narrowed by the page’s filters, with the names of what they point at.' },
  csv: { label: 'Table (CSV)', what: 'The view’s tables, as shown in its list, for a spreadsheet. A view without a table gives its list, one line each.' },
} as const;
type Format = keyof typeof FORMATS;

interface ExportDialogProps {
  view: VisualView;
  model: StoryModel;
  params: URLSearchParams;
  mode: 'visual' | 'list';
  /** The view as shown, and the same view as a list (shown, or drawn out of sight for the export). */
  shown: () => HTMLElement | null;
  listed: () => HTMLElement | null;
  /** The page's filters: whether a record is kept. */
  keep: (id: string) => boolean;
  /** Ids the model does not name (an alternate history), named. */
  name: (id: string) => string | null;
  /** May see private notes and secrets: the author and co-authors. */
  privileged: boolean;
  onClose: () => void;
}

/** The tables of a view's list, or its lists one line an item, or what it says when empty. */
function tablesOf(root: HTMLElement | null, empty: string | null): { title: string; columns: string[]; rows: string[][] }[] {
  const clean = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!root) return [];
  const tables = [...root.querySelectorAll('table')].map((t, i) => ({
    title: t.getAttribute('aria-label') ?? t.querySelector('caption')?.textContent?.trim() ?? `Table ${i + 1}`,
    columns: [...t.querySelectorAll('thead th')].map(clean),
    rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('th, td')].map(clean)),
  }));
  if (tables.length) return tables;
  const lists = [...root.querySelectorAll('ol, ul')].filter((l) => !l.parentElement?.closest('ol, ul')).map((l, i) => ({ title: l.getAttribute('aria-label') ?? `List ${i + 1}`, columns: ['Item'], rows: [...l.children].map((li) => [clean(li)]) }));
  if (lists.length) return lists;
  return [{ title: 'This view', columns: ['Says'], rows: [[empty ?? (clean(root) || 'Nothing to show.')]] }];
}

/**
 * Exporting a view: printed or saved as PDF, as a picture, as its records,
 * or as its tables, each with the view's title, the novel, its filters and
 * the date. Private notes and secrets are left out unless the author ticks
 * them in. Everything is made here, in the browser, and works offline. A
 * view's export is never a backup of the novel, and says so.
 */
export function ExportDialog({ view, model, params, mode, shown, listed, keep, name, privileged, onClose }: ExportDialogProps) {
  const drawing = useMemo(() => (mode === 'visual' ? mainDrawing(shown()) : null), [mode, shown]);
  const [format, setFormat] = useState<Format>(drawing ? 'print' : 'json');
  const [includePrivate, setIncludePrivate] = useState(false);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const filters = filterWords(params, model, name);
  const kinds = VIEW_DATA[view.key] ?? [];
  const hasPrivate = kinds.some((k) => PRIVATE_FIELDS[k]);
  const showsSecrets = view.key === 'knowledge';
  const empty = shown()?.querySelector('.viz-state.empty')?.textContent?.trim() ?? null;
  const unavailable: Partial<Record<Format, string>> = drawing ? {} : { png: mode === 'list' ? 'Show the view drawn to make a picture of it.' : 'This view has no drawing to make a picture of.', svg: mode === 'list' ? 'Show the view drawn to make a picture of it.' : 'This view has no drawing to make a picture of.' };

  const run = async () => {
    setDone(null);
    setFailed(null);
    const at = new Date();
    const title = `${view.label}: ${model.project.title}`;
    const lines = [`${model.project.title} · ${view.label} · exported ${at.toLocaleString()}`, filters.length ? `Filters and settings: ${filters.join('; ')}` : 'No filters: everything the view shows.', ...(empty ? [`This view has nothing to show: ${empty}`] : [])];
    const file = (ext: string) => exportFileName(model.project.title, view.key, at, ext);
    try {
      if (format === 'json') {
        const secrets = showsSecrets && includeSecrets && privileged ? await db.characterSecrets.where('projectId').equals(model.project.id).toArray() : null;
        const charts = view.key === 'charts' ? analyticsCharts(model, readChartFilter(params, model)).map((c) => ({ key: c.key, title: c.title, uses: c.uses, empty: c.empty, notes: c.notes, table: c.table })) : undefined;
        const data = viewRecords(model, view.key, { keep, includePrivate: includePrivate && privileged, secrets, charts });
        const envelope: Envelope = {
          format: 'novel-builder/view-export',
          version: 1,
          exportedAt: at.toISOString(),
          novel: { id: model.project.id, title: model.project.title },
          view: { key: view.key, label: view.label, description: view.description, shownAs: mode === 'visual' ? 'drawing' : 'list' },
          filters,
          notABackup: NOT_A_BACKUP,
          leftOut: [
            'The text of chapters and scenes, and everything not of the kinds this view is about.',
            ...(hasPrivate && !(includePrivate && privileged) ? ['Private notes on codex entries, chapters and scenes.'] : []),
            ...(showsSecrets && !secrets ? ['Secrets: they are included only when you choose to.'] : []),
            ...(filters.length ? ['Records the page’s filters leave out.'] : []),
          ],
          empty,
          names: data.names,
          records: data.records,
        };
        downloadBlob(new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' }), file('json'));
        setDone(`Saved “${file('json')}”: ${data.count} ${data.count === 1 ? 'record' : 'records'}.`);
      } else if (format === 'csv') {
        const tables = tablesOf(listed(), empty);
        const head = { title: title, columns: ['Exported', 'Filters and settings'], rows: [[at.toISOString(), filters.join('; ') || 'None']] };
        downloadBlob(new Blob([tablesCsv([head, ...tables])], { type: 'text/csv;charset=utf-8' }), file('csv'));
        setDone(`Saved “${file('csv')}”: ${tables.length} ${tables.length === 1 ? 'table' : 'tables'}.`);
      } else {
        const page = getComputedStyle(shown() ?? document.body);
        const framing = { title, lines, background: page.getPropertyValue('--surface').trim() || '#ffffff', ink: page.getPropertyValue('--text').trim() || '#111111', muted: page.getPropertyValue('--muted').trim() || '#555555' };
        const picture = drawing ? framedSvg(standalone(drawing), legendsIn(shown()), format === 'print' ? { ...framing, title: '', lines: [] } : framing) : null;
        if (format === 'print') {
          printHtml(printDocument({ title, lines, picture: picture?.markup ?? null, data: printableData(listed()), footer: `A printout of one view of “${model.project.title}”, with its filters. It is not a backup: to keep or move the whole novel, use Import & Export → Export entire project data. Made in Novel Builder.`, lang: document.documentElement.lang || 'en' }));
          setDone('The print layout is open: choose a printer, or “Save as PDF”.');
        } else if (picture && format === 'svg') {
          downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${picture.markup}`], { type: 'image/svg+xml;charset=utf-8' }), file('svg'));
          setDone(`Saved “${file('svg')}”.`);
        } else if (picture) {
          downloadBlob(await pngOf(picture.markup, picture.width, picture.height), file('png'));
          setDone(`Saved “${file('png')}”.`);
        }
      }
    } catch (e) {
      setFailed(`The export could not be made: ${e instanceof Error ? e.message : String(e)}. Nothing has changed.`);
    }
  };

  return (
    <Modal title={`Export “${view.label}”`} onClose={onClose}>
      <div className="stack viz-export">
        <fieldset className="stack tight">
          <legend>As</legend>
          {(Object.keys(FORMATS) as Format[]).map((f) => (
            <label key={f} className="check wrap">
              <input type="radio" name="export-format" checked={format === f} disabled={Boolean(unavailable[f])} onChange={() => setFormat(f)} />
              <span>
                <strong>{FORMATS[f].label}</strong> <span className="muted small">{unavailable[f] ?? FORMATS[f].what}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="small">
          <p>
            <strong>With it:</strong> the view’s title, the novel, the date and time, and {filters.length ? 'these filters and settings:' : 'no filters (everything the view shows).'}
          </p>
          {filters.length > 0 && (
            <ul aria-label="Filters and settings exported with it">
              {filters.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          {empty && <p className="muted">This view has nothing to show; the export says so: “{empty}”</p>}
        </div>
        {format === 'json' && privileged && hasPrivate && (
          <label className="check wrap">
            <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} /> Include private notes (on codex entries, chapters and scenes)
          </label>
        )}
        {format === 'json' && privileged && showsSecrets && (
          <label className="check wrap">
            <input type="checkbox" checked={includeSecrets} onChange={(e) => setIncludeSecrets(e.target.checked)} /> Include the secrets themselves
          </label>
        )}
        {showsSecrets && format !== 'json' && format !== 'csv' && <p className="notice small">This view shows secrets: a picture or printout holds what is on screen.</p>}
        {format === 'json' && !privileged && (hasPrivate || showsSecrets) && <p className="muted small">Private notes and secrets are kept to the author and co-authors, and are left out.</p>}
        <p className="muted small">
          A view’s export is not a backup. To keep or move the whole novel, use <Link to={`/project/${model.project.id}/export`}>Import & Export → Export entire project data</Link>.
        </p>
        {failed && (
          <p className="error" role="alert">
            {failed}
          </p>
        )}
        <p role="status" className="small">
          {done}
        </p>
        <div className="actions start">
          <button type="button" className="btn primary" onClick={() => void run()}>
            Export
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
