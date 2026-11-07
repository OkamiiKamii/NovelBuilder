import { useLiveQuery } from 'dexie-react-hooks';
import { branching } from '@/core';
import { familyOf, flattenFamily } from './tree';
import { STATUS_HINTS, STATUS_LABELS, type TimelineNode } from './types';

/** Every family of timelines, live. Undefined while loading. */
export const useFamilies = (): TimelineNode[] | undefined => useLiveQuery(() => branching.families(), []);

/** The tree a project belongs to, and the project's own place in it. */
export function useFamily(projectId: string): { root: TimelineNode; me: TimelineNode; members: TimelineNode[] } | undefined {
  const families = useFamilies();
  const root = families && familyOf(families, projectId);
  const members = root ? flattenFamily(root) : [];
  const me = members.find((m) => m.projectId === projectId);
  return root && me ? { root, me, members } : undefined;
}

export function StatusTag({ status }: { status: TimelineNode['status'] }) {
  return (
    <span className={`tl-tag tl-${status}`} title={STATUS_HINTS[status]}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Says which timeline the author is in, wherever they are in the project.
 * Shown only when it matters: the story has more than one timeline, or this
 * one is not main canon.
 */
export function TimelineTag({ projectId }: { projectId: string }) {
  const family = useFamily(projectId);
  if (!family || (family.members.length === 1 && family.me.status === 'main')) return null;
  return <StatusTag status={family.me.status} />;
}
