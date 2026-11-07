import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { assistant } from '@/core';
import { useCurrentProject } from '@/modules/workspace/WorkspaceLayout';
import { SavedText } from '@/shared/SavedText';
import { Brainstorm } from '../components/Brainstorm';
import { CLAUDE_MODELS, setAssistantSettings, useAssistantSettings } from '../providers';

const TABS = { brainstorm: 'Brainstorm', ideas: 'Notes & ideas', settings: 'Settings' } as const;
type Tab = keyof typeof TABS;

export function AssistantPage() {
  const project = useCurrentProject();
  const api = useMemo(() => assistant.forProject(project.id), [project.id]);
  const ideas = useLiveQuery(() => api.ideas(), [api]);
  const settings = useAssistantSettings();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (params.get('tab') as Tab) in TABS ? (params.get('tab') as Tab) : 'brainstorm';
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!ideas) return null;
  const sorted = [...ideas].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="stack assistant-page">
      <header className="page-header">
        <div>
          <h1>Assistant</h1>
          <p className="muted">A brainstorming partner that knows what you attach, says what it is assuming, and writes nothing unless you say so.</p>
        </div>
      </header>
      <div className="segmented wrap" role="tablist" aria-label="Assistant">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setParams(key === 'brainstorm' ? {} : { tab: key }, { replace: true })}>
            {TABS[key]}
            {key === 'ideas' ? ` (${ideas.length})` : ''}
          </button>
        ))}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
          <button type="button" className="btn ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}

      {tab === 'brainstorm' && <Brainstorm projectId={project.id} />}

      {tab === 'ideas' && (
        <section className="stack" aria-label="Notes and ideas">
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              void api.addIdea(draft).then(() => setDraft(''), (err: unknown) => setError(err instanceof Error ? err.message : 'Could not save.'));
            }}
          >
            <input value={draft} aria-label="New idea" placeholder="Jot an idea down…" onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" className="btn" disabled={!draft.trim()}>
              Keep
            </button>
          </form>
          {sorted.length === 0 ? (
            <p className="muted">Ideas you keep from a brainstorm, or jot down here, are collected on this page. They are not part of the manuscript or the Codex.</p>
          ) : (
            <ul className="threads" aria-label="Ideas">
              {sorted.map((idea) => (
                <li key={idea.id} className="thread idea">
                  <SavedText key={idea.id} hideLabel multiline rows={2} label="Idea" value={idea.text} onSave={(text) => void api.updateIdea(idea.id, text)} />
                  <div className="thread-top">
                    <span className="muted small">
                      {new Date(idea.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      {idea.brainstormId ? ' · from a brainstorm' : ''}
                    </span>
                    <button type="button" className="btn ghost" aria-label={`Delete the idea: ${idea.text.slice(0, 40)}`} onClick={() => void api.removeIdea(idea.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section className="panel" aria-label="Assistant settings">
          <h2>Which assistant answers</h2>
          <label className="check wrap">
            <input type="radio" name="provider" checked={settings.provider === 'manual'} onChange={() => setAssistantSettings({ provider: 'manual' })} />
            Copy and paste: the app sends nothing. You copy the question into any assistant and paste its reply back.
          </label>
          <label className="check wrap">
            <input type="radio" name="provider" checked={settings.provider === 'claude'} onChange={() => setAssistantSettings({ provider: 'claude' })} />
            Claude, with your own Anthropic API key: answers arrive here directly.
          </label>
          {settings.provider === 'claude' && (
            <div className="grid-2 tight">
              <label className="field">
                <span>Anthropic API key</span>
                <input type="password" autoComplete="off" value={settings.apiKey} aria-label="Anthropic API key" placeholder="sk-ant-…" onChange={(e) => setAssistantSettings({ apiKey: e.target.value })} />
              </label>
              <label className="field">
                <span>Model</span>
                <select value={settings.model} aria-label="Model" onChange={(e) => setAssistantSettings({ model: e.target.value })}>
                  {CLAUDE_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="muted small">
            Your key is kept in this browser only: it is not stored in any project, backup or export. When you brainstorm with Claude, your question and the facts you can read under “What the assistant will be given” are sent to
            Anthropic's API, and nothing else. Usage is billed to your Anthropic account. The rest of the app never needs a connection.
          </p>
        </section>
      )}
    </div>
  );
}
