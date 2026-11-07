import { useId, useState, type FormEvent } from 'react';
import { imageFileToDataUrl } from '@/shared/image';
import { Cover } from './Cover';
import { ACCENTS, GENRE_SUGGESTIONS, PROJECT_STATUSES, STATUS_LABELS, type ProjectInput, type ProjectStatus } from '../types';

interface ProjectFormProps {
  initial?: Partial<ProjectInput>;
  submitLabel: string;
  /** `templateId` is the worldbuilding template chosen, when `templates` are offered. */
  onSubmit: (input: Partial<ProjectInput>, templateId: string, systemId: string) => Promise<void> | void;
  /** Offered when creating a project: groups of templates to start the codex from. */
  templates?: { label: string; options: { id: string; name: string; description: string }[] }[];
  /** Offered when creating a project: fictional-system presets to start with. */
  systems?: { id: string; name: string; description: string }[];
  onCancel?: () => void;
}

export function ProjectForm({ initial = {}, submitLabel, onSubmit, onCancel, templates, systems }: ProjectFormProps) {
  const [templateId, setTemplateId] = useState('');
  const [systemId, setSystemId] = useState('');
  const chosenTemplate = templates?.flatMap((g) => g.options).find((t) => t.id === templateId);
  const [title, setTitle] = useState(initial.title ?? '');
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? '');
  const [author, setAuthor] = useState(initial.author ?? '');
  const [primaryGenre, setPrimaryGenre] = useState(initial.primaryGenre ?? '');
  const [secondaryGenres, setSecondaryGenres] = useState((initial.secondaryGenres ?? []).join(', '));
  const [cover, setCover] = useState<string | null>(initial.cover ?? null);
  const genreListId = useId();
  const [status, setStatus] = useState<ProjectStatus>(initial.status ?? 'planning');
  const [target, setTarget] = useState(initial.targetWordCount ? String(initial.targetWordCount) : '');
  const [deadline, setDeadline] = useState(initial.deadline ?? '');
  const [tags, setTags] = useState((initial.tags ?? []).join(', '));
  const [synopsis, setSynopsis] = useState(initial.synopsis ?? '');
  const [accent, setAccent] = useState(initial.accent ?? ACCENTS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give the project a title.');
      return;
    }
    if (cover && !/^(https?:\/\/|data:image\/)/i.test(cover.trim())) {
      setError('The cover URL must start with http:// or https://.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title,
        subtitle,
        author,
        primaryGenre,
        secondaryGenres: secondaryGenres.split(','),
        cover: cover?.trim() || null,
        status,
        targetWordCount: target ? Number(target) : null,
        deadline: deadline || null,
        tags: tags.split(','),
        synopsis,
        accent,
      }, templateId, systemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the project.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={200} />
      </label>
      <label className="field">
        <span>Subtitle</span>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={200} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Author / pen name</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Primary genre</span>
          <input value={primaryGenre} onChange={(e) => setPrimaryGenre(e.target.value)} list={genreListId} placeholder="Fantasy" />
        </label>
        <label className="field">
          <span>Secondary genres (comma separated)</span>
          <input value={secondaryGenres} onChange={(e) => setSecondaryGenres(e.target.value)} placeholder="LitRPG, Action" />
        </label>
        <datalist id={genreListId}>
          {GENRE_SUGGESTIONS.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <label className="field">
          <span>Target word count</span>
          <input type="number" min={0} step={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="90000" />
        </label>
        <label className="field">
          <span>Deadline</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label className="field">
          <span>Tags (comma separated)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="litrpg, series" />
        </label>
      </div>
      {templates && (
        <label className="field">
          <span>Worldbuilding template</span>
          <select value={templateId} aria-label="Worldbuilding template" onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Standard (Locations, Factions, Items, Power Systems, Lore)</option>
            {templates.filter((group) => group.options.length).map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="muted small">{chosenTemplate ? chosenTemplate.description : 'Sets up the Codex categories and their fields. You can change them at any time.'}</span>
        </label>
      )}
      {systems && (
        <label className="field">
          <span>Fictional system</span>
          <select value={systemId} aria-label="Fictional system" onChange={(e) => setSystemId(e.target.value)}>
            <option value="">None for now</option>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
          <span className="muted small">{systems.find((x) => x.id === systemId)?.description ?? 'Stats, levels, realms or powers with rules. You can add or design one later under Systems.'}</span>
        </label>
      )}
      <label className="field">
        <span>Synopsis</span>
        <textarea rows={4} value={synopsis} onChange={(e) => setSynopsis(e.target.value)} />
      </label>
      <div className="cover-field">
        <Cover title={title} cover={cover} accent={accent} className="cover-preview" />
        <div className="stack">
          <label className="field">
            <span>Cover image URL (optional)</span>
            <input
              type="url"
              value={cover && !cover.startsWith('data:') ? cover : ''}
              onChange={(e) => setCover(e.target.value || null)}
              placeholder={cover?.startsWith('data:') ? 'Using uploaded image' : 'https://…'}
            />
          </label>
          <div className="actions start">
            <label className="btn">
              Upload image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    setCover(await imageFileToDataUrl(file));
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'That image could not be used.');
                  }
                }}
              />
            </label>
            {cover && (
              <button type="button" className="btn ghost" onClick={() => setCover(null)}>
                Remove cover
              </button>
            )}
          </div>
        </div>
      </div>
      <fieldset className="field swatches">
        <legend>Accent colour (used when there is no cover)</legend>
        {ACCENTS.map((color) => (
          <label key={color} className="swatch" style={{ background: color }} title={color}>
            <input type="radio" name="accent" value={color} checked={accent === color} onChange={() => setAccent(color)} />
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn primary" disabled={saving}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
