import type { TimelineNode, TimelineRecord } from './types';

interface Named {
  id: string;
  title: string;
}

/**
 * Arranges projects into families of timelines. A project with no record is
 * an original on its own. A timeline whose parent has been deleted attaches
 * to its nearest surviving ancestor, or stands as an original if none is
 * left.
 */
export function buildFamilies(projects: Named[], records: TimelineRecord[]): TimelineNode[] {
  const exists = new Map(projects.map((p) => [p.id, p]));
  const byId = new Map(records.map((r) => [r.id, r]));
  const parentOf = (id: string): string | null => {
    const seen = new Set([id]);
    for (let parent = byId.get(id)?.parentId ?? null; parent && !seen.has(parent); parent = byId.get(parent)?.parentId ?? null) {
      if (exists.has(parent)) return parent;
      seen.add(parent);
    }
    return null;
  };
  const build = (project: Named, depth: number): TimelineNode => {
    const record = byId.get(project.id);
    const parentId = parentOf(project.id);
    return {
      projectId: project.id, title: project.title, status: record?.status ?? 'main', parentId, forkLabel: parentId && parentId === record?.parentId ? record.forkLabel : '', note: record?.note ?? '', depth,
      children: projects.filter((p) => p.id !== project.id && parentOf(p.id) === project.id).sort((a, b) => (byId.get(a.id)?.createdAt ?? 0) - (byId.get(b.id)?.createdAt ?? 0) || a.title.localeCompare(b.title)).map((child) => build(child, depth + 1)),
    };
  };
  return projects.filter((p) => parentOf(p.id) === null).map((root) => build(root, 0));
}

export const flattenFamily = (node: TimelineNode): TimelineNode[] => [node, ...node.children.flatMap(flattenFamily)];

/** The family tree that contains a project. */
export const familyOf = (families: TimelineNode[], projectId: string): TimelineNode | undefined => families.find((root) => flattenFamily(root).some((n) => n.projectId === projectId));
