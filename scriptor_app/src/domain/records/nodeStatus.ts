// The workflow pipeline of a chapter or scene, in order. A port of NodeStatus in
// flutter_app/lib/shared/domain/records/story_node.dart.

export const nodeStatuses = [
  { key: 'idea', label: 'Idea' },
  { key: 'planned', label: 'Planned' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'draft-complete', label: 'Draft Complete' },
  { key: 'revising', label: 'Revising' },
  { key: 'final', label: 'Final' },
  { key: 'published', label: 'Published' },
] as const;

export type NodeStatusKey = (typeof nodeStatuses)[number]['key'];

export function nodeStatusOf(value: unknown): NodeStatusKey | null {
  return nodeStatuses.find((s) => s.key === value)?.key ?? null;
}

/** Maps the original app's earlier two-field scheme (a progress plus a planned/written/published tag) onto the
 * single pipeline, exactly as its own upgrade did. */
export function upgradeNodeStatus(status: unknown, publication?: unknown): NodeStatusKey {
  if (publication === 'published') return 'published';
  const known = nodeStatusOf(status);
  if (known) return known;
  switch (status) {
    case 'outlining':
      return 'planned';
    case 'editing':
      return 'revising';
    case 'complete':
      return 'final';
    default:
      return 'idea';
  }
}
