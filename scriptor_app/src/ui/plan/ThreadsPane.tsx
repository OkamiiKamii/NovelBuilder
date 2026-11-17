// PLAN › PLOT THREADS (FEATURES.md #250–#253): every storyline the reader expects followed up, each drawn as a strand on
// the loom across the chapters (a knot where it develops, the chapter it should resolve in, a frayed end when it goes
// quiet); search, filters and grouping; Worth a look; and, with no threads yet, the questions your story asks. A port of
// flutter_app/lib/features/plot/threads_page.dart and widgets/{loom,story_questions}.dart; the logic is
// src/domain/plot/screens/{threads,loom}.ts.

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { StoryModel } from '../../domain/model/storyModel';
import { threadPath } from '../../domain/plot/plotService';
import {
  type LoomColor,
  type LoomShape,
  legendDrawing,
  loomLegend,
  type StrandCard,
  strandCard,
  strandDrawing,
} from '../../domain/plot/screens/loom';
import {
  anyAsked,
  askedMessage,
  askTheQuestions,
  groupingKey,
  groupingOf,
  noThreadFilters,
  quietChooser,
  quietKey,
  quietOf,
  storyQuestions,
  storyQuestionsWords,
  type ThreadFilters,
  type ThreadGrouping,
  threadGroupings,
  threadsView,
  threadsWords,
} from '../../domain/plot/screens/threads';
import { withAlpha } from '../../domain/characters/views/common';
import { Chip, GoldButton, Icon, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { useLibrary, useLibraryRevision } from '../LibraryContext';
import { ChooserField } from '../organize/parts';
import { colors, fonts, radius, sizeClassOf, space } from '../theme';
import { useToast } from '../toast';
import { usePlot } from './usePlot';

export function ThreadsPane() {
  const plot = usePlot();
  const lib = useLibrary();
  useLibraryRevision();
  const router = useRouter();
  const toast = useToast();
  const phone = sizeClassOf(useWindowDimensions().width) === 'compact';
  const [filters, setFilters] = useState<ThreadFilters>(noThreadFilters);
  const [showFilters, setShowFilters] = useState(false);
  const model = useMemo(() => (plot ? StoryModel.fromSnapshot(plot.snapshot) : null), [plot]);
  if (!plot || !model) return null;

  const grouping: ThreadGrouping = groupingOf(lib.settings.read(groupingKey));
  const quietAfter = quietOf(lib.settings.read(quietKey(plot.novelId)));
  const title = String(plot.snapshot.project['title'] ?? '') || 'Untitled novel';
  const view = threadsView(model, title, filters, grouping, quietAfter);
  const quiet = quietChooser(quietAfter);
  const filtersShown = !phone || showFilters;

  const store = (key: string, value: unknown) =>
    lib.saves.saveNow(`setting:${key}`, () => {
      lib.settings.write(key, value);
      lib.novels.touchSettings();
    });
  const open = (id: string) => router.navigate(threadPath(id) as never);
  const newThread = () => {
    const id = plot.now((c) => c.createThread());
    if (id) open(id);
  };
  const set = (patch: Partial<ThreadFilters>) => setFilters({ ...filters, ...patch });

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            {threadsWords.title}
          </Text>
          <Muted>{view.subtitle}</Muted>
        </View>
        <GoldButton label={threadsWords.newThread} icon="plus" compact onPress={newThread} />
      </View>

      {view.flagged.length > 0 && (
        <Panel style={styles.gap}>
          <Text style={styles.boxTitle}>{view.flaggedTitle.toUpperCase()}</Text>
          <Muted>{view.flaggedCaption}</Muted>
          {view.flagged.map((f, i) => (
            <View key={`${f.threadId}-${i}`} style={styles.flagRow}>
              <Pressable accessibilityRole="link" onPress={() => open(f.threadId)} hitSlop={4}>
                <Text style={styles.link}>{f.title.length === 0 ? 'Untitled thread' : f.title}</Text>
              </Pressable>
              <Text style={styles.small}>{f.message}</Text>
            </View>
          ))}
        </Panel>
      )}

      {!view.empty && (
        <>
          <View style={styles.search}>
            <Icon name="magnify" size={20} color={colors.muted} />
            <TextInput
              value={filters.query}
              onChangeText={(v) => set({ query: v })}
              placeholder={threadsWords.search}
              placeholderTextColor={colors.muted}
              selectionColor={colors.gold}
              style={styles.searchInput}
              accessibilityLabel={threadsWords.search}
            />
            {filters.query.length > 0 && <IconButton icon="close" label="Clear search" onPress={() => set({ query: '' })} color={colors.muted} />}
          </View>
          {phone && (
            <OutlineButton
              label={showFilters ? threadsWords.hideFilters : threadsWords.filters}
              icon={showFilters ? 'chevron-up' : 'tune-variant'}
              compact
              tone="muted"
              onPress={() => setShowFilters(!showFilters)}
              style={styles.start}
            />
          )}
          {filtersShown && (
            <View style={styles.gap}>
              <View style={styles.row}>
                {(Object.keys(threadGroupings) as ThreadGrouping[]).map((g) => (
                  <Chip key={g} label={threadGroupings[g]} selected={grouping === g} onPress={() => store(groupingKey, g)} />
                ))}
              </View>
              <View style={phone ? styles.gap : styles.fieldsRow}>
                <View style={phone ? undefined : styles.field}>
                  <ChooserField label={threadsWords.status} value={filters.status ?? ''} choices={view.statusChoices} onChoose={(v) => set({ status: v.length === 0 ? null : v })} />
                </View>
                <View style={phone ? undefined : styles.field}>
                  <ChooserField
                    label={threadsWords.category}
                    value={filters.category ?? ''}
                    choices={view.categoryChoices}
                    onChoose={(v) => set({ category: v.length === 0 ? null : v })}
                  />
                </View>
                <View style={phone ? undefined : styles.field}>
                  <ChooserField label={quiet.label} value={quiet.value} choices={quiet.choices} onChoose={(v) => store(quietKey(plot.novelId), v)} />
                </View>
              </View>
              <View style={styles.row}>
                <Chip label={threadsWords.onlyFlagged} icon="alert-circle-outline" selected={filters.onlyFlagged} onPress={() => set({ onlyFlagged: !filters.onlyFlagged })} />
              </View>
            </View>
          )}
          {view.showLegend && <Legend />}
        </>
      )}

      {view.empty ? (
        <StoryQuestions
          onNew={newThread}
          onAsk={(lines) => {
            const made = plot.now((c) => askTheQuestions(c, lines));
            const said = made === undefined ? null : askedMessage(made);
            if (said) toast(said);
          }}
        />
      ) : view.noResults ? (
        <Panel style={styles.empty}>
          <Text style={styles.emptyTitle}>{filters.query.trim().length > 0 ? `Nothing matches “${filters.query.trim()}”` : 'Nothing matches'}</Text>
          <OutlineButton label="Clear search and filters" compact onPress={() => setFilters(noThreadFilters)} />
        </Panel>
      ) : (
        view.groups.map((g) => (
          <View key={g.key} style={styles.gap}>
            <Text style={styles.groupHeading} accessibilityRole="header">
              {g.label}
            </Text>
            {g.items.map((r) => (
              <ThreadCard
                key={r.thread.id}
                card={strandCard(r, model, view.report.frontier, view.report.chapterCount)}
                chapterCount={view.report.chapterCount}
                frontier={view.report.frontier}
                onOpen={() => open(r.thread.id)}
              />
            ))}
          </View>
        ))
      )}
      {view.footer && <Text style={styles.small}>{view.footer}</Text>}
    </ScrollView>
  );
}

// ----------------------------------------------------------------------------------------------------------- the loom

/** A role's colour on this theme (the painter's tone, outlineVariant, onSurfaceVariant and error). */
function paint(color: LoomColor, tone: string): string {
  switch (color) {
    case 'tone':
      return tone;
    case 'track':
      return colors.border;
    case 'ink':
      return colors.muted;
    default:
      return colors.danger;
  }
}

/** The shapes of a strand or a legend mark, each colour's alpha replaced as the Flutter painter does. */
function Shapes({ shapes, tone, width, height }: { shapes: LoomShape[]; tone: string; width: number; height: number }) {
  const fillOf = (p: { color: LoomColor; alpha: number } | undefined) => (p ? withAlpha(paint(p.color, tone), p.alpha) : 'none');
  return (
    <Svg width={width} height={height}>
      {shapes.map((s, i) => {
        if (s.shape === 'line') {
          return (
            <Line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={fillOf(s.stroke)}
              strokeWidth={s.stroke.width}
              strokeLinecap={s.stroke.cap === 'round' ? 'round' : 'butt'}
            />
          );
        }
        const stroke = s.stroke
          ? { stroke: fillOf(s.stroke), strokeWidth: s.stroke.width, strokeLinecap: s.stroke.cap === 'round' ? ('round' as const) : ('butt' as const) }
          : {};
        if (s.shape === 'circle') return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={fillOf(s.fill)} {...stroke} />;
        return <Path key={i} d={s.d} fill={fillOf(s.fill)} {...stroke} />;
      })}
    </Svg>
  );
}

function Legend() {
  return (
    <View style={styles.legend}>
      {loomLegend.map((m) => (
        <View key={m.mark} style={styles.legendItem}>
          {/* The legend's marks are drawn in the ink colour, as the Flutter legend draws them. */}
          <Shapes shapes={legendDrawing(m.mark)} tone={colors.muted} width={18} height={14} />
          <Text style={styles.legendText}>{m.text}</Text>
        </View>
      ))}
    </View>
  );
}

function ThreadCard({ card, chapterCount, frontier, onOpen }: { card: StrandCard; chapterCount: number; frontier: number; onOpen: () => void }) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.title}, ${card.kind}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.elevated }]}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={styles.cardKind}>{card.kind}</Text>
      </View>
      {card.premise && <Text style={styles.premise}>{card.premise}</Text>}
      {card.noChapters ? (
        <Muted style={styles.notRecorded}>{card.noChapters}</Muted>
      ) : (
        <View style={styles.strand} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={card.semanticsLabel ?? undefined}>
          {width > 0 && <Shapes shapes={strandDrawing(card.plan, chapterCount, frontier, width)} tone={card.tone} width={width} height={30} />}
        </View>
      )}
      {card.span && <Text style={styles.small}>{card.span}</Text>}
      {card.follows && <Text style={[styles.small, styles.follows]}>{card.follows}</Text>}
      <View style={styles.devs}>
        {card.noDevelopments ? (
          <Muted style={styles.notRecorded}>{card.noDevelopments}</Muted>
        ) : (
          card.developments.map((d, i) => (
            <Text key={i} style={[styles.small, styles.dev, d.struck && styles.struck]}>
              {d.text}
            </Text>
          ))
        )}
      </View>
      {card.issues.map((m, i) => (
        <View key={i} style={styles.issue}>
          <Icon name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={[styles.small, styles.issueText]}>{m}</Text>
        </View>
      ))}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------- the questions your story asks

function StoryQuestions({ onNew, onAsk }: { onNew: () => void; onAsk: (lines: [(typeof storyQuestions)[number], string][]) => void }) {
  const [texts, setTexts] = useState<string[]>(() => storyQuestions.map(() => ''));
  return (
    <Panel style={styles.questions}>
      <Text style={styles.questionsTitle}>{storyQuestionsWords.title}</Text>
      <Text style={styles.questionsIntro}>{storyQuestionsWords.intro}</Text>
      <View style={styles.rule} />
      {storyQuestions.map((q, i) => (
        <View key={q.asks} style={styles.question}>
          <Text style={styles.asks}>{q.asks.toUpperCase()}</Text>
          <TextInput
            value={texts[i]}
            onChangeText={(v) => setTexts(texts.map((t, j) => (j === i ? v : t)))}
            placeholder={q.hint}
            placeholderTextColor={colors.muted}
            selectionColor={colors.gold}
            autoCapitalize="sentences"
            style={styles.questionInput}
            accessibilityLabel={q.asks}
          />
        </View>
      ))}
      <GoldButton
        label={storyQuestionsWords.ask}
        icon="timeline-outline"
        disabled={!anyAsked(texts)}
        onPress={() => {
          onAsk(storyQuestions.map((q, i) => [q, texts[i]]));
          setTexts(storyQuestions.map(() => ''));
        }}
      />
      <OutlineButton label={storyQuestionsWords.newThread} compact tone="muted" onPress={onNew} style={styles.center} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: space.md, gap: space.md, paddingBottom: space.xxl },
  gap: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  center: { alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  boxTitle: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, color: colors.gold },
  flagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.sm },
  link: { fontFamily: fonts.ui, fontSize: 14, color: colors.gold, textDecorationLine: 'underline', paddingVertical: 4 },
  small: { fontFamily: fonts.ui, fontSize: 13, lineHeight: 18, color: colors.muted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 48,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15 },
  fieldsRow: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  field: { width: 220 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted },
  groupHeading: { fontFamily: fonts.display, fontSize: 15, color: colors.text, marginTop: space.sm },
  card: {
    padding: space.md,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: withAlpha(colors.border, 0.6),
    backgroundColor: colors.surface,
    gap: 2,
  },
  cardHead: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, alignItems: 'center' },
  cardTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  cardKind: { fontFamily: fonts.bookItalic, fontSize: 15, color: colors.muted },
  premise: { fontFamily: fonts.book, fontSize: 16, lineHeight: 23, color: colors.text, marginTop: 2 },
  strand: { height: 30, marginTop: 10, width: '100%' },
  follows: { marginTop: 6, color: colors.text },
  devs: { marginTop: 6 },
  dev: { color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  notRecorded: { fontStyle: 'italic' },
  issue: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'flex-start' },
  issueText: { flex: 1, color: colors.danger },
  empty: { alignItems: 'center', gap: space.md },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text, textAlign: 'center' },
  questions: { gap: space.sm, padding: 22 },
  questionsTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  questionsIntro: { fontFamily: fonts.bookItalic, fontSize: 16, lineHeight: 23, color: colors.muted },
  rule: { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  question: { gap: 2, marginBottom: 6 },
  asks: { fontFamily: fonts.ui, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, color: colors.muted },
  questionInput: { minHeight: 44, color: colors.text, fontFamily: fonts.book, fontSize: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
});
