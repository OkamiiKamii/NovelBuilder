import type { WorkspaceSection } from './sections';

export function PlaceholderPage({ section }: { section: WorkspaceSection }) {
  return (
    <div className="empty">
      <h2>{section.label}</h2>
      <p className="muted">{section.description}</p>
      <p className="muted">Arrives in Phase {section.phase}.</p>
    </div>
  );
}
