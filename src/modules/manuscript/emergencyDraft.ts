import type { DocJSON } from './types';

/**
 * Last line of defence when a page is closing. Database writes are
 * asynchronous and the browser may tear the page down before they commit, so
 * at that moment the unsaved text is also written here synchronously. It is
 * picked up as a recovered draft the next time the chapter is opened.
 */
export interface EmergencyDraft {
  projectId: string;
  doc: DocJSON;
  baseRev: number;
  updatedAt: number;
}

const key = (nodeId: string) => `novel-builder:emergency-draft:${nodeId}`;

export function writeEmergencyDraft(nodeId: string, draft: EmergencyDraft): void {
  try {
    localStorage.setItem(key(nodeId), JSON.stringify(draft));
  } catch {
    // Storage full or unavailable: the regular draft and save are still in play.
  }
}

export function clearEmergencyDraft(nodeId: string): void {
  try {
    localStorage.removeItem(key(nodeId));
  } catch {
    // nothing to clear
  }
}

/**
 * Reads the emergency draft for a node, if there is a usable one. It is left
 * in place: the caller clears it only once the text is safely in the database.
 */
export function readEmergencyDraft(nodeId: string, projectId: string): EmergencyDraft | null {
  try {
    const raw = localStorage.getItem(key(nodeId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<EmergencyDraft> | null;
    const valid = draft && draft.projectId === projectId && typeof draft.baseRev === 'number' && typeof draft.updatedAt === 'number' && draft.doc && typeof draft.doc === 'object';
    return valid ? (draft as EmergencyDraft) : null;
  } catch {
    return null;
  }
}
