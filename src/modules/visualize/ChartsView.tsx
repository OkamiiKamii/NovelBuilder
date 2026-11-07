import { useMemo, useState } from 'react';
import { analyticsCharts, readChartFilter, toCsv, type Chart } from '@/modules/analytics/charts';
import type { EntityRef, StoryModel } from '@/modules/model/types';
import { BarList, ColumnChart, type BarDatum } from '@/modules/viz/components/Bars';
import { ViewSwitch } from '@/modules/viz/components/ViewSwitch';
import { downloadBlob, fileSlug } from '@/shared/download';
import { VizState } from '@/modules/viz/components/VizState';

interface ChartsViewProps {
  model: StoryModel;
  params: URLSearchParams;
  setParams: (changes: Record<string, string | null>) => void;
  mode: 'visual' | 'list';
  setMode: (mode: 'visual' | 'list') => void;
  pick: (ref: EntityRef) => void;
  selectedId: string | null;
}

/** A number typed into a filter: shown as typed at once, and following the address when it changes another way. */
function YearInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [local, setLocal] = useState({ from: value, value });
  if (local.from !== value) setLocal({ from: value, value });
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        aria-label={label}
        value={local.value}
        onChange={(e) => {
          setLocal({ from: value, value: e.target.value });
          onChange(e.target.value);
        }}
      />
    </label>
  );
}

/**
 * CHARTS
 * Counts and distributions of what the author records: words per chapter
 * and scene, how long chapters are, character appearances, plot-thread
 * presence, events over story time, points of view and the author's own
 * categories. One row of filters scopes every chart. Each chart says what
 * it uses, says what it leaves out, and is a table and a file as well.
 * Nothing is judged: no quality, impact or genre.
 */
export function ChartsView({ model, params, setParams, mode, setMode, pick, selectedId }: ChartsViewProps) {
  const filter = readChartFilter(params, model);
  const charts = useMemo(() => analyticsCharts(model, filter), [model, params]); // eslint-disable-line react-hooks/exhaustive-deps
  const chapters = model.order.chapters;
  const characters = [...model.entries.values()].filter((e) => e.category === 'character').sort((a, b) => a.name.localeCompare(b.name));
  const threads = [...model.threads.values()].sort((a, b) => a.title.localeCompare(b.title));
  const labels = [...new Map([...model.plans.values()].flatMap((p) => p.labels ?? []).map((l) => [l.toLowerCase(), l] as const)).values()].sort((a, b) => a.localeCompare(b));
  const filtered = Boolean(filter.from || filter.to || filter.threadId || filter.povId || filter.label || filter.yearFrom !== null || filter.yearTo !== null);
  const clear = () => setParams({ cfrom: null, cto: null, cthread: null, cpov: null, clabel: null, cyfrom: null, cyto: null });
  const chapterOptions = chapters.map((c, i) => (
    <option key={c.id} value={c.id}>
      {i + 1}. {c.title.trim() || 'Untitled chapter'}
    </option>
  ));

  return (
    <div className="stack charts-view">
      <div className="viz-toolbar">
        <ViewSwitch mode={mode} onChange={setMode} visualLabel="Charts" />
      </div>
      <p className="muted small">Counts of what you record, nothing more. A chart shows how much of something is recorded where, never whether it is good: no quality, emotional impact or genre is judged.</p>
      <fieldset className="plan-group chart-filters">
        <legend>Which part of the novel</legend>
        <div className="rel-filter-grid">
          <label className="field">
            <span>From chapter</span>
            <select aria-label="Charts from chapter" value={filter.from ?? ''} onChange={(e) => setParams({ cfrom: e.target.value || null })}>
              <option value="">The first</option>
              {chapterOptions}
            </select>
          </label>
          <label className="field">
            <span>To chapter</span>
            <select aria-label="Charts to chapter" value={filter.to ?? ''} onChange={(e) => setParams({ cto: e.target.value || null })}>
              <option value="">The last</option>
              {chapterOptions}
            </select>
          </label>
          <label className="field">
            <span>Plot thread</span>
            <select aria-label="Charts for plot thread" value={filter.threadId ?? ''} onChange={(e) => setParams({ cthread: e.target.value || null })}>
              <option value="">Any, or none</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Point of view</span>
            <select aria-label="Charts for point of view" value={filter.povId ?? ''} onChange={(e) => setParams({ cpov: e.target.value || null })}>
              <option value="">Anyone’s, or none recorded</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Scene category</span>
            <select aria-label="Charts for scene category" value={filter.label ?? ''} onChange={(e) => setParams({ clabel: e.target.value || null })}>
              <option value="">Any, or none</option>
              {labels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <YearInput label="Story years from" value={params.get('cyfrom') ?? ''} onChange={(v) => setParams({ cyfrom: v.trim() || null })} />
          <YearInput label="Story years to" value={params.get('cyto') ?? ''} onChange={(v) => setParams({ cyto: v.trim() || null })} />
        </div>
        <p className="muted small">Chapters, thread, point of view and category scope every chart; story years scope the events chart, since chapters have no dates of their own.</p>
        {filtered && (
          <button type="button" className="btn ghost" onClick={clear}>
            Clear filters
          </button>
        )}
      </fieldset>
      {charts.map((chart) => (
        <ChartCard key={chart.key} chart={chart} mode={mode} params={params} setParams={setParams} selectedId={selectedId} pick={pick} file={`${fileSlug(model.project.title).toLowerCase()}-${chart.key}.csv`} />
      ))}
    </div>
  );
}

function ChartCard({ chart, mode, params, setParams, selectedId, pick, file }: { chart: Chart; mode: 'visual' | 'list'; params: URLSearchParams; setParams: (changes: Record<string, string | null>) => void; selectedId: string | null; pick: (ref: EntityRef) => void; file: string }) {
  const bars: BarDatum[] = chart.bars.map((b) => ({ key: b.key, short: b.short, label: b.label, value: b.value, detail: b.detail, selectable: Boolean(b.ref) }));
  const selectedKey = chart.bars.find((b) => b.ref && b.ref.id === selectedId)?.key ?? null;
  const onSelect = (bar: BarDatum) => {
    const ref = chart.bars.find((b) => b.key === bar.key)?.ref;
    if (ref) pick(ref);
  };
  // A byte-order mark, so a spreadsheet reads names in any script; saved the way the app saves every file (on Android, through the share sheet).
  const download = () => downloadBlob(new Blob(['\uFEFF', toCsv(chart.table.columns, chart.table.rows)], { type: 'text/csv;charset=utf-8' }), file);
  const table = (
    <div className="table-scroll">
      <table className="sessions" aria-label={`${chart.title}, as a table`}>
        <thead>
          <tr>
            {chart.table.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, k) => (
                <td key={k}>{typeof cell === 'number' ? cell.toLocaleString() : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const label = `${chart.title}. ${chart.summary}`;

  return (
    <section className="panel stack tight chart-card" aria-labelledby={`chart-${chart.key}`}>
      <div className="chart-card-head">
        <h3 id={`chart-${chart.key}`}>{chart.title}</h3>
        {chart.key === 'words' && (
          <label className="field">
            <span>Bars for</span>
            <select aria-label="Words per" value={params.get('cgrain') === 'scenes' ? 'scenes' : 'chapters'} onChange={(e) => setParams({ cgrain: e.target.value === 'scenes' ? 'scenes' : null })}>
              <option value="chapters">Each chapter</option>
              <option value="scenes">Each chapter and scene</option>
            </select>
          </label>
        )}
        {chart.key === 'appearances' && (
          <label className="field">
            <span>Counted from</span>
            <select aria-label="Appearances counted from" value={params.get('ccount') === 'page' ? 'page' : 'any'} onChange={(e) => setParams({ ccount: e.target.value === 'page' ? 'page' : null })}>
              <option value="any">Any record of them</option>
              <option value="page">Appearance records: on the page</option>
            </select>
          </label>
        )}
      </div>
      <p className="muted small">
        <strong>Uses:</strong> {chart.uses}
      </p>
      {chart.empty ? (
        <VizState status={{ kind: 'empty', message: chart.empty }} />
      ) : mode === 'visual' ? (
        <>
          {chart.shape === 'columns' ? <ColumnChart label={label} units={chart.units} bars={bars} selectedKey={selectedKey} onSelect={onSelect} /> : <BarList label={label} units={chart.units} bars={bars} selectedKey={selectedKey} onSelect={onSelect} />}
          <p className="small">{chart.summary}</p>
          <details className="chart-table">
            <summary>Show as table</summary>
            {table}
          </details>
        </>
      ) : (
        <>
          <p className="small">{chart.summary}</p>
          {table}
        </>
      )}
      {chart.notes.map((note) => (
        <p key={note} className="muted small">
          {note}
        </p>
      ))}
      {!chart.empty && (
        <div className="actions start">
          <button type="button" className="btn ghost small" aria-label={`Download the data of “${chart.title}” as a CSV file`} onClick={download}>
            Download the data (CSV)
          </button>
        </div>
      )}
    </section>
  );
}
