import { useState } from 'react';
import { characters } from '@/core';
import { imageFileToDataUrl } from '@/shared/image';
import { Modal } from '@/shared/Modal';
import { ROLES, type CharacterTemplate } from '../types';
import { Portrait } from './Portrait';

/** Creating a character asks for a name and nothing else. Everything here but the name can be left for later. */
export function NewCharacter({ projectId, templates, onCreated, onClose }: { projectId: string; templates: CharacterTemplate[]; onCreated: (entryId: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [epithet, setEpithet] = useState('');
  const [role, setRole] = useState('');
  const [summary, setSummary] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('general');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.');
  return (
    <Modal title="New character" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          characters.forProject(projectId).create({ name, epithet, roles: role ? [role] : [], summary, image, templateId }).then((entry) => onCreated(entry.id), (err) => {
            say(err);
            setBusy(false);
          });
        }}
      >
        <div className="new-character">
          <div className="stack tight">
            <Portrait name={name} image={image} className="portrait-pick" />
            <label className="btn">
              {image ? 'Change portrait' : 'Add a portrait'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void imageFileToDataUrl(file).then(setImage, say);
                }}
              />
            </label>
          </div>
          <div className="stack grow">
            <label className="field">
              <span>Name</span>
              <input value={name} autoFocus aria-label="Character name" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Title or epithet (optional)</span>
              <input value={epithet} aria-label="Title or epithet" placeholder="The Last Heir" onChange={(e) => setEpithet(e.target.value)} />
            </label>
            <label className="field">
              <span>Role in the story (optional)</span>
              <input value={role} list="role-choices" aria-label="Narrative role" placeholder="Protagonist, Antagonist… or your own" onChange={(e) => setRole(e.target.value)} />
              <datalist id="role-choices">
                {ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
          </div>
        </div>
        <label className="field">
          <span>Summary (optional)</span>
          <textarea rows={2} value={summary} aria-label="Summary" onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label className="field">
          <span>Profile layout</span>
          <select value={templateId} aria-label="Profile layout" onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.projectId ? ' (yours)' : ''}
              </option>
            ))}
          </select>
          <span className="muted small">{templates.find((t) => t.id === templateId)?.description} You can change every section and field afterwards.</span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            Create character
          </button>
        </div>
      </form>
    </Modal>
  );
}
