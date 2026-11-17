// Who and what the page names (FEATURES.md #94 name keys, #95 at a glance, #96 in this chapter, #88 title ideas): the
// codex as the page knows it, the strip of those the chapter names, the keys that put a name in, the card of the name
// under the caret, and names for a chapter that still has a stand-in title. All read only, except that a key puts a
// name in and a title idea renames the chapter, each only when pressed.

import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Library } from '../../data/library';
import { glanceOf, type GlanceCard } from '../../domain/characters/glance';
import { namesToFind } from '../../domain/characters/namedIn';
import { isMap, type JsonMap, listOf, str } from '../../domain/json';
import { type Present } from '../../domain/manuscript/inChapter';
import { type NameKey } from '../../domain/text/nameKeys';
import { Sheet } from '../dialogs';
import { Icon, Muted } from '../kit';
import { colors, fonts, radius, space } from '../theme';

export const categoryLabel: Record<string, string> = {
  character: 'Character',
  location: 'Place',
  faction: 'Faction',
  item: 'Item',
  power: 'Power',
  lore: 'Lore',
};

export type PageCompany = {
  /** Every codex entry by id. */
  entries: Map<string, JsonMap>;
  /** Character profiles by entry id. */
  profiles: Map<string, JsonMap>;
  /** The names each entry goes by on the page. */
  names: Record<string, string[]>;
  /** The kind each entry is, as shown ("Character", "Place"…). */
  kinds: Record<string, string>;
};

/** The entries a page could name: everyone and everything in the codex, with their profiles and their kinds. */
export function usePageCompany(lib: Library, novelId: string, revision: unknown): PageCompany {
  return useMemo(() => {
    const rows = [...lib.novels.rowsIn(novelId, 'loreEntries')].sort((a, b) => cmp(str(a['id']), str(b['id'])));
    // As the Flutter app: the profiles newest id first, each entry keeping the last one read (the oldest id).
    const profileRows = [...lib.novels.rowsIn(novelId, 'characterProfiles')].sort((a, b) => cmp(str(b['id']), str(a['id'])));
    const profiles = new Map<string, JsonMap>();
    for (const p of profileRows) profiles.set(str(p['entryId']), p);
    const names = namesToFind(
      rows.map((r) => ({ id: str(r['id']), name: str(r['name']), category: str(r['category']) })),
      new Map(
        [...profiles].map(([id, p]) => [
          id,
          {
            aliases: listOf(p['aliases']).filter((a): a is string => typeof a === 'string'),
            epithet: str(p['epithet']),
          },
        ]),
      ),
    );
    const kinds: Record<string, string> = {};
    for (const r of rows) kinds[str(r['id'])] = categoryLabel[str(r['category'])] ?? 'Entry';
    return { entries: new Map(rows.map((r) => [str(r['id']), r])), profiles, names, kinds };
  }, [lib, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** How many times the document links to each entry. */
export function linksIn(doc: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (node: unknown): void => {
    if (!isMap(node)) return;
    for (const mark of listOf(node['marks']).filter(isMap)) {
      const id = isMap(mark['attrs']) ? mark['attrs']['entryId'] : undefined;
      if (mark['type'] === 'entityLink' && typeof id === 'string') out[id] = (out[id] ?? 0) + 1;
    }
    for (const c of listOf(node['content'])) walk(c);
  };
  walk(doc);
  return out;
}

export function cardOf(company: PageCompany, id: string): GlanceCard | null {
  const entry = company.entries.get(id);
  if (!entry) return null;
  return glanceOf(entry, { profile: company.profiles.get(id) ?? null, what: company.kinds[id] ?? '' });
}

/** A face for an entry: their initials in their own colour. */
function Face({ name, colour, size = 28 }: { name: string; colour: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, borderColor: colour }]}>
      <Text style={[styles.faceText, { color: colour, fontSize: size * 0.4 }]}>{initials || '?'}</Text>
    </View>
  );
}

/** IN THIS CHAPTER (#96): under the heading, every record the text names or links, with how often; a press opens its
 * card. */
export function InChapterStrip({
  present,
  company,
  colourOf,
  onOpen,
}: {
  present: Present[];
  company: PageCompany;
  colourOf: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  if (present.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripScroll} contentContainerStyle={styles.strip}>
      <Text style={styles.stripLabel}>IN THIS CHAPTER</Text>
      {present.map((p) => {
        const name = str(company.entries.get(p.id)?.['name']) || 'Unnamed';
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`${name}, named ${p.mentions} ${p.mentions === 1 ? 'time' : 'times'}`}
            onPress={() => onOpen(p.id)}
            style={styles.presentChip}
          >
            <Face name={name} colour={colourOf(p.id)} size={22} />
            <Text style={styles.presentName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.presentCount}>{p.mentions}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** NAME KEYS (#94): the book's names that complete the word being typed, or, when nothing is, the names already on
 * this page; a press puts the name in. */
export function NameKeysRow({ keys, completing, onPress }: { keys: NameKey[]; completing: boolean; onPress: (k: NameKey) => void }) {
  if (keys.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.keys}>
      <Icon name={completing ? 'keyboard-tab' : 'account-multiple-outline'} size={16} color={colors.muted} />
      {keys.map((k) => (
        <Pressable
          key={`${k.id}:${k.name}`}
          accessibilityRole="button"
          accessibilityLabel={`Put in ${k.name}`}
          onPress={() => onPress(k)}
          style={({ pressed }) => [styles.key, completing && styles.keyCompleting, pressed && { backgroundColor: colors.elevated }]}
        >
          <Text style={styles.keyText}>{k.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** AT A GLANCE (#95): the card of the name the caret is on, in a line; a press opens the whole card. */
export function GlanceStrip({ card, colour, onOpen }: { card: GlanceCard; colour: string; onOpen: () => void }) {
  const first = card.facts.slice(0, 2).map((f) => `${f.label}: ${f.value}`);
  const line = [card.what, ...card.ties.slice(0, 1), ...first].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}. ${line}. Open the card`} onPress={onOpen} style={styles.glance}>
      <Face name={card.name} colour={colour} />
      <View style={styles.flex}>
        <Text style={styles.glanceName} numberOfLines={1}>
          {card.name}
          {card.epithet ? <Text style={styles.glanceEpithet}>{`  ${card.epithet}`}</Text> : null}
        </Text>
        {line ? (
          <Text style={styles.glanceLine} numberOfLines={1}>
            {line}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-up" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** The whole card. */
export function GlanceSheet({ card, colour, onClose }: { card: GlanceCard | null; colour: string; onClose: () => void }) {
  return (
    <Sheet visible={card !== null} onClose={onClose} title={card?.name ?? ''}>
      {card && (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Face name={card.name} colour={colour} size={48} />
            <View style={styles.flex}>
              {card.what ? <Text style={styles.cardWhat}>{card.what}</Text> : null}
              {card.epithet ? <Text style={styles.cardEpithet}>{card.epithet}</Text> : null}
            </View>
          </View>
          {card.summary ? <Text style={styles.cardSummary}>{card.summary}</Text> : null}
          {card.facts.map((f, i) => (
            <View key={i} style={styles.fact}>
              <Text style={styles.factLabel}>{f.label}</Text>
              <Text style={styles.factValue}>{f.value}</Text>
            </View>
          ))}
          {card.ties.map((t) => (
            <Text key={t} style={styles.tie}>
              {t}
            </Text>
          ))}
          {!card.summary && card.facts.length === 0 && card.ties.length === 0 && (
            <Muted>Nothing is recorded about them yet. Their page comes with Organize.</Muted>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** TITLE IDEAS (#88): while the chapter has a stand-in title, names drawn from its own text; a press renames it. */
export function TitleIdeas({ ideas, onPick }: { ideas: string[]; onPick: (title: string) => void }) {
  if (ideas.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stripScroll} contentContainerStyle={styles.strip}>
      <Icon name="lightbulb-outline" size={16} color={colors.gold} />
      <Text style={styles.stripLabel}>NAME IT</Text>
      {ideas.map((t) => (
        <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Rename to ${t}`} onPress={() => onPick(t)} style={styles.idea}>
          <Text style={styles.ideaText}>{t}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  face: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  faceText: { fontFamily: fonts.ui },
  stripScroll: { flexGrow: 0, flexShrink: 0 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm },
  stripLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1.5, color: colors.muted },
  presentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingLeft: 4,
    paddingRight: space.sm,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  presentName: { fontFamily: fonts.ui, fontSize: 13, color: colors.text, maxWidth: 140 },
  presentCount: { fontFamily: fonts.numbers, fontSize: 11, color: colors.muted },
  keys: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 4 },
  key: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  keyCompleting: { borderColor: colors.gold },
  keyText: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  glance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    marginHorizontal: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  glanceName: { fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  glanceEpithet: { fontFamily: fonts.bookItalic, fontSize: 12, color: colors.muted },
  glanceLine: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  card: { gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cardWhat: { fontFamily: fonts.ui, fontSize: 13, letterSpacing: 1, color: colors.gold },
  cardEpithet: { fontFamily: fonts.bookItalic, fontSize: 15, color: colors.text },
  cardSummary: { fontFamily: fonts.book, fontSize: 15, lineHeight: 24, color: colors.text },
  fact: { flexDirection: 'row', gap: space.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  factLabel: { width: 110, fontFamily: fonts.ui, fontSize: 14, color: colors.muted },
  factValue: { flex: 1, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  tie: { fontFamily: fonts.ui, fontSize: 14, color: colors.sky },
  idea: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  ideaText: { fontFamily: fonts.bookItalic, fontSize: 14, color: colors.gold },
});
