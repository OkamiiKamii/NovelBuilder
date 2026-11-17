// The character's relationships, each with how it stands now and how many states its history holds. The logic of
// flutter_app/lib/features/characters/tabs/relationships_tab.dart. Opening one shows its whole history, where changes
// are recorded. Nothing is inferred: a role is shown only as the author set it.

import { localeCompare } from '../../collation';
import { formatNumber } from '../../desk/format';
import { type StoryModel } from '../../model/storyModel';
import { stageAt } from '../../model/storyOrder';
import { stableSorted } from '../../reader/stableSort';
import { type Entry } from '../../records/entry';
import { type CharacterRelation } from '../../records/relation';
import { roleOf } from '../history';
import { feelingLabel, relationCategoryLabels, relationCategoryOf } from '../relationTypes';
import { relationSettingsPath, relationshipPath } from './relationshipPage';

export type RelationshipRow = {
  relation: CharacterRelation;
  /** The other character (their portrait, their name). */
  other: Entry;
  title: string;
  /** "Rival · The long feud · Social · Hostile · 3 stages over the story". */
  subtitle: string;
  opens: string;
};

export type RelationshipsTabView = {
  /** "Relationships (2)". */
  title: string;
  settings: { label: string; path: string };
  /** `addRelationshipDialog` (relationshipPage.ts), then the new relationship's page. */
  addLabel: string;
  rows: RelationshipRow[];
  /** When there are none. */
  none: string;
  openLabel: string;
};

export function relationshipsTabView(model: StoryModel, entry: Entry): RelationshipsTabView {
  const found: { relation: CharacterRelation; other: Entry }[] = [];
  for (const relation of model.relations.values()) {
    if (relation.fromId !== entry.id && relation.toId !== entry.id) continue;
    const other = model.entries.get(relation.fromId === entry.id ? relation.toId : relation.fromId);
    if (other !== undefined) found.push({ relation, other });
  }
  const rows = stableSorted(found, (a, b) => localeCompare(a.other.name, b.other.name));
  return {
    title: `Relationships (${rows.length})`,
    settings: { label: 'Types and attributes…', path: relationSettingsPath },
    addLabel: 'Add a relationship',
    rows: rows.map((r) => {
      const stage = stageAt(r.relation, null, model.order);
      const role = stage === null ? '' : roleOf(stage, r.relation, r.other.id);
      const words = [
        role,
        ...(stage !== null && stage.title.length > 0 ? [stage.title] : []),
        ...(stage !== null
          ? [relationCategoryLabels[relationCategoryOf(stage.category)], feelingLabel(stage.affinity)]
          : []),
        ...(r.relation.stages.length > 1 ? [`${formatNumber(r.relation.stages.length)} stages over the story`] : []),
      ];
      return {
        relation: r.relation,
        other: r.other,
        title: r.other.name,
        subtitle: words.filter((w) => w.length > 0).join(' · '),
        opens: relationshipPath(r.relation.id),
      };
    }),
    none: `${entry.name} has no relationships recorded yet.`,
    openLabel: 'Open the relationship',
  };
}
