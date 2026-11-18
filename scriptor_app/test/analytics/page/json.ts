// The project analytics as JSON, field for field as flutter_app/test/shared/domain/analytics_test.dart's analyticsJson
// writes them (and the agreement dump writes them), and how a novel's analytics inputs are read from its file.

import { type Analytics, computeAnalytics, type Count, type Place, type PlaceWords } from '../../../src/domain/analytics/analytics';
import { Goal, type TrendPoint, WritingSession } from '../../../src/domain/analytics/progress';
import { type JsonMap, str } from '../../../src/domain/json';
import { StoryModel } from '../../../src/domain/model/storyModel';
import { ProgressSnapshot } from '../../../src/domain/progression/snapshots';
import { intOrNull } from '../../../src/domain/records/jsonRecord';
import { type NovelSnapshot } from '../../../src/domain/snapshot/novelSnapshot';

const trend = (p: TrendPoint): JsonMap => ({ key: p.key, label: p.label, net: p.net, current: p.current });
const place = (p: Place | null): JsonMap | null => (p === null ? null : { nodeId: p.nodeId, title: p.title, number: p.number });
const placeWords = (p: PlaceWords | null): JsonMap | null =>
  p === null ? null : { nodeId: p.nodeId, title: p.title, number: p.number, words: p.words };
const count = (c: Count): JsonMap => ({ key: c.key, label: c.label, count: c.count });

export function analyticsJson(a: Analytics): JsonMap {
  return {
    output: {
      totalWords: a.output.totalWords,
      targetWords: a.output.targetWords,
      percent: a.output.percent,
      today: a.output.today.toJson(),
      week: a.output.week.toJson(),
      month: a.output.month.toJson(),
      averagePerWritingDay: a.output.averagePerWritingDay,
      averagePerDayLast30: a.output.averagePerDayLast30,
      days: a.output.days.map(trend),
      weeks: a.output.weeks.map(trend),
    },
    sessions: {
      count: a.sessions.count,
      averageWords: a.sessions.averageWords,
      averageMinutes: a.sessions.averageMinutes,
      totalMinutes: a.sessions.totalMinutes,
      longestByWords: a.sessions.longestByWords === null ? null : { ...a.sessions.longestByWords },
      longestByTime: a.sessions.longestByTime === null ? null : { ...a.sessions.longestByTime },
      currentStreak: a.sessions.currentStreak,
      longestStreak: a.sessions.longestStreak,
      writingDays: a.sessions.writingDays,
      lastWritingDay: a.sessions.lastWritingDay,
    },
    structure: {
      chapters: a.structure.chapters,
      scenes: a.structure.scenes,
      averageChapter: a.structure.averageChapter,
      averageScene: a.structure.averageScene,
      longest: placeWords(a.structure.longest),
      shortest: placeWords(a.structure.shortest),
      lengths: a.structure.lengths.map(placeWords),
      pipeline: a.structure.pipeline.map(count),
    },
    cast: {
      total: a.cast.total,
      appearing: a.cast.appearing,
      rows: a.cast.rows.map((r) => ({
        id: r.id,
        name: r.name,
        chapters: r.chapters,
        distribution: r.distribution,
        first: place(r.first),
        latest: place(r.latest),
        relationships: r.relationships,
        milestones: r.milestones,
        line: r.line,
      })),
    },
    threads: {
      total: a.threads.total,
      groups: a.threads.groups.map(count),
      openMysteries: a.threads.openMysteries,
      characterArcs: a.threads.characterArcs,
      rows: a.threads.rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        statusLabel: r.statusLabel,
        beats: r.beats,
        chapters: r.chapters,
        density: r.density,
        quietFor: r.quietFor,
        line: r.line,
      })),
    },
    observations: a.observations,
  };
}

/** A novel's analytics, its inputs read from its file as the Flutter test reads them. */
export function analyticsOf(s: NovelSnapshot, now: number, names?: Readonly<Record<string, readonly string[]>> | null): Analytics {
  const model = StoryModel.fromSnapshot(s);
  return computeAnalytics(model, {
    targetWordCount: intOrNull(s.project['targetWordCount']),
    docs: new Map(s.rows('chapterContents').map((r) => [str(r['id']), r['doc']])),
    snapshots: s.rows('progressSnapshots').map((r) => new ProgressSnapshot(r)),
    sessions: s.rows('writingSessions').map((r) => new WritingSession(r)),
    goals: s.rows('goals').map((r) => new Goal(r)),
    now,
    names,
  });
}
