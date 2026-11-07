import { db, projects } from '@/core';
import { dashboards } from '@/modules/dashboard/layout';
import { studio } from '@/modules/studio/store';
import { forgetBrowserData } from './browserData';

/**
 * Deletes a novel from this device: every record it owns (`projects.remove`),
 * then what this browser keeps for it (`browserData.ts`). Nothing of another
 * novel is touched.
 */
export async function removeNovel(projectId: string): Promise<void> {
  const nodeIds = (await db.chapters.where('projectId').equals(projectId).primaryKeys()) as string[];
  await projects.remove(projectId);
  forgetBrowserData(projectId, nodeIds);
  // The stores holding layouts in memory read storage again.
  studio.refresh();
  dashboards.refresh();
}
