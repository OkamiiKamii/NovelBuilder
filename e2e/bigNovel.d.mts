/** A large novel for measuring speed, shaped as the app stores it: rows by table. See bigNovel.mjs. */
export function bigNovel(projectId: string, at: number, scale?: number): Record<'chapters' | 'chapterPlans' | 'loreEntries' | 'loreSchemas' | 'loreLinks' | 'characterRelations' | 'timelineEvents' | 'plotThreads' | 'journeys' | 'canonFacts' | 'continuityRules', Record<string, unknown>[]>;
