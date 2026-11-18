// WHAT DEPENDS ON THIS (FEATURES.md #320): before changing a chapter, an event or a development of a plot thread, what
// is recorded at that point, and what later in the story may rest on it; who it is taken to involve can be adjusted,
// and what has been looked at ticked off (kept on this device). Reads only; changes nothing and proposes no edit. A port
// of flutter_app/lib/features/consequences/consequences_page.dart; the analysis is
// src/domain/consequences/consequences.ts, run a moment after the page draws.

import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { characterPath } from '../../domain/characters/screens/create';
import { worldEntryPath } from '../../domain/codex/screens/entryPage';
import {
  type Consequence,
  type Report,
  type Subject,
  analyze,
  consequenceCollections,
  consequenceKindLabel,
  consequencesPath,
  worldFromRows,
} from '../../domain/consequences/consequences';
import { localeCompare } from '../../domain/exchange/collation';
import { type JsonMap, listOf, str } from '../../domain/json';
import { StoryOrder } from '../../domain/model/storyOrder';
import { isDocument, isGroup } from '../../domain/outline';
import { maps } from '../../domain/records/jsonRecord';
import { stableSorted } from '../../domain/reader/stableSort';
import { relationshipPath } from '../../domain/relationships/screens/relationshipPage';
import { eventPath } from '../../domain/timeline/timelineService';
import { Chip, Icon, Muted, OutlineButton } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { ChooserField } from '../organize/parts';
import { useOpenNovel } from '../organize/useNovel';
import { colors, fonts, space } from '../theme';
import { lastNodeSetting } from '../write/WriteScreen';
import { Box, reviewStyles as s } from './parts';

type Kind = 'node' | 'event' | 'beat';
const kindLabel: Readonly<Record<Kind, string>> = { node: 'A chapter or scene', event: 'An event', beat: 'A plot development' };

export type ConsequencesStart = { nodeId?: string | null; eventId?: string | null; threadId?: string | null; beatId?: string | null };

export function ConsequencesPane({ start = {} }: { start?: ConsequencesStart }) {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const novel = useOpenNovel();
  const novelId = novel?.novelId ?? null;
  const [kind, setKind] = useState<Kind>(start.eventId ? 'event' : start.beatId ? 'beat' : 'node');
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [report, setReport] = useState<{ key: string; report: Report } | null>(null);

  const world = useMemo(() => {
    if (novelId === null) return null;
    const snap = lib.novels.loadPart(novelId, consequenceCollections);
    return snap === null ? null : worldFromRows((c) => snap.rows(c));
  }, [lib, novelId, revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const subject: Subject | null =
    kind === 'node' && start.nodeId
      ? { kind: 'node', nodeId: start.nodeId }
      : kind === 'event' && start.eventId
        ? { kind: 'event', eventId: start.eventId }
        : kind === 'beat' && start.threadId && start.beatId
          ? { kind: 'beat', threadId: start.threadId, beatId: start.beatId }
          : null;
  const subjectKey =
    subject === null ? '' : subject.kind === 'node' ? `node:${subject.nodeId}` : subject.kind === 'event' ? `event:${subject.eventId}` : `beat:${subject.threadId}/${subject.beatId}`;
  const point = [subjectKey, ...include, '|', ...exclude].join(',');
  const key = `${revision}#${point}`;

  // Worked out a moment after the page draws, so the page stays usable while it reads the whole book.
  useEffect(() => {
    if (world === null || subject === null) return;
    const t = setTimeout(() => setReport({ key, report: analyze(world, subject, { include, exclude }) }), 30);
    return () => clearTimeout(t);
  }, [world, key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (novelId === null || world === null) return null;
  const lookedKey = `consequences.looked.${novelId}.${subjectKey}`;
  const looked = new Set(listOf(lib.settings.read(lookedKey)).map((k) => str(k)));
  const setLooked = (k: string, on: boolean) => {
    const next = new Set(looked);
    if (on) next.add(k);
    else next.delete(k);
    lib.saves.saveNow(`setting:${lookedKey}`, () => {
      lib.settings.write(lookedKey, [...next]);
      lib.novels.touchSettings();
    });
  };
  const go = (path: string) => router.navigate(path as never);
  const entryOf = (id: string) => world.entries.find((e) => e['id'] === id) ?? null;
  const entryPathOf = (e: JsonMap) => (e['category'] === 'character' ? characterPath(str(e['id'])) : worldEntryPath(str(e['id'])));
  const open = (target: JsonMap) => {
    switch (target['type']) {
      case 'node': {
        const nodeId = str(target['nodeId']);
        lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), nodeId));
        go('/write');
        break;
      }
      case 'entry': {
        const e = entryOf(str(target['entryId']));
        if (e) go(entryPathOf(e));
        break;
      }
      case 'thread':
        go(`/plan/thread/${str(target['threadId'])}`);
        break;
      case 'relation':
        go(relationshipPath(str(target['relationId'])));
        break;
      case 'snapshot':
        go(characterPath(str(target['entryId']), { tab: 'progression' }));
        break;
      case 'rule':
        go('/review/continuity');
        break;
      case 'fact':
        go('/review/canon');
        break;
      case 'event':
        go(eventPath(str(target['eventId'])));
        break;
    }
  };

  const order = StoryOrder.of(world.nodes);
  const documents = stableSorted(
    world.nodes.filter((n) => isDocument(n.kind) || isGroup(n.kind)),
    (a, b) => (order.position.get(a.id) ?? 0) - (order.position.get(b.id) ?? 0),
  );
  const events = stableSorted(world.events, (a, b) => localeCompare(str(a['name']), str(b['name'])));
  const beats = world.threads.flatMap((t) => maps(t['beats']).map((b) => ({ thread: t, beat: b })));
  const entries = stableSorted(world.entries, (a, b) => localeCompare(str(a['name']), str(b['name'])));
  const shown = report !== null && report.key.endsWith(`#${point}`) ? report.report : null;
  const updating = shown !== null && report!.key !== key;

  const picker =
    kind === 'node' ? (
      <ChooserField<string | null>
        label="Chapter or scene"
        value={documents.some((n) => n.id === start.nodeId) ? (start.nodeId ?? null) : null}
        choices={[{ value: null, label: 'Choose…' }, ...documents.map((n) => ({ value: n.id, label: n.displayTitle }))]}
        onChoose={(id) => id && go(consequencesPath({ nodeId: id }))}
      />
    ) : kind === 'event' ? (
      <ChooserField<string | null>
        label="Event"
        value={events.some((e) => e['id'] === start.eventId) ? (start.eventId ?? null) : null}
        choices={[{ value: null, label: 'Choose…' }, ...events.map((e) => ({ value: str(e['id']), label: str(e['name'], 'Untitled event') }))]}
        onChoose={(id) => id && go(consequencesPath({ eventId: id }))}
      />
    ) : (
      <ChooserField<string | null>
        label="Plot development"
        value={beats.some((b) => b.thread['id'] === start.threadId && b.beat['id'] === start.beatId) ? `${start.threadId}/${start.beatId}` : null}
        choices={[
          { value: null, label: 'Choose…' },
          ...beats.map((b) => ({ value: `${str(b.thread['id'])}/${str(b.beat['id'])}`, label: `${str(b.thread['title'])}: ${str(b.beat['title'], 'a development')}` })),
        ]}
        onChoose={(v) => {
          if (!v) return;
          const at = v.indexOf('/');
          go(consequencesPath({ threadId: v.substring(0, at), beatId: v.substring(at + 1) }));
        }}
      />
    );

  const card = (c: Consequence) => {
    const done = looked.has(c.key);
    return (
      <View key={c.key} style={styles.card}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Looked at: ${c.message}`}
          onPress={() => setLooked(c.key, !done)}
          hitSlop={8}
          style={styles.check}
        >
          <Icon name={done ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={done ? colors.gold : colors.muted} />
        </Pressable>
        <View style={[s.flex, s.gapSm]}>
          <Text style={s.label}>{consequenceKindLabel[c.kind].toUpperCase()}</Text>
          <Text style={[s.body, done && { color: colors.muted }]}>{c.message}</Text>
          <Text style={s.small}>{c.basis}</Text>
          {c.excerpt !== null && <Text style={styles.excerpt}>“{c.excerpt}”</Text>}
          <OutlineButton label="Open" compact onPress={() => open(c.target)} style={styles.start} />
        </View>
      </View>
    );
  };

  return (
    <View style={s.gap}>
      <Muted>Read only: nothing here changes the novel or suggests an edit.</Muted>
      <View style={s.row}>
        {(['node', 'event', 'beat'] as const).map((k) => (
          <Chip key={k} label={kindLabel[k]} selected={kind === k} onPress={() => setKind(k)} />
        ))}
      </View>
      {picker}
      {subject === null ? (
        <Box title="Pick the point you are thinking of changing" caption="A chapter or scene, an event, or a development of a plot thread." />
      ) : shown === null ? (
        <View style={s.row} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.gold} />
          <Text style={s.body}>Reading what may depend on it…</Text>
        </View>
      ) : !shown.found ? (
        <Box title={shown.title} caption="It is no longer in the novel." />
      ) : (
        <>
          {updating && <Muted>Updating with your latest changes…</Muted>}
          <Text style={styles.title} accessibilityRole="header">
            If {shown.title} changes
          </Text>
          <Text style={s.body}>
            {shown.summaryLine}. {shown.downstream} chapters and scenes come after it.
          </Text>
          <Text style={s.strong}>Taken to involve</Text>
          <View style={s.row}>
            {shown.seeds.length === 0 && <Muted>No one in particular.</Muted>}
            {shown.seeds.map((e) => (
              <View key={str(e['id'])} style={styles.seed}>
                <Pressable accessibilityRole="link" onPress={() => go(entryPathOf(e))}>
                  <Text style={s.body}>{str(e['name'])}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Leave out ${str(e['name'])}`}
                  hitSlop={8}
                  onPress={() => {
                    const id = str(e['id']);
                    if (include.includes(id)) setInclude(include.filter((x) => x !== id));
                    else setExclude([...exclude, id]);
                  }}
                >
                  <Icon name="close" size={16} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
          <ChooserField<string | null>
            label="Also involves…"
            value={null}
            choices={[
              { value: null, label: 'Choose…' },
              ...entries.filter((e) => !shown.seeds.some((x) => x['id'] === e['id'])).map((e) => ({ value: str(e['id']), label: str(e['name']) })),
            ]}
            onChoose={(id) => {
              if (!id) return;
              setExclude(exclude.filter((x) => x !== id));
              if (!shown.suggested.some((x) => x['id'] === id)) setInclude([...include, id]);
            }}
          />
          <Text style={styles.title} accessibilityRole="header">
            Recorded at this point ({shown.established.length})
          </Text>
          <Muted>Things you have recorded that are tied to exactly this point: if it changes, they hang on something no longer there.</Muted>
          {shown.established.length === 0 && <Muted>Nothing is recorded at this point.</Muted>}
          {shown.established.map(card)}
          <Text style={styles.title} accessibilityRole="header">
            May be affected later ({shown.potential.length})
          </Text>
          <Muted>
            Later things that involve the same people, places or threads. They may rest on this point, or not at all: nothing in the novel says, so
            these are possibilities to look at, not facts.
          </Muted>
          {shown.potential.length === 0 && <Muted>Nothing later involves them.</Muted>}
          {shown.potential.map(card)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: 'flex-start' },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.text, marginTop: space.sm },
  card: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  check: { paddingTop: 2 },
  excerpt: {
    fontFamily: fonts.bookItalic,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: 10,
  },
  seed: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
});
