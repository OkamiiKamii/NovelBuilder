// THE LIBRARY (FEATURES.md section 4, laid out as the owner's mock-up): search and status filters, the four action
// tiles, the novels as cards or a list, collections, and on wide screens the Library Overview, Quick Actions and
// Recent Activity beside them (below them on a phone).

import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackupService, type ImportPreview } from '../../data/backupService';
import { ReviewMark } from '../../domain/collab/reviewFiles';
import { SnapshotError } from '../../domain/snapshot/novelSnapshot';
import { openReviewCopy } from '../collab/useCollab';
import { pickTextFile, shareTextFile } from '../../data/files';
import { openNovelSettingKey } from '../../data/settingsStore';
import { requestEnd } from '../write/pendingFind';
import { startWritingSprint } from '../write/Sprint';
import { allowReminders, planReminders } from '../reminders';
import { reminderLabel, reminderSetting } from '../../domain/goals/reminder';
import { lastNodeSetting } from '../write/WriteScreen';
import { recentActivity } from '../../domain/activity';
import {
  type CollectionKey,
  inCollection,
  type LibraryFilter,
  libraryFilters,
  type LibrarySort,
  librarySorts,
  matchesSearch,
  passesFilter,
  readingTime,
  sortNovels,
  wantsFirstBook,
} from '../../domain/libraryView';
import type { Novel } from '../../domain/novel';
import { ActionSheet, ConfirmDelete, PromptSheet, type SheetAction } from '../dialogs';
import { Brand } from '../frame';
import { AreaTools } from '../search/AreaTools';
import { Chip, GoldButton, Icon, type IconName, IconButton, Muted, Panel, SectionTitle } from '../kit';
import { EmptyState } from '../states';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { BackupSheet, CollectionPicker, ImportSheet, TemplatesSheet } from './LibrarySheets';
import { FirstBook } from './FirstBook';
import { PickUp, pickUpPlace } from './PickUp';
import { ShelfView } from './ShelfView';
import { formatDate, NovelCard, NovelRow } from './NovelCard';
import { NovelForm, type NovelFormResult } from './NovelForm';

const viewSetting = 'library.view';
const authorSetting = 'library.lastAuthor';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function LibraryScreen() {
  const lib = useLibrary();
  const revision = useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = sizeClassOf(width);
  const phone = size === 'compact';

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [collection, setCollection] = useState<CollectionKey | null>(null);
  const [sort, setSort] = useState<LibrarySort>('edited');
  const [view, setViewState] = useState<'grid' | 'list' | 'shelf'>(() => {
    const v = lib.settings.read(viewSetting);
    return v === 'list' || v === 'shelf' ? v : 'grid';
  });

  const [form, setForm] = useState<{ editing: Novel | null; setupFrom: string | null } | null>(null);
  // The home-screen shortcut "New novel" (scriptor:///?new=1): the form, open.
  const { new: newAsked } = useLocalSearchParams<{ new?: string }>();
  useEffect(() => {
    if (newAsked !== '1') return;
    setForm({ editing: null, setupFrom: null });
    router.setParams({ new: undefined });
  }, [newAsked]); // eslint-disable-line react-hooks/exhaustive-deps
  const [menuFor, setMenuFor] = useState<Novel | null>(null);
  const [deleting, setDeleting] = useState<Novel | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [collectFor, setCollectFor] = useState<Novel | null>(null);
  const [naming, setNaming] = useState<{ id: string | null; name: string; thenAdd?: string } | null>(null);
  const [collectionMenu, setCollectionMenu] = useState<{ id: string; name: string } | null>(null);

  const data = useMemo(() => {
    const novels = lib.library.novels();
    lib.collections.prune(new Set(novels.map((n) => n.id)));
    const stats = lib.novels.stats();
    const titles = new Map(novels.map((n) => [n.id, n.title]));
    return {
      novels,
      stats,
      custom: lib.collections.list(),
      activity: recentActivity(lib.novels.recentRows(80), 6).map((a) => ({ ...a, title: titles.get(a.projectId) ?? '' })),
      restorePoints: lib.restorePoints.list(),
      pickUp: pickUpPlace(lib, novels),
    };
    // revision: read again after every write.
  }, [lib, revision]);

  const wordsOf = useCallback((id: string) => data.stats.get(id)?.words ?? 0, [data.stats]);
  const active = data.novels.filter((n) => !n.archived);
  const shown = sortNovels(
    data.novels.filter(
      (n) =>
        passesFilter(n, filter) && matchesSearch(n, query) && (collection === null || inCollection(n, collection, data.custom)),
    ),
    sort,
    wordsOf,
  );
  const totals = active.reduce(
    (t, n) => ({ words: t.words + wordsOf(n.id), chapters: t.chapters + (data.stats.get(n.id)?.chapters ?? 0) }),
    { words: 0, chapters: 0 },
  );

  const setView = (v: 'grid' | 'list' | 'shelf') => {
    setViewState(v);
    lib.saves.saveNow(`setting:${viewSetting}`, () => lib.settings.write(viewSetting, v));
  };

  // ---- actions

  const attempt = (what: () => void, failure: string) => {
    try {
      what();
      return true;
    } catch (e) {
      toast(`${failure} (${message(e)}). Nothing was changed.`, { error: true });
      return false;
    }
  };

  /** Opens the novel in Write: at `chapterId` when given, otherwise where the writer left it. */
  const openNovel = (novel: Novel, chapterId?: string | null) => {
    attempt(() => {
      lib.settings.write(openNovelSettingKey, novel.id);
      if (chapterId) lib.settings.write(lastNodeSetting(novel.id), chapterId);
      lib.library.markOpened(novel.id);
    }, 'It could not be opened');
    router.navigate('/write');
  };

  const startWriting = (novel: Novel) => {
    attempt(() => {
      const { previousStatus, chapterId } = lib.library.startWriting(novel.id);
      toast(`“${novel.title}” is now Drafting`, {
        action: { label: 'Undo', run: () => attempt(() => lib.library.setStatus(novel.id, previousStatus), 'Undo failed') },
      });
      openNovel(novel, chapterId);
    }, 'It could not be started');
  };

  const submitForm = ({ details, setupFrom, begin }: NovelFormResult) => {
    const editing = form?.editing ?? null;
    if (editing) {
      if (attempt(() => lib.library.updateDetails(editing.id, details), 'The details could not be saved')) {
        setForm(null);
        toast('Details saved');
      }
      return;
    }
    attempt(() => {
      const { novel, chapterId } = lib.library.create(details, { setupFrom: setupFrom ?? undefined, firstChapter: begin });
      lib.settings.write(authorSetting, novel.author);
      setForm(null);
      if (begin) openNovel(novel, chapterId);
      else toast(`Made “${novel.title}”`);
    }, 'The novel could not be made');
  };

  const saveBackup = async (novel: Novel) => {
    try {
      await shareTextFile(BackupService.fileNameFor(novel.title), lib.backups.exportBackup(novel.id));
    } catch (e) {
      toast(`The backup could not be saved (${message(e)}).`, { error: true });
    }
  };

  const importFile = async () => {
    try {
      const file = await pickTextFile();
      if (!file) return;
      setBackupsOpen(false);
      setPreview(lib.backups.previewImport(file.text));
    } catch (e) {
      toast(`${message(e)} Your library is unchanged.`, { error: true });
    }
  };

  const archive = (novel: Novel, archived: boolean) => {
    if (!attempt(() => lib.library.setArchived(novel.id, archived), 'It could not be changed')) return;
    toast(archived ? `Archived “${novel.title}”` : `Restored “${novel.title}”`, {
      action: { label: 'Undo', run: () => attempt(() => lib.library.setArchived(novel.id, !archived), 'Undo failed') },
    });
  };

  const remove = (novel: Novel) => {
    setDeleting(null);
    attempt(() => {
      const point = lib.library.delete(novel.id);
      if (lib.settings.read(openNovelSettingKey) === novel.id) lib.settings.write(openNovelSettingKey, null);
      toast(`Deleted “${novel.title}”`, {
        action: { label: 'Undo', run: () => attempt(() => lib.library.undoDelete(point), 'Undo failed') },
      });
    }, 'It could not be deleted');
  };

  const menuActions = (n: Novel): SheetAction[] => [
    {
      label: 'Start writing it',
      icon: 'feather',
      onPress: () => startWriting(n),
      hidden: n.isReviewCopy || !(n.status === 'planning' || n.status === 'on-hold'),
    },
    { label: n.status === 'complete' ? 'View' : 'Continue', icon: 'play-circle-outline', onPress: () => openNovel(n) },
    { label: 'Edit details', icon: 'pencil-outline', onPress: () => setForm({ editing: n, setupFrom: null }), hidden: n.isReviewCopy },
    {
      label: n.pinned ? 'Remove from Favorites' : 'Add to Favorites',
      icon: n.pinned ? 'star-off-outline' : 'star-outline',
      onPress: () => attempt(() => lib.library.setPinned(n.id, !n.pinned), 'It could not be changed'),
      hidden: n.archived,
    },
    { label: 'Add to collection', icon: 'folder-plus-outline', onPress: () => setCollectFor(n) },
    {
      label: 'Duplicate',
      icon: 'content-copy',
      onPress: () =>
        attempt(() => toast(`Made “${lib.library.duplicate(n.id).title}”`), 'It could not be duplicated'),
      hidden: n.isReviewCopy,
    },
    { label: n.archived ? 'Restore from archive' : 'Archive', icon: 'archive-outline', onPress: () => archive(n, !n.archived) },
    { label: 'Save a backup', icon: 'content-save-outline', onPress: () => saveBackup(n) },
    { label: 'Delete…', icon: 'delete-outline', tone: 'danger', onPress: () => setDeleting(n) },
  ];

  type Tile = { key: CollectionKey; label: string; icon: IconName; color: string };
  const tiles: Tile[] = [
    { key: { kind: 'favorites' }, label: 'Favorites', icon: 'star', color: colors.gold },
    { key: { kind: 'drafts' }, label: 'My Drafts', icon: 'bookmark-outline', color: colors.gold },
    { key: { kind: 'completed' }, label: 'Completed', icon: 'check-circle', color: colors.success },
    { key: { kind: 'on-hold' }, label: 'On Hold', icon: 'pause', color: colors.gold },
    ...data.custom.map((c): Tile => ({ key: { kind: 'custom', id: c.id }, label: c.name, icon: 'folder', color: colors.gold })),
  ];
  const collectionTiles = tiles.map((t) => ({
    ...t,
    count: data.novels.filter((n) => inCollection(n, t.key, data.custom)).length,
  }));

  const sameKey = (a: CollectionKey | null, b: CollectionKey) =>
    a !== null && a.kind === b.kind && (a.kind !== 'custom' || (b.kind === 'custom' && a.id === b.id));

  // ---- layout

  const mainWidth = width - (phone ? 0 : size === 'medium' ? 96 : 236) - (size === 'expanded' ? 320 : 0);
  const gutter = phone ? space.md : space.lg;
  // As many columns as hold a card of at least 170 (its title, progress and Continue need that), two to four.
  const columns = Math.max(2, Math.min(4, Math.floor((mainWidth - gutter * 2 + space.md) / (170 + space.md))));
  // The four action tiles stand in one row when each can be 190 wide, else two by two.
  const twoByTwo = mainWidth - gutter * 2 < 4 * 190 + 3 * space.md;
  const cardWidth = Math.floor((mainWidth - gutter * 2 - space.md * (columns - 1)) / columns);

  const header = (
    <View style={{ paddingTop: insets.top + (phone ? space.md : space.lg) }}>
      {phone && (
        <View style={[styles.phoneTop, styles.phoneTopRow]}>
          <View style={styles.flex}>
            <Brand />
          </View>
          <AreaTools />
        </View>
      )}
      <View style={[styles.searchRow, phone && styles.searchRowPhone]}>
        <View style={styles.search}>
          <Icon name="magnify" size={22} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your novels…"
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            accessibilityLabel="Search your novels"
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && <IconButton icon="close" label="Clear search" onPress={() => setQuery('')} size={18} color={colors.muted} />}
        </View>
        <IconButton icon="sort" label={`Sort: ${librarySorts.find((s) => s.key === sort)?.label}`} onPress={() => setSortOpen(true)} bordered color={colors.gold} />
        <View style={styles.viewToggle}>
          <IconButton icon="view-grid" label="Show as cards" onPress={() => setView('grid')} color={view === 'grid' ? colors.gold : colors.muted} />
          <IconButton icon="format-list-bulleted" label="Show as a list" onPress={() => setView('list')} color={view === 'list' ? colors.gold : colors.muted} />
          <IconButton icon="bookshelf" label="Show on a shelf" onPress={() => setView('shelf')} color={view === 'shelf' ? colors.gold : colors.muted} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {libraryFilters.map((f) => (
          <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text style={styles.myNovels} accessibilityRole="header">
            MY NOVELS
          </Text>
          <Muted>Manage and continue your stories</Muted>
        </View>
        {!phone && (
          <Text style={styles.totals}>
            {active.length} {active.length === 1 ? 'Novel' : 'Novels'} · {totals.chapters.toLocaleString('en-US')} Chapters ·{' '}
            {totals.words.toLocaleString('en-US')} Words
          </Text>
        )}
      </View>

      {query === '' && wantsFirstBook(data.novels) ? (
        <FirstBook
          wide={!phone}
          onBegin={(title) =>
            attempt(() => {
              const author = lib.settings.read(authorSetting);
              const { novel, chapterId } = lib.library.create(
                { title, author: typeof author === 'string' ? author : '' },
                { firstChapter: true },
              );
              openNovel(novel, chapterId);
            }, 'The novel could not be made')
          }
        />
      ) : data.pickUp && query === '' && (
        <PickUp
          place={data.pickUp}
          wide={!phone}
          onContinue={() => {
            const { novel, chapter } = data.pickUp!;
            requestEnd(chapter.id);
            openNovel(novel, chapter.id);
          }}
          onSprint={() => {
            const { novel, chapter } = data.pickUp!;
            requestEnd(chapter.id);
            openNovel(novel, chapter.id);
            startWritingSprint(lib, 15);
          }}
          onRemind={(time) => {
            void (async () => {
              if (time !== null && !(await allowReminders())) {
                toast('Notifications are off for Scriptor. Turn them on in Android’s settings to get the nudge.', { error: true });
                return;
              }
              lib.saves.saveNow(`setting:${reminderSetting}`, () => {
                lib.settings.write(reminderSetting, time);
                lib.novels.touchSettings();
              });
              await planReminders(lib);
              toast(time ? `A nudge each day at ${reminderLabel(time)}, never on a day you have written.` : 'No more daily nudge.');
            })();
          }}
          onPledge={(words) => {
            const { novel } = data.pickUp!;
            if (attempt(() => lib.manuscript.setWordGoal(novel.id, 'daily', words), 'The goal could not be saved')) {
              toast(`Today's goal: ${words.toLocaleString('en-US')} words. The ring on Write fills as you write.`);
            }
          }}
        />
      )}

      <View style={[styles.tiles, twoByTwo && styles.tilesPhone]}>
        <ActionTile icon="file-document-edit-outline" title="New Novel" subtitle="Start a new story" strong onPress={() => setForm({ editing: null, setupFrom: null })} half={twoByTwo} />
        <ActionTile icon="download-outline" title="Import" subtitle="Import from file" onPress={importFile} half={twoByTwo} />
        <ActionTile icon="cloud-upload-outline" title="Backup" subtitle="Save or restore" onPress={() => setBackupsOpen(true)} half={twoByTwo} />
        <ActionTile icon="view-dashboard-outline" title="Templates" subtitle="Use a template" onPress={() => setTemplatesOpen(true)} half={twoByTwo} />
      </View>

      {collection && (
        <View style={styles.showing}>
          <Icon name="filter-variant" size={18} color={colors.sky} />
          <Text style={styles.showingText}>Showing: {collectionTiles.find((t) => sameKey(collection, t.key))?.label}</Text>
          <IconButton icon="close" label="Show every novel" onPress={() => setCollection(null)} size={18} color={colors.sky} />
        </View>
      )}
    </View>
  );

  const novelsBlock =
    data.novels.length === 0 ? (
      <EmptyState
        icon="book-plus-outline"
        title="Your library is empty"
        message="Start your first novel, or import a backup from Scriptor or Novel Builder."
        action={<GoldButton label="New Novel" icon="plus" onPress={() => setForm({ editing: null, setupFrom: null })} style={styles.emptyButton} />}
      />
    ) : shown.length === 0 ? (
      <EmptyState
        icon="magnify-close"
        title="No novels match"
        message="Your novels are unchanged; they are only hidden by the search or filters."
        action={
          <GoldButton
            label="Clear search and filters"
            onPress={() => {
              setQuery('');
              setFilter('all');
              setCollection(null);
            }}
            style={styles.emptyButton}
          />
        }
      />
    ) : view === 'grid' ? (
      <View style={styles.grid}>
        {shown.map((n) => (
          <NovelCard
            key={n.id}
            novel={n}
            stats={data.stats.get(n.id)}
            width={cardWidth}
            onContinue={() => openNovel(n)}
            onMenu={() => setMenuFor(n)}
            onStats={() => router.navigate('/analytics')}
          />
        ))}
      </View>
    ) : view === 'shelf' ? (
      <ShelfView novels={shown} stats={data.stats} onOpen={(n) => openNovel(n)} onMenu={(n) => setMenuFor(n)} />
    ) : (
      <View style={styles.list}>
        {shown.map((n) => (
          <NovelRow key={n.id} novel={n} stats={data.stats.get(n.id)} onContinue={() => openNovel(n)} onMenu={() => setMenuFor(n)} />
        ))}
      </View>
    );

  const collectionsBlock = (
    <Panel style={styles.block}>
      <SectionTitle icon="layers-triple-outline" title="Collections" />
      <ScrollView
        horizontal={!phone}
        scrollEnabled={!phone}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.collections, phone && styles.collectionsPhone]}
      >
        {collectionTiles.map((t) => (
          <Pressable
            key={t.key.kind === 'custom' ? t.key.id : t.key.kind}
            accessibilityRole="button"
            accessibilityState={{ selected: sameKey(collection, t.key) }}
            accessibilityLabel={`${t.label}, ${t.count} ${t.count === 1 ? 'novel' : 'novels'}`}
            onPress={() => setCollection(sameKey(collection, t.key) ? null : t.key)}
            onLongPress={() => t.key.kind === 'custom' && setCollectionMenu({ id: t.key.id, name: t.label })}
            style={[styles.collection, phone && styles.collectionPhone, sameKey(collection, t.key) && styles.collectionOn]}
          >
            <Icon name={t.icon} size={26} color={t.color} />
            <View style={styles.collectionText}>
              <Text style={styles.collectionName} numberOfLines={1}>
                {t.label}
              </Text>
              <Muted>
                ({t.count} {t.count === 1 ? 'Novel' : 'Novels'})
              </Muted>
            </View>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setNaming({ id: null, name: '' })}
          style={[styles.collection, phone && styles.collectionPhone, styles.collectionNew]}
        >
          <Icon name="folder-plus-outline" size={26} color={colors.sky} />
          <View style={styles.collectionText}>
            <Text style={styles.collectionName}>Custom Collection</Text>
            <Muted>Make your own</Muted>
          </View>
        </Pressable>
      </ScrollView>
    </Panel>
  );

  const overview = (
    <Panel style={styles.block}>
      <SectionTitle icon="chart-bar" title="Library Overview" />
      <OverviewLine icon="book-open-page-variant-outline" text={`${active.length} ${active.length === 1 ? 'Novel' : 'Novels'}`} />
      <OverviewLine icon="file-document-outline" text={`${totals.words.toLocaleString('en-US')} Words`} />
      <OverviewLine icon="feather" text={`${totals.chapters.toLocaleString('en-US')} Chapters`} />
      <OverviewLine icon="clock-outline" text={`${readingTime(totals.words)} Reading`} />
    </Panel>
  );

  const quickActions = (
    <Panel style={styles.block}>
      <SectionTitle icon="lightning-bolt" title="Quick Actions" />
      <QuickAction icon="file-document-edit-outline" label="Create Novel" onPress={() => setForm({ editing: null, setupFrom: null })} />
      <QuickAction icon="download-outline" label="Import from File" onPress={importFile} />
      <QuickAction icon="cloud-upload-outline" label="Backups" onPress={() => setBackupsOpen(true)} />
      <QuickAction icon="view-dashboard-outline" label="Manage Templates" onPress={() => setTemplatesOpen(true)} />
    </Panel>
  );

  const activityBlock = (
    <Panel style={styles.block}>
      <SectionTitle icon="history" title="Recent Activity" />
      {data.activity.length === 0 ? (
        <Muted>Nothing yet. What you write and change shows here.</Muted>
      ) : (
        data.activity.map((a, i) => (
          <View key={`${a.projectId}-${i}`} style={styles.activity}>
            <View style={styles.activityDot} />
            <View style={styles.flex}>
              <Text style={styles.activityWhat} numberOfLines={1}>
                {a.what}
              </Text>
              <Muted>{a.title || 'Untitled novel'}</Muted>
            </View>
            <Muted>{timeAgo(a.at)}</Muted>
          </View>
        ))
      )}
    </Panel>
  );

  const bottomPad = (phone ? 0 : insets.bottom) + space.xl;

  return (
    <View style={styles.page}>
      <View style={styles.columns}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[{ paddingHorizontal: gutter, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {novelsBlock}
          {collectionsBlock}
          {size !== 'expanded' && (
            <>
              {overview}
              {activityBlock}
            </>
          )}
        </ScrollView>
        {size === 'expanded' && (
          <ScrollView style={styles.side} contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: bottomPad }}>
            {overview}
            {quickActions}
            {activityBlock}
          </ScrollView>
        )}
      </View>

      <NovelForm
        visible={form !== null}
        editing={form?.editing ?? null}
        setupFrom={form?.setupFrom ?? null}
        defaultAuthor={String(lib.settings.read(authorSetting) ?? '')}
        otherNovels={active}
        onSubmit={submitForm}
        onClose={() => setForm(null)}
      />
      <ActionSheet visible={menuFor !== null} title={menuFor?.title || 'Novel'} actions={menuFor ? menuActions(menuFor) : []} onClose={() => setMenuFor(null)} />
      <ConfirmDelete
        visible={deleting !== null}
        title="Delete this novel?"
        message={`“${deleting?.title ?? ''}” and everything in it will be deleted. A restore point is kept first, so you can undo it, or bring it back later from Backups → Restore points.`}
        confirmLabel="Delete"
        onConfirm={() => deleting && remove(deleting)}
        onClose={() => setDeleting(null)}
      />
      <ImportSheet
        preview={preview}
        onClose={() => setPreview(null)}
        onAsCopy={() => {
          const p = preview;
          setPreview(null);
          if (p) attempt(() => toast(`Imported “${lib.library.importAsCopy(p).title}”`), 'It could not be imported');
        }}
        onOpenReview={() => {
          const p = preview;
          setPreview(null);
          if (!p) return;
          const mark = ReviewMark.of(p.snapshot.project);
          try {
            const id = openReviewCopy(lib, p.snapshot);
            lib.settings.write(openNovelSettingKey, id);
            router.navigate('/write');
            toast(`Opened the review copy of “${mark?.title ?? p.title}”. It is in Write.`);
          } catch (e) {
            toast(
              e instanceof SnapshotError
                ? `This review copy cannot be opened: ${e.reason}.`
                : `The review copy could not be opened, and nothing was changed (${message(e)}).`,
              { error: true },
            );
          }
        }}
        onReplace={() => {
          const p = preview;
          setPreview(null);
          if (!p) return;
          attempt(() => {
            const point = lib.backups.importBackup(p);
            toast(point ? `Replaced “${p.title}”. Your version is kept as a restore point.` : `Imported “${p.title}”`, {
              action: point ? { label: 'Undo', run: () => attempt(() => lib.backups.restore(point), 'Undo failed') } : undefined,
            });
          }, 'It could not be imported');
        }}
      />
      <BackupSheet
        visible={backupsOpen}
        novels={active}
        restorePoints={data.restorePoints}
        onSave={saveBackup}
        onImport={importFile}
        onRestore={(p) =>
          attempt(() => {
            lib.backups.restore(p.id);
            setBackupsOpen(false);
            toast(`Restored “${p.title}”. The version it replaced is kept as a restore point.`);
          }, 'It could not be restored')
        }
        onClose={() => setBackupsOpen(false)}
      />
      <TemplatesSheet
        visible={templatesOpen}
        novels={active}
        onUse={(id) => {
          setTemplatesOpen(false);
          setForm({ editing: null, setupFrom: id });
        }}
        onClose={() => setTemplatesOpen(false)}
      />
      <ActionSheet
        visible={sortOpen}
        title="Sort by"
        actions={librarySorts.map((s) => ({
          label: s.label,
          icon: s.key === sort ? 'check' : 'sort',
          onPress: () => setSort(s.key),
        }))}
        onClose={() => setSortOpen(false)}
      />
      <CollectionPicker
        novel={collectFor}
        collections={data.custom}
        onToggle={(id, member) => collectFor && attempt(() => lib.collections.setMember(id, collectFor.id, member), 'It could not be changed')}
        onNew={() => {
          const n = collectFor;
          setCollectFor(null);
          setNaming({ id: null, name: '', thenAdd: n?.id });
        }}
        onClose={() => setCollectFor(null)}
      />
      <PromptSheet
        visible={naming !== null}
        title={naming?.id ? 'Rename collection' : 'New collection'}
        label="Name"
        initial={naming?.name ?? ''}
        confirmLabel={naming?.id ? 'Rename' : 'Make it'}
        onSubmit={(name) => {
          const n = naming;
          setNaming(null);
          if (!n) return;
          attempt(() => {
            if (n.id) lib.collections.rename(n.id, name);
            else {
              const made = lib.collections.create(name);
              if (n.thenAdd) lib.collections.setMember(made.id, n.thenAdd, true);
              toast(`Made the collection “${made.name}”`);
            }
          }, 'The collection could not be saved');
        }}
        onClose={() => setNaming(null)}
      />
      <ActionSheet
        visible={collectionMenu !== null}
        title={collectionMenu?.name ?? 'Collection'}
        actions={[
          { label: 'Rename', icon: 'pencil-outline', onPress: () => collectionMenu && setNaming({ id: collectionMenu.id, name: collectionMenu.name }) },
          {
            label: 'Remove the collection',
            icon: 'folder-remove-outline',
            tone: 'danger',
            onPress: () => {
              const c = collectionMenu;
              if (!c) return;
              const before = lib.collections.list();
              attempt(() => lib.collections.remove(c.id), 'It could not be removed');
              if (collection?.kind === 'custom' && collection.id === c.id) setCollection(null);
              toast(`Removed “${c.name}”. Its novels stay in your library.`, {
                action: { label: 'Undo', run: () => attempt(() => lib.settings.write('library.collections', before), 'Undo failed') },
              });
            },
          },
        ]}
        onClose={() => setCollectionMenu(null)}
      />
    </View>
  );
}

function ActionTile({
  icon,
  title,
  subtitle,
  onPress,
  strong = false,
  half,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  strong?: boolean;
  half: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, half && styles.tilePhone, strong && styles.tileStrong, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.tileIcon, strong && styles.tileIconStrong]}>
        <Icon name={icon} size={26} color={strong ? colors.gold : colors.sky} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.tileTitle, strong && { color: colors.gold }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.tileSub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function OverviewLine({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.overviewLine}>
      <Icon name={icon} size={24} color={colors.muted} />
      <Text style={styles.overviewText}>{text}</Text>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): ReactNode {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.elevated }]}>
      <Icon name={icon} size={20} color={colors.sky} />
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function timeAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(at);
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  columns: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  side: { width: 320, flexGrow: 0, paddingRight: space.lg, paddingLeft: space.xs },
  phoneTop: { marginBottom: space.md },
  phoneTopRow: { flexDirection: 'row', alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  searchRowPhone: { gap: space.xs },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingLeft: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 16, paddingVertical: space.sm },
  viewToggle: { flexDirection: 'row', borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated },
  chips: { gap: space.sm, paddingVertical: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.sm, marginBottom: space.lg },
  myNovels: { fontFamily: fonts.display, fontSize: 30, letterSpacing: 2, color: colors.text },
  totals: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  tiles: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  tilesPhone: { flexWrap: 'wrap' },
  tile: {
    flex: 1,
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.sky,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  tilePhone: { flexBasis: '45%' },
  tileStrong: { borderColor: colors.gold, shadowColor: colors.gold },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.field,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E2230',
  },
  tileIconStrong: { backgroundColor: '#2A2210' },
  tileTitle: { fontFamily: fonts.ui, fontSize: 16, color: colors.text },
  tileSub: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  showing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingLeft: space.md,
    marginBottom: space.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.sky,
  },
  showingText: { fontFamily: fonts.ui, fontSize: 14, color: colors.sky },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  list: { gap: space.sm },
  emptyButton: { marginTop: space.md },
  block: { marginTop: space.lg },
  collections: { gap: space.md },
  collectionsPhone: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  collectionPhone: { minWidth: 0, width: '48.5%', padding: space.sm },
  collection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minWidth: 170,
    padding: space.md,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  collectionOn: { borderColor: colors.gold },
  collectionNew: { borderStyle: 'dashed', borderColor: colors.sky },
  // The words beside the icon shrink to the tile, so a long name or bold text never runs past its edge.
  collectionText: { flexShrink: 1 },
  collectionName: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  overviewLine: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  overviewText: { fontFamily: fonts.ui, fontSize: 17, color: colors.text },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 46,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  activity: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.sky },
  activityWhat: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
});
