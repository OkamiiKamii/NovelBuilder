// WRITE (FEATURES.md sections 6–7): the Contents of the open novel, styled as a printed contents page, beside the
// chapter editor. On a phone one at a time: the contents, then the editor with a Back arrow. The chapter open last is
// remembered for each novel.

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openNovelSettingKey } from '../../data/settingsStore';
import {
  isDocument,
  kindLabel,
  kindsInside,
  type NodeKind,
  readingOrder,
  type StoryNode,
  siblingsOf,
} from '../../domain/outline';
import { nodeStatuses } from '../../domain/records/nodeStatus';
import { ActionSheet, ConfirmDelete, PromptSheet, type SheetAction } from '../dialogs';
import { useKeyboardHeight } from '../frame';
import { useDeskSetting, useFocusMode } from './deskState';
import { GoldButton, Icon, IconButton, Muted, Panel } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { EditorPane, type Jump } from './EditorPane';
import { DayBookCard, DraftRoad, GapsCard, StoryLines } from './ContentsCards';
import { carryOnNode, dayBookOf, writingSessionOf } from '../../domain/desk/dayBook';
import { displayTitle, nextNotesKey, readNextNotes } from '../../domain/desk/pageAround';
import { storyCardOf, type StoryCard } from '../../domain/manuscript/storyboard';
import { bookGaps } from '../../domain/text/gaps';
import { docBlocks } from '../../domain/prose';
import { str } from '../../domain/json';
import { usePageCompany } from './PageCompany';
import { GoalPledgeSheet } from './GoalPledgeSheet';
import { TodaysPageSheet } from './TodaysPageSheet';

export const lastNodeSetting = (novelId: string) => `write.lastNode.${novelId}`;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function WriteScreen() {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const phone = sizeClassOf(width) === 'compact';
  const keyboard = useKeyboardHeight();
  // In focus mode the bottom bar is gone, so the page keeps clear of Android's own bar itself.
  const focus = useFocusMode();

  const novelId = useMemo(() => {
    const id = lib.settings.read(openNovelSettingKey);
    return typeof id === 'string' && lib.novels.exists(id) ? id : null;
  }, [lib, revision]);
  const novel = novelId ? lib.library.novel(novelId) : null;

  const nodes = useMemo(() => (novelId ? lib.manuscript.nodes(novelId) : []), [lib, novelId, revision]);
  const order = useMemo(() => readingOrder(nodes), [nodes]);

  const [chosen, setChosen] = useState<string | null>(null);
  const remembered = novelId ? lib.settings.read(lastNodeSetting(novelId)) : null;
  const selectedId =
    [chosen, typeof remembered === 'string' ? remembered : null].find(
      (id) => id && nodes.some((n) => n.id === id && isDocument(n.kind)),
    ) ??
    order.find((e) => isDocument(e.node.kind))?.node.id ??
    null;
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const [phoneView, setPhoneView] = useState<'contents' | 'editor'>('editor');
  const [jump, setJump] = useState<{ nodeId: string; to: Jump } | null>(null);
  const [storyboard, setStoryboard] = useDeskSetting('write.storyboard', false);

  // The contents' cards and the storyboard: read only while the contents are on the screen.
  const contentsShown = !phone || phoneView === 'contents' || !selectedId;
  const company = usePageCompany(lib, novelId ?? '', revision);
  const desk = useMemo(() => {
    if (!novelId || !contentsShown) return null;
    const docs = order.map((e) => e.node).filter((n) => isDocument(n.kind));
    const pages = new Map<string, { heading: boolean; text: string }[]>();
    for (const r of lib.novels.rowsIn(novelId, 'chapterContents')) pages.set(str(r['id']), docBlocks(r['doc']));
    const gaps = bookGaps(new Map([...pages].map(([id, b]) => [id, b.map((x) => x.text)])), docs.map((n) => n.id));
    const cards = new Map<string, StoryCard>();
    if (storyboard) for (const n of docs) cards.set(n.id, storyCardOf(pages.get(n.id) ?? [], company.names));
    const book = dayBookOf(lib.novels.rowsIn(novelId, 'writingSessions').map(writingSessionOf), Date.now());
    const next = docs.length ? carryOnNode(nodes, lib.settings.read(lastNodeSetting(novelId))) : null;
    const notes = readNextNotes(lib.settings.read(nextNotesKey(novelId)));
    const longest = Math.max(1, ...docs.map((n) => n.wordCount));
    const goal = lib.manuscript.wordGoals(novelId).daily;
    return { gaps, cards, book, goal, next, note: next ? notes.get(next.id) : undefined, longest };
  }, [lib, novelId, contentsShown, order, nodes, storyboard, company, revision]);

  const select = useCallback(
    (id: string, to: Jump | null = null) => {
      setJump(to ? { nodeId: id, to } : null);
      setChosen(id);
      if (novelId) lib.saves.saveNow(`setting:${lastNodeSetting(novelId)}`, () => lib.settings.write(lastNodeSetting(novelId), id));
      setPhoneView('editor');
    },
    [lib, novelId],
  );

  // ---- the contents' actions

  const [menuFor, setMenuFor] = useState<StoryNode | null>(null);
  const [bookMenu, setBookMenu] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);
  const [addInto, setAddInto] = useState<{ parent: StoryNode | null } | null>(null);
  const [renaming, setRenaming] = useState<StoryNode | null>(null);
  const [statusFor, setStatusFor] = useState<StoryNode | null>(null);
  const [moving, setMoving] = useState<StoryNode | null>(null);
  const [deleting, setDeleting] = useState<StoryNode | null>(null);

  const attempt = (what: () => void, failure: string) => {
    try {
      what();
    } catch (e) {
      toast(`${failure}: ${message(e)}`, { error: true });
    }
  };

  const add = (kind: NodeKind, parentId: string | null) =>
    attempt(() => {
      const made = lib.manuscript.create(novelId!, kind, parentId);
      if (isDocument(kind)) select(made.id);
      else toast(`Added ${made.title}`);
    }, 'It could not be added');

  const nodeActions = (n: StoryNode): SheetAction[] => {
    const canMerge = isDocument(n.kind) && (() => { try { return lib.manuscript.canMerge(novelId!, n.id); } catch { return false; } })();
    return [
      { label: 'Open', icon: 'feather', onPress: () => select(n.id), hidden: !isDocument(n.kind) },
      { label: 'Rename…', icon: 'pencil-outline', onPress: () => setRenaming(n) },
      ...kindsInside(n.kind).map(
        (k): SheetAction => ({ label: `Add ${kindLabel[k].toLowerCase()} inside`, icon: 'plus', onPress: () => add(k, n.id) }),
      ),
      { label: 'Move up', icon: 'arrow-up', onPress: () => attempt(() => lib.manuscript.nudge(novelId!, n.id, -1), 'It could not be moved') },
      { label: 'Move down', icon: 'arrow-down', onPress: () => attempt(() => lib.manuscript.nudge(novelId!, n.id, 1), 'It could not be moved') },
      { label: 'Move to…', icon: 'folder-move-outline', onPress: () => setMoving(n) },
      {
        label: 'Duplicate',
        icon: 'content-copy',
        onPress: () => attempt(() => toast(`Made a copy`, { action: { label: 'Open', run: () => select(lib.manuscript.duplicate(novelId!, n.id)) } }), 'It could not be duplicated'),
      },
      {
        label: 'Merge with the next one',
        icon: 'call-merge',
        hidden: !canMerge,
        onPress: () => attempt(() => {
          lib.manuscript.merge(novelId!, n.id);
          toast('Merged. Both texts are kept in version history.');
        }, 'It could not be merged'),
      },
      { label: 'Status…', icon: 'progress-check', onPress: () => setStatusFor(n), hidden: !isDocument(n.kind) },
      { label: 'Delete…', icon: 'delete-outline', tone: 'danger', onPress: () => setDeleting(n) },
    ];
  };

  const remove = (n: StoryNode) => {
    setDeleting(null);
    attempt(() => {
      const point = lib.manuscript.delete(novelId!, n.id, n.title);
      toast(`Deleted “${n.title}”`, { action: { label: 'Undo', run: () => attempt(() => lib.manuscript.undoDelete(point), 'Undo failed') } });
    }, 'It could not be deleted');
  };

  // Where a node may move: the top level, and every group or chapter that may hold it (never inside itself).
  const moveTargets = (n: StoryNode): SheetAction[] => {
    const inside = new Set<string>();
    const walk = (id: string) => {
      inside.add(id);
      for (const c of siblingsOf(nodes, id)) walk(c.id);
    };
    walk(n.id);
    const targets: SheetAction[] = [];
    if (n.kind !== 'scene') {
      targets.push({ label: 'The top level', icon: 'format-vertical-align-top', onPress: () => attempt(() => lib.manuscript.move(novelId!, n.id, null), 'It could not be moved') });
    }
    for (const { node: t } of order) {
      if (inside.has(t.id) || !n.kind || !kindsInside(t.kind).includes(n.kind)) continue;
      targets.push({ label: `${kindLabel[t.kind!]}: ${t.title}`, icon: 'folder-outline', onPress: () => attempt(() => lib.manuscript.move(novelId!, n.id, t.id), 'It could not be moved') });
    }
    return targets;
  };

  // ---- no novel open

  if (!novelId || !novel) {
    return (
      <View style={[styles.page, styles.center, { paddingTop: insets.top }]}>
        <Panel style={styles.emptyPanel}>
          <Icon name="feather" size={40} />
          <Text style={styles.emptyTitle}>No novel open</Text>
          <Muted style={styles.centerText}>Write works inside one novel. Open one from your Library.</Muted>
          <GoldButton label="Go to Library" icon="book-open-page-variant-outline" onPress={() => router.navigate('/')} />
        </Panel>
      </View>
    );
  }

  const chapterNumber = new Map<string, number>();
  let count = 0;
  for (const { node } of order) if (node.kind === 'chapter') chapterNumber.set(node.id, ++count);
  const kickerOf = (n: StoryNode) => {
    if (n.kind === 'chapter') return `CHAPTER ${chapterNumber.get(n.id) ?? ''}`;
    const parent = nodes.find((x) => x.id === n.parentId);
    return parent ? `CHAPTER ${chapterNumber.get(parent.id) ?? ''} · SCENE` : 'SCENE';
  };
  const totalWords = nodes.reduce((t, n) => t + (isDocument(n.kind) ? n.wordCount : 0), 0);

  const contents = (
    <View style={[styles.contents, !phone && styles.contentsWide, { paddingTop: insets.top + space.md }]}>
      <View style={styles.contentsHead}>
        <View style={styles.flex}>
          <Text style={styles.contentsTitle} accessibilityRole="header">
            Contents
          </Text>
          <Text style={styles.novelTitle} numberOfLines={1}>
            {novel.title || 'Untitled novel'} · {totalWords.toLocaleString('en-US')} words
          </Text>
        </View>
        <IconButton
          icon={storyboard ? 'format-list-bulleted' : 'view-agenda-outline'}
          label={storyboard ? 'Show the list' : 'Show the storyboard'}
          onPress={() => setStoryboard(!storyboard)}
          color={storyboard ? colors.gold : colors.text}
        />
        <IconButton icon="book-open-page-variant-outline" label="The book: read, details, publish" onPress={() => setBookMenu(true)} />
        <IconButton icon="plus" label="Add a part or chapter" onPress={() => setAddInto({ parent: null })} bordered color={colors.gold} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: (phone ? 0 : insets.bottom) + space.xl }}>
        {desk && (
          <>
            <DayBookCard
              book={desk.book}
              goal={desk.goal}
              next={desk.next}
              note={desk.note}
              onCarryOn={() => desk.next && select(desk.next.id, 'end')}
              onSetGoal={() => setGoalsOpen(true)}
              onShare={() => setTodayOpen(true)}
            />
            <DraftRoad words={totalWords} target={novel.targetWordCount} />
            <GapsCard
              gaps={desk.gaps}
              titleOf={(id) => {
                const n = nodes.find((x) => x.id === id);
                return n ? displayTitle(n) : '';
              }}
              onOpen={(g) => select(g.nodeId, { block: g.block, start: g.start, end: g.end })}
            />
          </>
        )}
        {order.length === 0 ? (
          <View style={styles.emptyContents}>
            <Muted>Your book has no chapters yet.</Muted>
            <GoldButton label="Add chapter" icon="plus" onPress={() => add('chapter', null)} compact />
          </View>
        ) : (
          order.map(({ node: n, depth }) => {
            const isSel = n.id === selectedId;
            const status = nodeStatuses.find((s) => s.key === n.status)?.label ?? 'Idea';
            if (!isDocument(n.kind)) {
              return (
                <Pressable
                  key={n.id}
                  onLongPress={() => setMenuFor(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${kindLabel[n.kind ?? 'volume']}: ${n.title}. More actions`}
                  onPress={() => setMenuFor(n)}
                  style={[styles.group, { marginLeft: depth * 14 }]}
                >
                  <View style={styles.groupRule} />
                  <Text style={styles.groupTitle} numberOfLines={1}>
                    {n.title.toUpperCase()}
                  </Text>
                  <View style={styles.groupRule} />
                </Pressable>
              );
            }
            return (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${n.kind === 'scene' ? 'Scene' : `Chapter ${chapterNumber.get(n.id)}`}: ${n.title}, ${n.wordCount} words, ${status}`}
                onPress={() => select(n.id)}
                onLongPress={() => setMenuFor(n)}
                style={[styles.line, { paddingLeft: space.md + depth * 14 }, isSel && styles.lineOn]}
              >
                {isSel && <View style={styles.ribbon} />}
                <View style={styles.flex}>
                  <View style={styles.lineTop}>
                    <Text style={[n.kind === 'scene' ? styles.sceneTitle : styles.chapterTitle, isSel && { color: colors.gold }]} numberOfLines={1}>
                      {n.kind === 'scene' ? `§ ${n.title}` : `${chapterNumber.get(n.id)}  ${n.title}`}
                    </Text>
                    <View style={[styles.leader, isSel && { borderColor: colors.gold }]} />
                    <Text style={[styles.lineWords, isSel && { color: colors.text }]}>{n.wordCount.toLocaleString('en-US')}</Text>
                  </View>
                  <Text style={[styles.lineStatus, isSel && { color: colors.text }]}>{status}</Text>
                  {storyboard && desk && (
                    <StoryLines
                      card={desk.cards.get(n.id)}
                      names={(id) => str(company.entries.get(id)?.['name']).trim()}
                      share={n.wordCount / desk.longest}
                      selected={isSel}
                    />
                  )}
                </View>
                <IconButton icon="dots-vertical" label={`More for ${n.title}`} onPress={() => setMenuFor(n)} color={isSel ? colors.gold : colors.muted} />
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  const editor = selected ? (
    <View style={[styles.flex, { paddingTop: insets.top, paddingBottom: keyboard > 0 ? keyboard + insets.bottom : phone && !focus ? 0 : insets.bottom }]}>
      <EditorPane
        key={selected.id}
        novelId={novelId}
        node={selected}
        kicker={kickerOf(selected)}
        nodes={nodes}
        author={novel.author}
        jumpTo={jump && jump.nodeId === selected.id ? jump.to : null}
        onJumped={() => setJump(null)}
        onBack={phone ? () => setPhoneView('contents') : undefined}
        onOpenNode={select}
      />
    </View>
  ) : (
    <View style={[styles.flex, styles.center]}>
      <Panel style={styles.emptyPanel}>
        <Icon name="feather" size={40} />
        <Text style={styles.emptyTitle}>{order.length ? 'Choose a chapter or scene' : 'Start with a chapter'}</Text>
        {!order.length && <GoldButton label="Add chapter" icon="plus" onPress={() => add('chapter', null)} />}
      </Panel>
    </View>
  );

  return (
    <View style={styles.page}>
      {phone ? (phoneView === 'contents' || !selected ? contents : editor) : (
        <View style={styles.row}>
          {contents}
          {editor}
        </View>
      )}

      <ActionSheet visible={menuFor !== null} title={menuFor?.title ?? ''} actions={menuFor ? nodeActions(menuFor) : []} onClose={() => setMenuFor(null)} />
      <ActionSheet
        visible={addInto !== null}
        title="Add"
        actions={kindsInside(addInto?.parent?.kind ?? null).map((k) => ({ label: kindLabel[k], icon: k === 'chapter' ? 'file-document-outline' : 'folder-outline', onPress: () => add(k, addInto?.parent?.id ?? null) }))}
        onClose={() => setAddInto(null)}
      />
      <ActionSheet
        visible={statusFor !== null}
        title="Status"
        actions={nodeStatuses.map((s) => ({
          label: s.label,
          icon: statusFor?.status === s.key ? 'check-circle' : 'circle-outline',
          onPress: () => statusFor && attempt(() => lib.manuscript.setStatus(novelId, statusFor.id, s.key), 'It could not be changed'),
        }))}
        onClose={() => setStatusFor(null)}
      />
      <GoalPledgeSheet visible={goalsOpen} novelId={novelId} words={totalWords} target={novel.targetWordCount} onClose={() => setGoalsOpen(false)} />
      <TodaysPageSheet visible={todayOpen} novelId={novelId} onClose={() => setTodayOpen(false)} />
      <ActionSheet
        visible={bookMenu}
        title="The book"
        onClose={() => setBookMenu(false)}
        actions={[
          { label: 'Read as a book and publish', icon: 'book-open-variant', onPress: () => router.navigate('/write/read') },
          { label: 'Book details', icon: 'book-edit-outline', onPress: () => router.navigate('/write/book') },
        ]}
      />
      <ActionSheet visible={moving !== null} title="Move to" actions={moving ? moveTargets(moving) : []} onClose={() => setMoving(null)} />
      <PromptSheet
        visible={renaming !== null}
        title="Rename"
        label="Title"
        initial={renaming?.title ?? ''}
        confirmLabel="Rename"
        onSubmit={(title) => {
          const n = renaming;
          setRenaming(null);
          if (n) attempt(() => lib.manuscript.rename(novelId, n.id, title), 'It could not be renamed');
        }}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDelete
        visible={deleting !== null}
        title={`Delete this ${deleting?.kind ?? 'part'}?`}
        message={`“${deleting?.title ?? ''}” and everything inside it will be deleted: its text, scenes, plans and versions. A restore point is kept first, so you can undo it.`}
        confirmLabel="Delete"
        onConfirm={() => deleting && remove(deleting)}
        onClose={() => setDeleting(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  emptyPanel: { alignItems: 'center', gap: space.md, margin: space.lg, maxWidth: 420 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.text, textAlign: 'center' },
  contents: { flex: 1, backgroundColor: colors.surface },
  contentsWide: { flex: 0, width: 300, borderRightWidth: 1, borderRightColor: colors.border },
  contentsHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md },
  contentsTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.gold },
  novelTitle: { fontFamily: fonts.ui, fontSize: 13, color: colors.muted },
  emptyContents: { alignItems: 'flex-start', gap: space.md, padding: space.md },
  group: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, marginTop: space.sm },
  groupRule: { flex: 1, height: 1, backgroundColor: colors.border },
  groupTitle: { fontFamily: fonts.ui, fontSize: 13, letterSpacing: 2, color: colors.muted, maxWidth: '70%' },
  line: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingRight: 4, marginHorizontal: space.sm, borderRadius: radius.field, overflow: 'hidden' },
  lineOn: { backgroundColor: '#3A2A08', borderWidth: 1, borderColor: colors.gold },
  ribbon: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.gold },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chapterTitle: { flexShrink: 1, fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  sceneTitle: { flexShrink: 1, fontFamily: fonts.bookItalic, fontSize: 14, color: colors.text },
  leader: { flex: 1, minWidth: 12, borderBottomWidth: 1, borderStyle: 'dotted', borderColor: colors.muted, marginTop: 8 },
  lineWords: { fontFamily: fonts.numbers, fontSize: 12, color: colors.muted },
  lineStatus: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, marginTop: 2 },
});
