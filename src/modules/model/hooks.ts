import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core';
import { loadModel } from './model';
import type { StoryModel } from './types';

/**
 * One project's records, read live: any change to them anywhere in the app
 * shows here at once. `undefined` while loading, `null` when there is no
 * such project. Nothing is copied or stored for the views.
 */
export function useStoryModel(projectId: string): StoryModel | null | undefined {
  return useLiveQuery(() => loadModel(db, projectId), [projectId]);
}
