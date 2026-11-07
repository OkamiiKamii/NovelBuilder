import { projects } from '@/core';
import { downloadBlob, fileSlug } from '@/shared/download';
import type { Project } from './types';

export async function downloadProject(project: Project): Promise<void> {
  // The complete archive, version history included: everything the author has made, in one readable file.
  const snapshot = await projects.exportSnapshot(project.id, { everything: true });
  downloadBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }), `${fileSlug(project.title)}.novel.json`);
}

export async function importProjectFile(file: File): Promise<Project> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(`"${file.name}" is not a valid JSON file.`);
  }
  return projects.importSnapshot(data);
}
