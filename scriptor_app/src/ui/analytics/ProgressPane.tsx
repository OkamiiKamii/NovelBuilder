// WRITING PROGRESS (FEATURES.md #329–#336): the journal (the run of days, the manuscript as a page filling with ink,
// where the pace leads), the shelf of lengths, a year of writing, milestones, today / this week / this month, the
// weekly trend, where the chapters and scenes stand, word targets, deadlines, tasks and the last sessions. It
// describes; nothing here judges. A port of flutter_app/lib/features/progress/{progress_page,journal_view}.dart and
// widgets/length_shelf.dart; what it says and draws is src/domain/analytics/screens/progressPage.ts.
//
// It sits in the Analytics area's scroll view (no scroll of its own).

import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Line, Path, Rect, Stop, LinearGradient as SvgGradient, Text as SvgText } from 'react-native-svg';

import { taskCategories, taskLabels } from '../../domain/analytics/goalChanges';
import { computeJournal, type Journal, writingSessionOf } from '../../domain/desk/dayBook';
import {
  addDays,
  computeProgress,
  dayKeyOf,
  type DeadlineRow,
  Goal,
  parseDay,
  type ProgressReport,
  WritingSession,
} from '../../domain/analytics/progress';
import {
  deadlineScopes,
  deadlineText,
  deadlineWhen,
  deleteGoalDialog,
  describeDay,
  type GoalForm,
  goalFormStart,
  goalFormWords,
  goalInputOf,
  healthLine,
  journalHero,
  lengthSentence,
  manuscriptTargetLine,
  pageLines,
  periodTiles,
  progressWords,
  recentSessions,
  scopeLabel,
  sealOf,
  shelfSpines,
  statusRows,
  summaryLine,
  taskLine,
  tasksCount,
  tasksInOrder,
  tileColumns,
  trendView,
  typedTarget,
  yearDayAt,
  yearGrid,
  yearLabel,
  yearStep,
  yearTable,
} from '../../domain/analytics/screens/progressPage';
import { Novel } from '../../domain/records/novel';
import { StoryNode } from '../../domain/records/storyNode';
import { ConfirmDelete, Sheet } from '../dialogs';
import { Chip, Field, GoldButton, Icon, type IconName, IconButton, Muted, OutlineButton, Panel } from '../kit';
import { motion, useReducedMotion } from '../motion';
import { useCast } from '../organize/useCast';
import { colors, fonts, radius, space } from '../theme';
import { useGoals } from './useGoals';

/** Shades of the year: the empty ground, then toward the accent. */
const shades = ['#1C202D', '#5B5236', '#8F7837', '#C39A39', colors.gold];

function Box({ title, right, children }: { title: string; right?: string | null; children: React.ReactNode }) {
  return (
    <Panel style={styles.box}>
      <View style={styles.boxHead}>
        <Text style={styles.boxTitle} accessibilityRole="header">
          {title}
        </Text>
        {right ? <Muted>{right}</Muted> : null}
      </View>
      {children}
    </Panel>
  );
}

/** A share of a whole as a filled track (0 to 1). */
function Gauge({ value, height = 8 }: { value: number; height?: number }) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <View style={[styles.gauge, { height }]}>
      <View style={{ width: `${v * 100}%`, height, backgroundColor: colors.gold }} />
    </View>
  );
}

/** "Show as table", folded away under a chart. */
function TableFold({ columns, rows, label }: { columns: readonly string[]; rows: readonly (readonly (string | number)[])[]; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.fold}>
        <Text style={styles.foldText}>{progressWords.showTable}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {open && <NumbersTable columns={columns} rows={rows} label={label} />}
    </View>
  );
}

function NumbersTable({ columns, rows, label }: { columns: readonly string[]; rows: readonly (readonly (string | number)[])[]; label: string }) {
  const cell = (v: string | number) => (typeof v === 'number' ? v.toLocaleString('en-US') : v);
  return (
    <ScrollView horizontal accessibilityLabel={label} showsHorizontalScrollIndicator>
      <View>
        <View style={styles.tableRow}>
          {columns.map((c) => (
            <Text key={c} style={[styles.tableCell, styles.tableHead]}>
              {c}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={styles.tableRow}>
            {r.map((v, j) => (
              <Text key={j} style={styles.tableCell}>
                {cell(v)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function ProgressPane() {
  const open = useCast();
  const goalsChange = useGoals(open?.novelId ?? null);
  const { width: screen } = useWindowDimensions();
  const [now] = useState(() => Date.now());
  const data = useMemo(() => {
    if (open === null) return null;
    const s = open.cast.snapshot;
    const novel = new Novel(s.project);
    const sessions = s.rows('writingSessions').map((r) => new WritingSession(r));
    const goals = s.rows('goals').map((r) => new Goal(r));
    const nodes = s.rows('chapters').map((r) => new StoryNode(r));
    const report = computeProgress({ targetWordCount: novel.targetWordCount, nodes, sessions, goals, now });
    const journal = computeJournal({
      sessions: sessions.map((x) => writingSessionOf(x.raw)),
      totalWords: report.totalWords,
      targetWords: report.targetWords,
      chapters: report.chapters,
      now,
    });
    return { novel, sessions, goals, nodes, report, journal };
  }, [open, now]);
  const [editing, setEditing] = useState<{ kind: 'deadline' | 'task'; goal: Goal | null } | null>(null);
  const [removing, setRemoving] = useState<Goal | null>(null);
  if (open === null || data === null) return null;
  const { novel, sessions, goals, nodes, report, journal } = data;
  const width = Math.max(260, screen - space.md * 2);

  return (
    <View style={styles.gap}>
      <View>
        <Text style={styles.title} accessibilityRole="header">
          {progressWords.title}
        </Text>
        <Muted>{healthLine(report)}</Muted>
      </View>
      <JournalHeroView journal={journal} report={report} wide={width >= 720} />
      <Box title={progressWords.howLong}>
        <LengthShelf words={report.totalWords} />
      </Box>
      <Box title={progressWords.year}>
        <YearOfWriting journal={journal} width={width - 2 * space.md - 2} />
      </Box>
      <Box title={progressWords.milestones}>
        <View style={styles.seals}>
          {journal.milestones.map((m) => {
            const s = sealOf(m);
            const icon: IconName = s.icon === 'run' ? 'fire' : s.icon === 'chapters' ? 'bookmark-check' : 'fountain-pen-tip';
            return (
              <View key={`${s.icon}:${s.label}`} style={styles.seal} accessible accessibilityLabel={s.semantics}>
                <View style={[styles.sealRing, s.reached ? styles.sealReached : { borderWidth: s.next ? 2 : 1.25 }]}>
                  <Icon name={icon} size={26} color={s.reached ? colors.onGold : 'rgba(148, 163, 184, 0.6)'} />
                </View>
                <Text style={[styles.sealLabel, s.reached && styles.sealLabelReached]}>{s.label}</Text>
                {s.toGo !== null && <Text style={styles.sealToGo}>{s.toGo}</Text>}
              </View>
            );
          })}
        </View>
      </Box>
      <Tiles report={report} width={width} />
      <TrendChart report={report} width={width - 2 * space.md - 2} />
      <Muted>{summaryLine(report)}</Muted>
      <Box title={progressWords.standing}>
        {statusRows(report).map((r) => (
          <View key={r.key} style={styles.statusRow} accessible accessibilityLabel={r.semantics}>
            <Text style={styles.statusLabel}>{r.label}</Text>
            <View style={styles.flex}>
              <Gauge value={r.share} height={10} />
            </View>
            <Text style={styles.statusCount}>{r.count}</Text>
          </View>
        ))}
      </Box>
      <Box title={progressWords.targets}>
        <View style={styles.row}>
          <TargetField label={progressWords.perDay} value={report.daily?.target ?? null} onCommit={(v) => goalsChange((c) => c.setTarget('daily', v))} />
          <TargetField label={progressWords.perWeek} value={report.weekly?.target ?? null} onCommit={(v) => goalsChange((c) => c.setTarget('weekly', v))} />
        </View>
        <Muted>{manuscriptTargetLine(novel.targetWordCount, novel.deadline)}</Muted>
      </Box>
      <Box title={progressWords.deadlines}>
        {report.deadlines.length === 0 && <Muted>{progressWords.noDeadlines}</Muted>}
        {report.deadlines.map((d) => (
          <GoalRow key={d.goal.id} goal={d.goal} onDone={(v) => goalsChange((c) => c.setDone(d.goal.id, v))} onEdit={() => setEditing({ kind: 'deadline', goal: d.goal })} onRemove={() => setRemoving(d.goal)}>
            <DeadlineBody d={d} />
          </GoalRow>
        ))}
        <OutlineButton label={progressWords.addDeadline} icon="plus" compact onPress={() => setEditing({ kind: 'deadline', goal: null })} style={styles.start} />
      </Box>
      <Box title={progressWords.tasks} right={tasksCount(report)}>
        {tasksInOrder(goals).map((t) => (
          <GoalRow key={t.id} goal={t} onDone={(v) => goalsChange((c) => c.setDone(t.id, v))} onEdit={() => setEditing({ kind: 'task', goal: t })} onRemove={() => setRemoving(t)}>
            <Text style={styles.goalTitle}>{t.title}</Text>
            <Muted>{taskLine(t)}</Muted>
          </GoalRow>
        ))}
        <OutlineButton label={progressWords.addTask} icon="plus" compact onPress={() => setEditing({ kind: 'task', goal: null })} style={styles.start} />
      </Box>
      <Box title={progressWords.sessions}>
        {sessions.length === 0 ? <Text style={styles.body}>{progressWords.noSessions}</Text> : <NumbersTable label={progressWords.sessions} columns={progressWords.sessionColumns} rows={recentSessions(sessions)} />}
      </Box>

      {editing !== null && (
        <GoalSheet
          kind={editing.kind}
          goal={editing.goal}
          nodes={nodes}
          today={dayKeyOf(now)}
          onClose={() => setEditing(null)}
          onSave={(form) =>
            goalsChange((c) => {
              const input = goalInputOf(editing.kind, form);
              if (editing.goal === null) c.addGoal(editing.kind, input);
              else c.updateGoal(editing.goal.id, input);
            })
          }
        />
      )}
      {removing !== null &&
        (() => {
          const w = deleteGoalDialog(removing);
          return (
            <ConfirmDelete
              visible
              title={w.title}
              message={w.message}
              confirmLabel={w.confirm}
              onClose={() => setRemoving(null)}
              onConfirm={() => {
                const id = removing.id;
                setRemoving(null);
                goalsChange((c) => c.removeGoal(id));
              }}
            />
          );
        })()}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the journal

function JournalHeroView({ journal, report, wide }: { journal: Journal; report: ProgressReport; wide: boolean }) {
  const h = journalHero(journal, report);
  const run = (
    <View accessible accessibilityLabel={h.run.semantics}>
      <Text style={styles.big}>{h.run.number}</Text>
      <Text style={styles.heroLabel}>{h.run.label}</Text>
      <Muted>{h.run.best}</Muted>
    </View>
  );
  const manuscript = (
    <View style={styles.heroRow} accessible accessibilityLabel={h.manuscript.semantics}>
      <InkPage fill={h.manuscript.fill} />
      <View style={styles.flexShrink}>
        <Text style={[styles.big, { color: colors.text }]}>{h.manuscript.number}</Text>
        <Text style={styles.heroLabel}>{h.manuscript.caption}</Text>
      </View>
    </View>
  );
  const a = h.ahead;
  const ahead = (
    <View>
      {a.kind === 'reached' ? (
        <>
          <Icon name="check-decagram" size={32} />
          <Text style={styles.heroLabel}>{a.label}</Text>
        </>
      ) : a.kind === 'finish' ? (
        <>
          <Muted>{a.label}</Muted>
          <Text style={styles.finish}>{a.day}</Text>
          <Muted>{a.note}</Muted>
        </>
      ) : a.kind === 'pace' ? (
        <>
          <Text style={styles.heroLabel}>{a.label}</Text>
          <Muted>{a.note}</Muted>
        </>
      ) : (
        <Muted>{a.label}</Muted>
      )}
    </View>
  );
  return (
    <Panel style={[styles.hero, wide && styles.heroWide]}>
      {wide ? (
        <>
          <View style={{ flex: 3 }}>{run}</View>
          <View style={styles.vDivider} />
          <View style={{ flex: 4 }}>{manuscript}</View>
          <View style={styles.vDivider} />
          <View style={{ flex: 4 }}>{ahead}</View>
        </>
      ) : (
        <>
          {run}
          <View style={styles.hDivider} />
          {manuscript}
          <View style={styles.hDivider} />
          {ahead}
        </>
      )}
    </Panel>
  );
}

/** A sheet of manuscript filling with ink from the foot as the words reach the target; just lines without one. The ink
 * rises to its level when the page is first shown (the area's one authored moment), and stands still for less motion. */
function InkPage({ fill }: { fill: number | null }) {
  const w = 62;
  const h = 82;
  const fold = 14;
  const wave = 4;
  const sheet = `M0 0 L${w - fold} 0 L${w} ${fold} L${w} ${h} L0 ${h} Z`;
  const level = fill === null ? 0 : Math.max(0, Math.min(1, fill));
  const top = h * (1 - level);
  const reduced = useReducedMotion();
  const [rise] = useState(() => new Animated.Value(h));
  useEffect(() => {
    if (reduced) {
      rise.setValue(top);
      return;
    }
    const run = Animated.timing(rise, { toValue: top, duration: motion.focal, delay: 150, easing: motion.arrive, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [rise, top, reduced]);
  // The ink's surface: a soft meniscus, lighter where it meets the page.
  const surface = `M0 ${wave} Q${w * 0.25} 0 ${w * 0.5} ${wave} T${w} ${wave}`;
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Path d={sheet} fill={colors.elevated} />
      </Svg>
      {level > 0 && (
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
          <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: -wave, height: h + wave, transform: [{ translateY: rise }] }}>
            <Svg width={w} height={h + wave}>
              <Defs>
                <SvgGradient id="ink" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.gold} stopOpacity={0.95} />
                  <Stop offset="1" stopColor={colors.goldDeep} stopOpacity={0.9} />
                </SvgGradient>
              </Defs>
              <Path d={`${surface} L${w} ${h + wave} L0 ${h + wave} Z`} fill="url(#ink)" />
              <Path d={surface} fill="none" stroke={colors.goldLight} strokeWidth={1.25} />
            </Svg>
          </Animated.View>
        </View>
      )}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        {pageLines(h).map((y) => (
          <Line key={y} x1={9} y1={y} x2={w - 9} y2={y} stroke={colors.muted} strokeOpacity={0.35} strokeWidth={1.5} />
        ))}
        {/* The folded corner is cut from the sheet, so the rising ink never shows through it. */}
        <Path d={`M${w - fold} 0 L${w} 0 L${w} ${fold} Z`} fill={colors.surface} />
        <Path d={sheet} fill="none" stroke={colors.border} />
        <Path d={`M${w - fold} 0 L${w - fold} ${fold} L${w} ${fold}`} fill="none" stroke={colors.border} />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- the shelf

function LengthShelf({ words }: { words: number }) {
  const spines = shelfSpines(words);
  const sentence = lengthSentence(words);
  return (
    <View accessible accessibilityLabel={sentence}>
      <View style={styles.shelf}>
        {spines.map((s) => (
          <View key={s.name} style={styles.spineSlot}>
            <View
              style={[
                styles.spine,
                { height: s.height, borderColor: s.fill > 0 || s.current ? colors.gold : colors.border, borderWidth: s.current ? 2 : 1 },
              ]}
            >
              <View style={[styles.spineFill, { height: `${s.fill * 100}%`, opacity: s.current ? 0.75 : 0.9 }]} />
              {[0.16, 0.24].map((t) => (
                <View key={t} style={[styles.band, { top: s.height * t }]} />
              ))}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.shelfBoard} />
      <View style={styles.shelfNames}>
        {spines.map((s) => (
          <Text key={s.name} numberOfLines={2} adjustsFontSizeToFit style={[styles.shelfName, s.current && styles.shelfNameNow]}>
            {s.name.replace(' ', '\n')}
          </Text>
        ))}
      </View>
      <Text style={styles.sentence}>{sentence}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- a year of writing

function YearOfWriting({ journal, width }: { journal: Journal; width: number }) {
  const [pointed, setPointed] = useState<string | null>(null);
  const step = yearStep(width);
  const g = useMemo(() => yearGrid(journal, step), [journal, step]);
  const narrow = g.width > width;
  const grid = (
    <Pressable
      accessible
      accessibilityLabel={yearLabel(journal)}
      onPress={(e) => setPointed(yearDayAt(journal, e.nativeEvent.locationX, e.nativeEvent.locationY, step))}
    >
      <Svg width={g.width} height={g.height}>
        {g.weekdays.map((w) => (
          <SvgText key={w.text} x={0} y={w.y + 11} fontSize={11} fill={colors.muted} fontFamily={fonts.ui}>
            {w.text}
          </SvgText>
        ))}
        {g.months.map((m) => (
          <SvgText key={`${m.text}${m.x}`} x={m.x} y={11} fontSize={11} fill={colors.muted} fontFamily={fonts.ui}>
            {m.text}
          </SvgText>
        ))}
        {g.cells.map((c) => (
          <Rect key={c.day} x={c.x} y={c.y} width={g.cell} height={g.cell} rx={3} fill={shades[c.level]} />
        ))}
        {g.cells
          .filter((c) => c.today || c.day === pointed)
          .map((c) => (
            <Rect key={`ring-${c.day}`} x={c.x - 1} y={c.y - 1} width={g.cell + 2} height={g.cell + 2} rx={4} fill="none" stroke={colors.text} strokeWidth={c.day === pointed ? 2 : 1.25} />
          ))}
      </Svg>
    </Pressable>
  );
  return (
    <View style={styles.gapSm}>
      {narrow ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} ref={(r) => r?.scrollToEnd({ animated: false })}>
          {grid}
        </ScrollView>
      ) : (
        grid
      )}
      <View style={styles.yearFoot}>
        <Text style={styles.body}>{describeDay(journal, pointed ?? journal.today)}</Text>
        <View style={styles.legend} importantForAccessibility="no-hide-descendants">
          <Muted>{progressWords.less}</Muted>
          {shades.map((c) => (
            <View key={c} style={[styles.legendCell, { backgroundColor: c }]} />
          ))}
          <Muted>{progressWords.more}</Muted>
        </View>
      </View>
      <TableFold label="A year of writing, as a table" columns={progressWords.yearColumns} rows={yearTable(journal)} />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- tiles and trend

function Tiles({ report, width }: { report: ProgressReport; width: number }) {
  const columns = tileColumns(width);
  const w = (width - 12 * (columns - 1)) / columns;
  return (
    <View style={styles.tiles}>
      {periodTiles(report).map((t) => (
        <Panel key={t.label} style={[styles.tile, { width: w }]}>
          <Text style={styles.tileLabel}>{t.label}</Text>
          <Text style={styles.tileValue}>{t.value}</Text>
          <Muted>{t.detail}</Muted>
          {t.meter !== null && (
            <View style={styles.gapSm} accessible accessibilityLabel={`${t.meter.label}: ${t.meter.percent}%`}>
              <Gauge value={t.meter.percent / 100} />
              <Muted>{t.meter.caption}</Muted>
            </View>
          )}
        </Panel>
      ))}
    </View>
  );
}

function TrendChart({ report, width }: { report: ProgressReport; width: number }) {
  const t = trendView(report.weeks);
  const [picked, setPicked] = useState<number | null>(null);
  const h = 150;
  const slot = width / Math.max(1, t.bars.length);
  const mid = t.bars.some((b) => b.value < 0) ? h / 2 : h - 4;
  const room = mid - 16;
  return (
    <Panel style={styles.box}>
      <Text style={styles.boxTitle} accessibilityRole="header">
        {progressWords.trend}
      </Text>
      {t.empty ? (
        <Muted>{progressWords.trendEmpty}</Muted>
      ) : (
        <View>
          <Svg width={width} height={h + 20}>
            <Line x1={0} y1={mid} x2={width} y2={mid} stroke={colors.border} strokeWidth={1} />
            {t.bars.map((b, i) => {
              const bh = (Math.abs(b.value) / t.most) * room;
              const x = i * slot + slot * 0.18;
              const y = b.value >= 0 ? mid - bh : mid;
              return (
                <Rect
                  key={b.key}
                  x={x}
                  y={y}
                  width={slot * 0.64}
                  height={Math.max(1, bh)}
                  rx={3}
                  fill={b.value < 0 ? colors.danger : colors.gold}
                  fillOpacity={b.current ? 0.6 : 1}
                  stroke={picked === i ? colors.text : 'none'}
                  onPress={() => setPicked(picked === i ? null : i)}
                />
              );
            })}
            {t.bars.map((b, i) => (
              <SvgText key={`l${b.key}`} x={i * slot + slot / 2} y={h + 14} fontSize={10} fill={colors.muted} textAnchor="middle" fontFamily={fonts.ui}>
                {b.short}
              </SvgText>
            ))}
          </Svg>
          <Text style={styles.body}>{picked !== null ? t.bars[picked].said : t.bars[t.bars.length - 1].said}</Text>
        </View>
      )}
      <TableFold label={`${progressWords.trend}, as a table`} columns={t.columns} rows={t.rows} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------------- targets

/** A word target typed in: kept when the field is left. Blank removes it. */
function TargetField({ label, value, onCommit }: { label: string; value: number | null; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : `${value}`);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value === null ? '' : `${value}`;
  const commit = () => {
    const next = typedTarget(text);
    if (next !== value) onCommit(next);
  };
  return (
    <View style={styles.targetField}>
      <Field
        label={label}
        value={shown}
        placeholder={progressWords.noTarget}
        keyboardType="number-pad"
        onFocus={() => {
          setText(value === null ? '' : `${value}`);
          setFocused(true);
        }}
        onChangeText={(v) => setText(v.replace(/[^0-9]/g, ''))}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onSubmitEditing={commit}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------- deadlines and tasks

function DeadlineBody({ d }: { d: DeadlineRow }) {
  return (
    <>
      <Text style={styles.goalTitle}>{d.goal.title}</Text>
      <Muted>{deadlineWhen(d)}</Muted>
      {d.percent !== null && (
        <View accessible accessibilityLabel={`${d.goal.title} progress: ${d.percent}%`} style={styles.meter}>
          <Gauge value={d.percent / 100} />
        </View>
      )}
      <Text style={styles.body}>{deadlineText(d)}</Text>
    </>
  );
}

function GoalRow({
  goal,
  onDone,
  onEdit,
  onRemove,
  children,
}: {
  goal: Goal;
  onDone: (done: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.goalRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: goal.done }}
        accessibilityLabel={`${goal.title} done`}
        onPress={() => onDone(!goal.done)}
        hitSlop={8}
        style={styles.check}
      >
        <Icon name={goal.done ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={goal.done ? colors.gold : colors.muted} />
      </Pressable>
      <View style={styles.flex}>{children}</View>
      <IconButton icon="pencil-outline" label={`Edit ${goal.title}`} onPress={onEdit} />
      <IconButton icon="delete-outline" label={`Delete ${goal.title}`} onPress={onRemove} />
    </View>
  );
}

function GoalSheet({
  kind,
  goal,
  nodes,
  today,
  onClose,
  onSave,
}: {
  kind: 'deadline' | 'task';
  goal: Goal | null;
  nodes: readonly StoryNode[];
  today: string;
  onClose: () => void;
  onSave: (form: GoalForm) => boolean;
}) {
  const [form, setForm] = useState<GoalForm>(() => goalFormStart(goal));
  const [picking, setPicking] = useState(false);
  const w = goalFormWords(kind, goal !== null, form);
  const set = (patch: Partial<GoalForm>) => setForm({ ...form, ...patch });
  const scopes = useMemo(() => deadlineScopes(nodes), [nodes]);
  const task = kind === 'task';
  return (
    <Sheet
      visible
      onClose={onClose}
      title={w.title}
      footer={
        <View style={styles.row}>
          <OutlineButton label={w.cancel} compact tone="muted" onPress={onClose} />
          <GoldButton label={w.save} compact onPress={() => onSave(form) && onClose()} />
        </View>
      }
    >
      <Field label={w.nameLabel} placeholder={w.nameHint} value={form.title} onChangeText={(v) => set({ title: v })} autoFocus />
      {task ? (
        <>
          <Text style={styles.fieldLabel}>{w.typeLabel.toUpperCase()}</Text>
          <View style={styles.chips}>
            {taskCategories.map((c) => (
              <Chip key={c} label={taskLabels[c]} selected={form.category === c} onPress={() => set({ category: c })} />
            ))}
          </View>
        </>
      ) : (
        <>
          <Field label={w.targetLabel} keyboardType="number-pad" value={form.target} onChangeText={(v) => set({ target: v.replace(/[^0-9]/g, '') })} />
          <Text style={styles.fieldLabel}>{w.coversLabel.toUpperCase()}</Text>
          <View style={styles.chips}>
            <Chip label={w.whole} selected={form.nodeId === '' || !scopes.some((t) => t.node.id === form.nodeId)} onPress={() => set({ nodeId: '' })} />
            {scopes.map((t) => (
              <Chip key={t.node.id} label={scopeLabel(t).trim()} selected={form.nodeId === t.node.id} onPress={() => set({ nodeId: t.node.id })} />
            ))}
          </View>
        </>
      )}
      <View style={styles.dateRow}>
        <Text style={styles.body}>{w.date}</Text>
        <OutlineButton label={w.pick} compact onPress={() => setPicking(!picking)} />
        {task && form.due !== null && <OutlineButton label={w.noDate} compact tone="muted" onPress={() => set({ due: null })} />}
      </View>
      {picking && (
        <MonthPicker
          value={form.due}
          today={today}
          onPick={(day) => {
            set({ due: day });
            setPicking(false);
          }}
        />
      )}
    </Sheet>
  );
}

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A month of days to pick one from, with the months before and after a press away. */
function MonthPicker({ value, today, onPick }: { value: string | null; today: string; onPick: (day: string) => void }) {
  const startOf = (key: string) => `${key.substring(0, 7)}-01`;
  const [month, setMonth] = useState(startOf(value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today));
  const first = parseDay(month);
  const lead = (first.getDay() + 6) % 7;
  const days: string[] = [];
  for (let i = 0; i < 31; i++) {
    const d = addDays(month, i);
    if (d.substring(0, 7) !== month.substring(0, 7)) break;
    days.push(d);
  }
  const prev = startOf(addDays(month, -1));
  const next = startOf(addDays(month, 32));
  return (
    <View style={styles.picker}>
      <View style={styles.pickerHead}>
        <IconButton icon="chevron-left" label="The month before" onPress={() => setMonth(prev)} />
        <Text style={styles.goalTitle}>{`${monthNames[first.getMonth()]} ${first.getFullYear()}`}</Text>
        <IconButton icon="chevron-right" label="The month after" onPress={() => setMonth(next)} />
      </View>
      <View style={styles.pickerGrid}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={[styles.pickerCell, styles.pickerDay]}>
            {d}
          </Text>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <View key={`b${i}`} style={styles.pickerCell} />
        ))}
        {days.map((d) => {
          const on = d === value;
          return (
            <Pressable key={d} accessibilityRole="button" accessibilityLabel={d} onPress={() => onPick(d)} style={[styles.pickerCell, on && styles.pickerOn, d === today && !on && styles.pickerToday]}>
              <Text style={[styles.pickerText, on && { color: colors.onGold }]}>{parseDay(d).getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  gap: { gap: space.md },
  gapSm: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  body: { fontFamily: fonts.ui, fontSize: 15, color: colors.text, lineHeight: 21 },
  box: { gap: space.sm },
  boxHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  boxTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text },
  gauge: { borderRadius: 4, overflow: 'hidden', backgroundColor: colors.elevated },
  fold: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm, minHeight: 44 },
  foldText: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tableCell: { minWidth: 96, maxWidth: 260, paddingVertical: 8, paddingRight: 24, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  tableHead: { fontWeight: '700', color: colors.muted },
  hero: { gap: space.md, padding: 20 },
  heroWide: { flexDirection: 'row', alignItems: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroLabel: { fontFamily: fonts.ui, fontSize: 17, color: colors.text },
  big: { fontFamily: fonts.numbers, fontSize: 48, lineHeight: 54, fontWeight: '700', color: colors.gold },
  finish: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  hDivider: { height: 1, backgroundColor: colors.border },
  vDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: 20 },
  shelf: { height: 132, flexDirection: 'row', alignItems: 'flex-end' },
  spineSlot: { flex: 1, paddingHorizontal: 3, alignItems: 'center' },
  spine: { width: '100%', maxWidth: 46, borderTopLeftRadius: 4, borderTopRightRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  spineFill: { width: '100%', backgroundColor: colors.gold },
  band: { position: 'absolute', left: 0, right: 0, height: 1.5, backgroundColor: 'rgba(148, 163, 184, 0.35)' },
  shelfBoard: { height: 3, backgroundColor: colors.muted },
  shelfNames: { flexDirection: 'row', marginTop: 6 },
  shelfName: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 9.5, color: colors.muted },
  shelfNameNow: { color: colors.gold, fontWeight: '700' },
  sentence: { marginTop: space.md, fontFamily: fonts.bookItalic, fontSize: 17, lineHeight: 25, color: colors.text },
  yearFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'space-between', alignItems: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendCell: { width: 12, height: 12, borderRadius: 3 },
  seals: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 16, marginTop: 4 },
  seal: { width: 92, alignItems: 'center', gap: 6 },
  sealRing: { width: 56, height: 56, borderRadius: 28, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  sealReached: { backgroundColor: colors.gold, borderColor: colors.gold, borderWidth: 1.25, shadowColor: colors.gold, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  sealLabel: { fontFamily: fonts.ui, fontSize: 12.5, textAlign: 'center', color: colors.muted },
  sealLabelReached: { color: colors.text, fontWeight: '700' },
  sealToGo: { fontFamily: fonts.ui, fontSize: 12.5, textAlign: 'center', color: colors.gold },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { gap: 2, padding: 12 },
  tileLabel: { fontFamily: fonts.ui, fontSize: 13, fontWeight: '700', letterSpacing: 0.4, color: colors.muted },
  tileValue: { fontFamily: fonts.numbers, fontSize: 26, color: colors.gold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 3 },
  statusLabel: { width: 118, fontFamily: fonts.ui, fontSize: 14, color: colors.text },
  statusCount: { width: 36, textAlign: 'right', fontFamily: fonts.ui, fontSize: 14, fontWeight: '700', color: colors.text },
  targetField: { width: 200 },
  meter: { paddingVertical: 6 },
  goalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, paddingVertical: 4 },
  goalTitle: { fontFamily: fonts.ui, fontSize: 15, fontWeight: '700', color: colors.text },
  check: { paddingTop: 10, paddingRight: 4 },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: colors.gold, marginTop: space.sm },
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  picker: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.panel, padding: space.sm, marginTop: space.sm },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  pickerCell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  pickerDay: { fontFamily: fonts.ui, fontSize: 12, color: colors.muted, textAlign: 'center', textAlignVertical: 'center' },
  pickerText: { fontFamily: fonts.ui, fontSize: 15, color: colors.text },
  pickerOn: { backgroundColor: colors.gold },
  pickerToday: { borderWidth: 1, borderColor: colors.gold },
});
