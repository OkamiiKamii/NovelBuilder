import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { manuscript } from '@/core';
import { downloadProject } from '@/modules/projects';
import { buildTree, flatten, isGroup } from '@/modules/manuscript/tree';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { ExportDialog } from '../components/ExportDialog';
import { ImportDialog } from '../components/ImportDialog';
import { IMPORT_EXTENSIONS } from '../service';

export function ExchangePage() {
  const project = useCurrentProject();
  const ms = useMemo(() => manuscript.forProject(project.id), [project.id]);
  const nodes = useLiveQuery(() => ms.list(), [ms]) ?? [];
  const groups = useMemo(() => flatten(buildTree(nodes)).filter((t) => isGroup(t.node.kind)), [nodes]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState<File | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean; firstId?: string } | null>(null);

  return (
    <div className="stack exchange">
      <header>
        <h1>Import &amp; Export</h1>
        <p className="muted">Your writing is yours. Bring a manuscript in, take it out in standard formats, or take everything.</p>
      </header>

      {notice && (
        <p className={notice.error ? 'notice error' : 'notice'} role="status">
          <span>
            {notice.text}{' '}
            {notice.firstId && <Link to={`../manuscript/${notice.firstId}`}>Open it</Link>}
            {notice.firstId && ' or '}
            {notice.firstId && <Link to="../organizer">see it in the Organizer</Link>}
          </span>
          <button type="button" className="btn ghost icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      <section className="panel">
        <h2>Export manuscript</h2>
        <p className="muted">Word, PDF, Markdown, plain text or a web page. Choose exactly what goes in: the clean manuscript for readers, or a complete bible with planning, notes and lore.</p>
        <div className="actions start">
          <button type="button" className="btn primary" onClick={() => setExporting(true)}>
            Export manuscript…
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Export entire project data</h2>
        <p className="muted">
          One file with everything in this project: every chapter and scene, alternate drafts, version history, plans, notes, codex entries and their links, goals
          and session logs. It is plain, structured JSON that any program can read, and it can be imported back from the Library on this or any other device.
        </p>
        <div className="actions start">
          <button type="button" className="btn" onClick={() => void downloadProject(project).then(() => setNotice({ text: 'Project archive downloaded.' }), () => setNotice({ text: 'The archive could not be created.', error: true }))}>
            Export entire project data
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Import a manuscript</h2>
        <p className="muted">
          From a .txt, .md, .docx or .rtf file. Chapters and scenes are detected from headings and scene breaks, and you see the result before anything is added.
        </p>
        <input
          ref={fileInput}
          type="file"
          hidden
          aria-label="Manuscript file"
          accept={IMPORT_EXTENSIONS.map((e) => `.${e}`).join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) setImporting(file);
          }}
        />
        <div className="actions start">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Choose a file…
          </button>
        </div>
      </section>

      {exporting && <ExportDialog project={project} onClose={() => setExporting(false)} />}
      {importing && (
        <ImportDialog
          projectId={project.id}
          file={importing}
          groups={groups}
          onClose={() => setImporting(null)}
          onImported={(created) => {
            setImporting(null);
            setNotice({ text: `Imported ${importing.name}: ${created.length} ${created.length === 1 ? 'item' : 'items'} added.`, firstId: created[0] });
          }}
        />
      )}
    </div>
  );
}
