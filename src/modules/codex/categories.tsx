import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { codex } from '@/core';
import { builtinCategory, unknownCategory } from './schema';
import { LORE_CATEGORIES, type Category, type LoreEntry } from './types';

interface Categories {
  list: Category[];
  get: (key: string) => Category;
}

const defaults: Category[] = LORE_CATEGORIES.map(builtinCategory);
const lookup = (list: Category[]): Categories => {
  const byKey = new Map(list.map((c) => [c.key, c]));
  return { list, get: (key) => byKey.get(key) ?? unknownCategory(key) };
};
const CategoriesContext = createContext<Categories>(lookup(defaults));

/** Makes a project's categories (built-in and custom, with their field sets) available to everything inside it. */
export function CategoriesProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const list = useLiveQuery(() => codex.forProject(projectId).categories(), [projectId]);
  const value = useMemo(() => lookup(list ?? defaults), [list]);
  // Wait for the project's own categories: drawing with the defaults first would briefly misplace every custom field.
  if (!list) return null;
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

export const useCategories = (): Categories => useContext(CategoriesContext);

/** `<option>`s for choosing an entry, grouped under the project's categories. */
export function EntryOptions({ entries }: { entries: LoreEntry[] }) {
  const { list } = useCategories();
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {list.map((category) => {
        const options = sorted.filter((e) => e.category === category.key);
        return options.length ? (
          <optgroup key={category.key} label={category.name}>
            {options.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </>
  );
}
