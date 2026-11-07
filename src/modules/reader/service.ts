import type { NovelDB } from '@/core/db';
import type { ProjectRegistry } from '@/core/projectRegistry';
import { emptyMatter, type BookMatter, type BookSource } from './book';

/** The book's front and back matter is part of the project: it is copied, backed up and synced with it. */
export function registerReader(registry: ProjectRegistry): void {
  registry.registerCollection({ table: 'bookMatter' });
}

export type MatterChanges = Partial<Pick<BookMatter, 'dedication' | 'epigraph' | 'epigraphSource' | 'copyright' | 'acknowledgements' | 'aboutAuthor' | 'sceneBreak'>>;

export function createReaderService(db: NovelDB, onChanged: (projectId: string) => Promise<void> | void) {
  return {
    forProject(projectId: string) {
      const stored = async (): Promise<BookMatter | undefined> => (await db.bookMatter.where('projectId').equals(projectId).toArray())[0];
      return {
        /** The front and back matter, or blanks if none has been written. Reads only. */
        matter: async (): Promise<BookMatter> => (await stored()) ?? emptyMatter(projectId),

        /** Saves front or back matter. This is the author's form in the project settings; the reader itself never calls it. */
        async updateMatter(changes: MatterChanges): Promise<void> {
          await db.transaction('rw', db.tables, async () => {
            if (!(await db.projects.get(projectId))) throw new Error('That project is not on this device.');
            const was = (await stored()) ?? { ...emptyMatter(projectId), id: crypto.randomUUID() };
            const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
            await db.bookMatter.put({
              ...was, projectId, dedication: text(changes.dedication, was.dedication), epigraph: text(changes.epigraph, was.epigraph), epigraphSource: text(changes.epigraphSource, was.epigraphSource), copyright: text(changes.copyright, was.copyright),
              acknowledgements: text(changes.acknowledgements, was.acknowledgements), aboutAuthor: text(changes.aboutAuthor, was.aboutAuthor), sceneBreak: text(changes.sceneBreak, was.sceneBreak).slice(0, 12), updatedAt: Date.now(),
            });
          });
          await onChanged(projectId);
        },

        /**
         * READ-ONLY RENDERING RULE
         * Everything the reader shows comes through here, inside a
         * transaction opened for reading only: the database itself would
         * refuse a write made from within it. Null when the project is not
         * on this device.
         */
        load: (): Promise<BookSource | null> =>
          db.transaction('r', db.projects, db.chapters, db.chapterContents, db.bookMatter, async () => {
            const project = await db.projects.get(projectId);
            if (!project) return null;
            const nodes = await db.chapters.where('projectId').equals(projectId).toArray();
            const contents = await db.chapterContents.where('projectId').equals(projectId).toArray();
            return { project, nodes, docs: new Map(contents.map((content) => [content.id, content.doc as unknown])), matter: (await stored()) ?? null };
          }),
      };
    },
  };
}

export type ReaderService = ReturnType<typeof createReaderService>;
