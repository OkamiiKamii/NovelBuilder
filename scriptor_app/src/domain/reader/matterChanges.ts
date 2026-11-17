// Saving the book's matter (dedication, epigraph, cast list, scene-break mark…). Pure TypeScript. A port of
// flutter_app/lib/shared/domain/reader/matter_changes.dart.

import type { JsonMap } from '../json';

/** The fields of the book's matter an author edits. */
export const matterFields: readonly string[] = [
  'dedication',
  'epigraph',
  'epigraphSource',
  'copyright',
  'acknowledgements',
  'aboutAuthor',
  'castTitle',
  'castList',
  'sceneBreak',
];

/** The matter row after [changes], as the original app's `updateMatter` writes it: the stored row (every field kept,
 * known or not) or a new one, with only the named text fields changed and the scene-break mark at most 12 characters
 * (UTF-16 units, as Dart counts them). */
export function matterWithChanges(
  stored: JsonMap | null,
  args: {
    projectId: string;
    changes: Readonly<Record<string, string | undefined>>;
    now: number;
    newId: () => string;
  },
): JsonMap {
  const was: JsonMap = {
    id: args.newId(),
    dedication: '',
    epigraph: '',
    epigraphSource: '',
    copyright: '',
    acknowledgements: '',
    aboutAuthor: '',
    sceneBreak: '* * *',
    ...(stored ?? {}),
  };
  const next: JsonMap = { ...was, projectId: args.projectId, updatedAt: args.now };
  for (const field of matterFields) {
    const value = Object.prototype.hasOwnProperty.call(args.changes, field) ? args.changes[field] : undefined;
    if (typeof value === 'string') {
      next[field] = field === 'sceneBreak' && value.length > 12 ? value.substring(0, 12) : value;
    }
  }
  return next;
}
