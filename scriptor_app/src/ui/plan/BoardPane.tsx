// THE SCENE BOARD (FEATURES.md #257–#260): the chapters as columns (or, on a narrow screen, lanes) and their scenes as
// cards with summary, status, word count and the plot threads recorded there. Cards move by dragging (a long press on a
// title; boardDrag.tsx) or by their buttons (earlier,
// later, into a volume, act or arc, to another chapter), through the manuscript service the Write area uses; each move
// and status change can be undone (the last 20), while things are as the board left them. Search, status and thread
// filters; moving is off while the board is filtered. A port of flutter_app/lib/features/plot/board_page.dart; what it
// shows is src/domain/plot/screens/boardPage.ts, the moves and the history src/domain/plot/board.ts.

import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { StoryModel } from '../../domain/model/storyModel';
import { type BoardChange, type BoardColumn, BoardHistory, type BoardPart, type Place, nudgePlace, placeOf, statusLabel } from '../../domain/plot/board';
import { threadPath } from '../../domain/plot/plotService';
import {
  addToThread,
  boardView,
  boardWords,
  bulkDialog,
  cannotUndo,
  cardControls,
  chapterCard,
  lanesByDefault,
  noBoardFilters,
  partEnd,
  partHead,
  sceneCard,
  threadChips,
  type BoardFilters,
  type BoardView,
} from '../../domain/plot/screens/boardPage';
import { nodeStatuses } from '../../domain/records/nodeStatus';
import type { NodeStatus, StoryNode } from '../../domain/records/storyNode';
import { ActionSheet, Sheet } from '../dialogs';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton } from '../kit';
import { useLibrary } from '../LibraryContext';
import { colors, fonts, space } from '../theme';
import { useToast } from '../toast';
import { lastNodeSetting } from '../write/WriteScreen';
import { DragHandle, DragScope, DropTarget, DropZone, useBoardDrag, useDragging, useRowScroll } from './boardDrag';
import { type OpenPlot, usePlot } from './usePlot';

type Menu = { title: string; actions: { label: string; icon: React.ComponentProps<typeof Icon>['name']; onPress: () => void }[] } | null;
type Ask = { title: string; message: string; confirm: string; cancel: string; run: () => void } | null;

const statusTone: Record<string, string> = {
  idea: colors.muted,
  planned: colors.sky,
  drafting: colors.gold,
  drafted: colors.gold,
  revising: '#C084FC',
  final: colors.success,
};

export function BoardPane({ threadId = null }: { threadId?: string | null }) {
  const plot = usePlot();
  if (!plot) return null;
  return <Board plot={plot} threadId={threadId} />;
}

function Board({ plot, threadId }: { plot: OpenPlot; threadId: string | null }) {
  const lib = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [filters, setFilters] = useState<BoardFilters>({ ...noBoardFilters, threadId });
  const [lanes, setLanes] = useState(lanesByDefault(width));
  const [history, setHistory] = useState<BoardHistory>(BoardHistory.empty);
  const [menu, setMenu] = useState<Menu>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const model = useMemo(() => StoryModel.fromSnapshot(plot.snapshot), [plot.snapshot]);
  const view = useMemo(() => boardView(model, filters), [model, filters]);
  const nodes = view.all;
  /** The chapters and scenes as stored this moment (after a move, before the screen has redrawn). */
  const freshNodes = (): StoryNode[] => {
    const now = plot.service.read(plot.novelId);
    return now === null ? nodes : [...StoryModel.fromSnapshot(now).nodes.values()];
  };

  // ---------------------------------------------------------------------------------------------- moving and undo

  const attempt = (run: () => void, failed: string): boolean => {
    try {
      run();
      return true;
    } catch (e) {
      toast(`${failed}: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      return false;
    }
  };

  const remember = (change: BoardChange) => {
    const next = history.remember(change, freshNodes());
    setHistory(next);
    toast(next.said, { action: { label: 'Undo', run: () => undoLast(next) } });
  };

  const moveTo = (node: StoryNode, to: Place) => {
    const from = placeOf(nodes, node.id);
    if (from === null) return;
    const go = () => {
      if (attempt(() => lib.manuscript.move(plot.novelId, node.id, to.parentId, to.beforeId), 'It could not be moved')) {
        remember({ kind: 'move', nodeId: node.id, title: node.title.length === 0 ? 'Untitled' : node.title, from, to });
      }
    };
    const bulk = bulkDialog(nodes, node, to);
    if (bulk) setAsk({ ...bulk, run: go });
    else go();
  };

  // Long press a card's title and drag it (boardDrag.tsx); its buttons still move it too.
  const drag = useBoardDrag({ nodes, movable: view.movable, moveTo });

  const setStatus = (node: StoryNode, status: NodeStatus) => {
    if (node.status === status) return;
    if (attempt(() => lib.manuscript.setStatus(plot.novelId, node.id, status), 'The status could not be changed')) {
      remember({ kind: 'status', nodeId: node.id, title: node.title.length === 0 ? 'Untitled' : node.title, from: node.status, to: status });
    }
  };

  const undoLast = (from: BoardHistory = history) => {
    const taken = from.takeLast(freshNodes());
    if (!taken) return;
    if (taken.problem !== null) {
      setHistory(taken.history);
      toast(cannotUndo(taken.problem), { error: true });
      return;
    }
    const c = taken.change;
    const ok =
      c.kind === 'move'
        ? attempt(() => lib.manuscript.move(plot.novelId, c.nodeId, c.from.parentId, c.from.beforeId), 'It could not be undone')
        : attempt(() => lib.manuscript.setStatus(plot.novelId, c.nodeId, c.from), 'It could not be undone');
    if (ok) {
      const after = taken.history.undone(taken.words);
      setHistory(after);
      toast(after.said);
    }
  };

  // ------------------------------------------------------------------------------------------------------ menus

  const openInWrite = (nodeId: string) => {
    lib.saves.saveNow(`setting:${lastNodeSetting(plot.novelId)}`, () => lib.settings.write(lastNodeSetting(plot.novelId), nodeId));
    router.navigate('/write');
  };
  const openPlan = (nodeId: string) => router.navigate(`/plan/chapter/${nodeId}` as never);

  const statusMenu = (node: StoryNode) =>
    setMenu({
      title: `Status of ${node.title.length === 0 ? 'Untitled' : node.title}`,
      actions: nodeStatuses.map((s) => ({
        label: s.label,
        icon: s.key === node.status ? 'radiobox-marked' : 'radiobox-blank',
        onPress: () => setStatus(node, s.key as NodeStatus),
      })),
    });

  const threadMenu = (node: StoryNode) => {
    const chips = threadChips(view, model, node);
    if (!chips?.add) return;
    const add = chips.add;
    setMenu({
      title: add.tip,
      actions: add.threads.map((t) => ({ label: t.label, icon: 'vector-polyline', onPress: () => plot.now(addToThread(t.value, node.id)) })),
    });
  };

  // ------------------------------------------------------------------------------------------------------ drawing

  const filterBar = (
    <View style={styles.filters}>
      <View style={styles.search}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput
          value={filters.text}
          onChangeText={(v) => setFilters({ ...filters, text: v })}
          placeholder={boardWords.searchHint}
          placeholderTextColor={colors.muted}
          selectionColor={colors.gold}
          style={styles.searchInput}
          accessibilityLabel={boardWords.search}
        />
        {filters.text.length > 0 && <IconButton icon="close" label={boardWords.clear} onPress={() => setFilters({ ...filters, text: '' })} color={colors.muted} />}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label={boardWords.columns} icon="view-column-outline" selected={!lanes} onPress={() => setLanes(false)} />
        <Chip label={boardWords.lanes} icon="view-sequential-outline" selected={lanes} onPress={() => setLanes(true)} />
        <Chip
          label={view.statusChoices.find((c) => c.value === filters.status)?.label ?? boardWords.status}
          icon="flag-outline"
          selected={filters.status !== null}
          onPress={() =>
            setMenu({
              title: boardWords.status,
              actions: view.statusChoices.map((c) => ({
                label: c.label,
                icon: c.value === filters.status ? 'radiobox-marked' : 'radiobox-blank',
                onPress: () => setFilters({ ...filters, status: c.value }),
              })),
            })
          }
        />
        {view.threadChoices && (
          <Chip
            label={view.threadChoices.find((c) => c.value === (filters.threadId ?? ''))?.label ?? boardWords.thread}
            icon="vector-polyline"
            selected={filters.threadId !== null}
            onPress={() =>
              setMenu({
                title: boardWords.thread,
                actions: view.threadChoices!.map((c) => ({
                  label: c.label,
                  icon: c.value === (filters.threadId ?? '') ? 'radiobox-marked' : 'radiobox-blank',
                  onPress: () => setFilters({ ...filters, threadId: c.value === '' ? null : c.value }),
                })),
              })
            }
          />
        )}
        {view.filtered && <Chip label={boardWords.clear} icon="filter-remove-outline" selected={false} onPress={() => setFilters(noBoardFilters)} />}
      </ScrollView>
    </View>
  );

  return (
    <DragScope state={drag.state}>
    <View ref={drag.boardRef} collapsable={false} style={styles.gap}>
      <Muted>{view.subtitle}</Muted>
      {filterBar}
      {view.thread && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{view.thread.banner}</Text>
          <OutlineButton label={view.thread.edit} icon="pencil-outline" compact onPress={() => router.navigate(threadPath(view.thread!.id) as never)} style={styles.start} />
        </View>
      )}
      {view.filteredNote && <Muted>{view.filteredNote}</Muted>}
      {history.undoLabel && <OutlineButton label={history.undoLabel} icon="undo" compact tone="muted" onPress={() => undoLast()} style={styles.start} />}

      {view.empty ? (
        <View style={styles.empty}>
          <Icon name="view-column-outline" size={40} />
          <Text style={styles.emptyTitle}>{view.empty.title}</Text>
          <Muted style={styles.center}>{view.empty.message}</Muted>
          <GoldButton
            label={view.empty.action}
            onPress={() =>
              view.shown.length === 0 && view.filtered
                ? setFilters(noBoardFilters)
                : attempt(() => lib.manuscript.create(plot.novelId, 'chapter'), 'The chapter could not be made')
            }
          />
        </View>
      ) : (
        view.shown.map((part) => {
          const head = partHead(part, view.filtered);
          return (
            <View key={part.key} style={styles.part}>
              {view.showTitles && (
                <View style={styles.partHead}>
                  {head.kind && <Text style={styles.partKind}>{head.kind}</Text>}
                  <Text style={styles.partLabel}>{head.label}</Text>
                </View>
              )}
              {head.empty ? (
                <Muted>{head.empty}</Muted>
              ) : lanes ? (
                <>
                  {part.columns.map((col) => (
                    <ChapterColumn key={col.chapter.id} {...{ plot, view, model, col, lanes, setMenu, moveTo, statusMenu, threadMenu, openPlan, openInWrite }} part={null} />
                  ))}
                  <DropZone id={part.key} kind="chapter" place={partEnd(part).place} part={null} label={partEnd(part).label} />
                </>
              ) : (
                <ColumnRow part={part}>
                  {part.columns.map((col) => (
                    <ChapterColumn key={col.chapter.id} {...{ plot, view, model, col, lanes, setMenu, moveTo, statusMenu, threadMenu, openPlan, openInWrite }} part={part.key} />
                  ))}
                  <DropZone id={part.key} kind="chapter" place={partEnd(part).place} part={part.key} label={partEnd(part).label} style={styles.endColumn} />
                </ColumnRow>
              )}
            </View>
          );
        })
      )}

      {menu && <ActionSheet visible title={menu.title} actions={menu.actions} onClose={() => setMenu(null)} />}
      {ask && (
        <Sheet
          visible
          onClose={() => setAsk(null)}
          title={ask.title}
          footer={
            <View style={styles.row}>
              <OutlineButton label={ask.cancel} compact tone="muted" onPress={() => setAsk(null)} />
              <GoldButton
                label={ask.confirm}
                compact
                onPress={() => {
                  const run = ask.run;
                  setAsk(null);
                  run();
                }}
              />
            </View>
          }
        >
          <Muted>{ask.message}</Muted>
        </Sheet>
      )}
      {drag.feedback}
    </View>
    </DragScope>
  );
}

// ------------------------------------------------------------------------------------------------- a chapter's column

type ColumnProps = {
  plot: OpenPlot;
  view: BoardView;
  model: StoryModel;
  col: BoardColumn;
  lanes: boolean;
  setMenu: (m: Menu) => void;
  moveTo: (node: StoryNode, to: Place) => void;
  statusMenu: (node: StoryNode) => void;
  threadMenu: (node: StoryNode) => void;
  openPlan: (id: string) => void;
  openInWrite: (id: string) => void;
  /** The part's row of columns this column scrolls in (columns), or null (lanes). */
  part: string | null;
};

/** One part's chapters side by side, scrolling sideways; held still while a card is dragged, which scrolls it itself. */
function ColumnRow({ part, children }: { part: BoardPart; children: ReactNode }) {
  const row = useRowScroll(part.key);
  const dragging = useDragging();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.columns} scrollEnabled={!dragging} {...(row ?? {})}>
      {children}
    </ScrollView>
  );
}

function ChapterColumn({ plot, view, model, col, lanes, setMenu, moveTo, statusMenu, threadMenu, openPlan, openInWrite, part }: ColumnProps) {
  const lib = useLibrary();
  const toast = useToast();
  const chapter = col.chapter;
  const card = chapterCard(view, col);
  const nudge = (node: StoryNode, by: number) => {
    const to = nudgePlace(view.all, node, by);
    if (to) moveTo(node, to);
  };
  const moves = view.movable;
  return (
    <DropTarget id={chapter.id} kind="chapter" place={{ parentId: chapter.parentId, beforeId: chapter.id }} part={part} lanes={lanes} style={[styles.column, lanes && styles.lane]}>
      <View style={styles.chapterHead}>
        <DragHandle node={chapter} label={cardControls(chapter).planTip} onTap={() => openPlan(chapter.id)}>
          <Text style={styles.chapterName} numberOfLines={2}>
            {card.name}
          </Text>
          <Muted>{card.meta}</Muted>
        </DragHandle>
        <StatusPill node={chapter} onPress={() => statusMenu(chapter)} />
      </View>
      {chapter.summary.length > 0 && (
        <Text style={styles.summary} numberOfLines={3}>
          {chapter.summary}
        </Text>
      )}
      <ThreadRow view={view} model={model} node={chapter} plot={plot} onAdd={() => threadMenu(chapter)} />
      <View style={styles.tools}>
        <IconButton icon="pencil-outline" label={cardControls(chapter).open} onPress={() => openInWrite(chapter.id)} size={20} />
        {moves && card.earlier.enabled && <IconButton icon={lanes ? 'arrow-up' : 'arrow-left'} label={card.earlier.tip} onPress={() => nudge(chapter, -1)} size={20} />}
        {moves && card.later.enabled && <IconButton icon={lanes ? 'arrow-down' : 'arrow-right'} label={card.later.tip} onPress={() => nudge(chapter, 1)} size={20} />}
        {moves && card.into && (
          <IconButton
            icon="folder-move-outline"
            label={card.into.tip}
            size={20}
            onPress={() =>
              setMenu({
                title: card.into!.tip,
                actions: card.into!.homes.map((h) => ({ label: h.label, icon: 'folder-outline', onPress: () => moveTo(chapter, { parentId: h.value, beforeId: null }) })),
              })
            }
          />
        )}
      </View>
      <View style={styles.scenes}>
        {col.scenes.length === 0 ? (
          <Muted>{view.filtered ? boardWords.noMatchingScenes : boardWords.noScenes}</Muted>
        ) : (
          col.scenes.map((sc) => {
            const s = sceneCard(view, sc.node, sc.words);
            return (
              <DropTarget key={sc.node.id} id={sc.node.id} kind="scene" place={{ parentId: sc.node.parentId, beforeId: sc.node.id }} part={part} lanes={lanes} style={styles.card}>
                <View style={styles.cardHead}>
                  <DragHandle node={sc.node} label={cardControls(sc.node).planTip} onTap={() => openPlan(sc.node.id)}>
                    <Text style={styles.cardName} numberOfLines={2}>
                      {s.name}
                    </Text>
                    <Muted>{s.meta}</Muted>
                  </DragHandle>
                  <StatusPill node={sc.node} onPress={() => statusMenu(sc.node)} />
                </View>
                {sc.node.summary.length > 0 && (
                  <Text style={styles.summary} numberOfLines={4}>
                    {sc.node.summary}
                  </Text>
                )}
                <ThreadRow view={view} model={model} node={sc.node} plot={plot} onAdd={() => threadMenu(sc.node)} />
                <View style={styles.tools}>
                  <IconButton icon="pencil-outline" label={cardControls(sc.node).open} onPress={() => openInWrite(sc.node.id)} size={20} />
                  {moves && s.earlier.enabled && <IconButton icon="arrow-up" label={s.earlier.tip} onPress={() => nudge(sc.node, -1)} size={20} />}
                  {moves && s.later.enabled && <IconButton icon="arrow-down" label={s.later.tip} onPress={() => nudge(sc.node, 1)} size={20} />}
                  {moves && s.toChapter && (
                    <IconButton
                      icon="file-move-outline"
                      label={s.toChapter.tip}
                      size={20}
                      onPress={() =>
                        setMenu({
                          title: s.toChapter!.tip,
                          actions: s.toChapter!.chapters.map((c) => ({
                            label: c.label,
                            icon: 'book-open-page-variant-outline',
                            onPress: () => moveTo(sc.node, { parentId: c.value, beforeId: null }),
                          })),
                        })
                      }
                    />
                  )}
                </View>
              </DropTarget>
            );
          })
        )}
        <DropZone id={chapter.id} kind="scene" place={{ parentId: chapter.id, beforeId: null }} part={part} label={`Drop here to move it to the end of “${card.name}”`} />
      </View>
      {!view.filtered && (
        <OutlineButton
          label={boardWords.scene}
          icon="plus"
          compact
          tone="muted"
          accessibilityLabel={card.addScene}
          onPress={() => {
            try {
              lib.manuscript.create(plot.novelId, 'scene', chapter.id);
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e), { error: true });
            }
          }}
          style={styles.start}
        />
      )}
    </DropTarget>
  );
}

function StatusPill({ node, onPress }: { node: StoryNode; onPress: () => void }) {
  const tone = statusTone[node.status] ?? colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Status: ${statusLabel(node.status)}. Change`}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, { borderColor: tone }, pressed && { backgroundColor: colors.elevated }]}
    >
      <Text style={[styles.pillText, { color: tone }]} numberOfLines={1}>
        {statusLabel(node.status)}
      </Text>
    </Pressable>
  );
}

function ThreadRow({ view, model, node, plot, onAdd }: { view: BoardView; model: StoryModel; node: StoryNode; plot: OpenPlot; onAdd: () => void }) {
  const router = useRouter();
  const chips = threadChips(view, model, node);
  if (!chips) return null;
  return (
    <View style={styles.threadRow}>
      {chips.chips.map((c) => (
        <View key={c.threadId} style={styles.threadChip}>
          <Pressable accessibilityRole="button" accessibilityLabel={c.tip} onPress={() => router.navigate(threadPath(c.threadId) as never)} style={styles.flexShrink}>
            <Text style={styles.threadText} numberOfLines={1}>
              {c.label}
            </Text>
          </Pressable>
          {c.remove && (
            <Pressable accessibilityRole="button" accessibilityLabel={c.remove.tip} onPress={() => plot.now(c.remove!.change)} hitSlop={8}>
              <Icon name="close" size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ))}
      {chips.add && (
        <Pressable accessibilityRole="button" accessibilityLabel={chips.add.tip} onPress={onAdd} style={styles.addThread}>
          <Icon name="plus" size={14} color={colors.gold} />
          <Text style={styles.addThreadText}>{chips.add.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gap: { gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  center: { textAlign: 'center' },
  filters: { gap: space.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 48, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  chips: { gap: space.sm, paddingRight: space.md },
  banner: { gap: space.sm, padding: space.md, borderRadius: 10, borderWidth: 1, borderColor: colors.gold, backgroundColor: 'rgba(243, 182, 58, 0.08)' },
  bannerText: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 20, color: colors.text },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  part: { gap: space.sm },
  partHead: { gap: 2, marginTop: space.sm },
  partKind: { fontFamily: fonts.ui, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, color: colors.gold },
  partLabel: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  columns: { gap: 12, paddingRight: space.md, alignItems: 'flex-start' },
  endColumn: { width: 200, marginTop: 0 },
  column: { width: 260, gap: space.sm, padding: space.sm, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  lane: { width: '100%' },
  chapterHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  chapterName: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  summary: { fontFamily: fonts.book, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  scenes: { gap: space.sm },
  card: { gap: 6, padding: space.sm, borderRadius: 10, backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  cardName: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, maxWidth: 110 },
  pillText: { fontFamily: fonts.ui, fontSize: 11.5, fontWeight: '600' },
  threadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  threadChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(56, 189, 248, 0.1)', borderWidth: 1, borderColor: 'rgba(56, 189, 248, 0.35)' },
  threadText: { fontFamily: fonts.ui, fontSize: 12, color: colors.text },
  addThread: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold },
  addThreadText: { fontFamily: fonts.ui, fontSize: 12, color: colors.gold },
});
