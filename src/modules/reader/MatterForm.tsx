import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { reader } from '@/core';
import { SavedText } from '@/shared/SavedText';
import { SCENE_BREAKS } from './book';
import type { MatterChanges } from './service';

/** The pages around the story: what a reader meets before chapter one and after the last. Written here, shown in the reader preview. */
export function MatterForm({ projectId }: { projectId: string }) {
  const api = reader.forProject(projectId);
  const matter = useLiveQuery(() => api.matter(), [projectId]);
  const [error, setError] = useState<string | null>(null);
  if (!matter) return null;
  const save = (changes: MatterChanges) => void api.updateMatter(changes).then(() => setError(null), (err) => setError(err instanceof Error ? err.message : 'Could not save.'));
  return (
    <section className="panel stack" aria-label="Front and back matter">
      <h2>Front and back matter</h2>
      <p className="muted small">
        The pages around the story. Leave any of them empty and it is left out. They appear in the <Link to={`/project/${projectId}/read`}>reader preview</Link>; the title page and cover come from the details above.
      </p>
      <SavedText label="Dedication" multiline rows={2} value={matter.dedication} placeholder="For…" onSave={(dedication) => save({ dedication })} />
      <SavedText label="Epigraph" multiline rows={2} value={matter.epigraph} placeholder="A quotation to open the book." onSave={(epigraph) => save({ epigraph })} />
      <SavedText label="Epigraph source" value={matter.epigraphSource} placeholder="Who said it, and where." onSave={(epigraphSource) => save({ epigraphSource })} />
      <SavedText label="Copyright page" multiline rows={3} value={matter.copyright} placeholder="Copyright © 2026 …  All rights reserved." onSave={(copyright) => save({ copyright })} />
      <SavedText label="Acknowledgements" multiline rows={3} value={matter.acknowledgements} onSave={(acknowledgements) => save({ acknowledgements })} />
      <SavedText label="About the author" multiline rows={3} value={matter.aboutAuthor} onSave={(aboutAuthor) => save({ aboutAuthor })} />
      <label className="field">
        <span>Scene break</span>
        <select value={SCENE_BREAKS.includes(matter.sceneBreak as never) ? matter.sceneBreak : '* * *'} aria-label="Scene break" onChange={(e) => save({ sceneBreak: e.target.value })}>
          {SCENE_BREAKS.map((mark) => (
            <option key={mark || 'blank'} value={mark}>
              {mark || 'A blank line'}
            </option>
          ))}
        </select>
        <span className="muted small">Printed between scenes, and wherever a line of the text is only ***, #, --- or a horizontal rule.</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
