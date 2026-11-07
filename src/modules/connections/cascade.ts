import type { NovelDB } from '@/core/db';

/**
 * Removes every connection that has one of these records at either end.
 * Called inside the transaction that deletes the records, so a connection
 * never outlives what it joined. The other end is never touched.
 */
export async function removeConnectionsOf(db: NovelDB, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.loreLinks.where('fromId').anyOf(ids).or('toId').anyOf(ids).delete();
}

/** The same for abilities, which are named `<systemId>/<itemId>`: all of a blueprint's, or only some of its items. */
export async function removeAbilityConnections(db: NovelDB, projectId: string, systemId: string, itemIds?: string[]): Promise<void> {
  const prefix = `${systemId}/`;
  const gone = (id: string) => id.startsWith(prefix) && (!itemIds || itemIds.includes(id.slice(prefix.length)));
  await db.loreLinks.where('projectId').equals(projectId).filter((l) => (l.fromType === 'ability' && gone(l.fromId)) || (l.toType === 'ability' && gone(l.toId))).delete();
}
