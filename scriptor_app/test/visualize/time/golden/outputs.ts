// Scriptor's outputs for phase 6b's time views, keyed and shaped as dump.dart's, so the agreement test can compare
// them with the Flutter app's (time.golden.json). Where dump.dart copies a widget's logic, this calls the views' pure
// parts (src/domain/visualize/time/*), so they are what is checked. See dump.dart for what is read.

import { CharacterHistoryLine } from '../../../../src/domain/characters/characterRecords';
import { str } from '../../../../src/domain/json';
import { StoryModel } from '../../../../src/domain/model/storyModel';
import { Calendar } from '../../../../src/domain/records/calendar';
import type { NovelSnapshot } from '../../../../src/domain/snapshot/novelSnapshot';
import { type HistoryItem, lifeHistory } from '../../../../src/domain/timeline/lifeHistory';
import { domainOf, layoutAxis } from '../../../../src/domain/timeline/axis';
import { type EventRecord, eventRecords } from '../../../../src/domain/timeline/eventRecord';
import { AlternateHistory, withHistory } from '../../../../src/domain/timeline/histories';
import { twoOrders } from '../../../../src/domain/timeline/narrative';
import { type TimeWindow, panWindow, zoomWindow } from '../../../../src/domain/timeline/scale';
import { type TrackPrefs, arrange, decodeGrouping, groupings, tracksFor } from '../../../../src/domain/timeline/tracks';
import { historyKindLabel, historyPressable, historySections, historySubtitle } from '../../../../src/domain/visualize/time/historyView';
import { eventSaid, lineDrawing, nodeSaid, orderLines, orderLists, orderShown, touches, eventNameOf } from '../../../../src/domain/visualize/time/orderView';
import {
  type ChartTrack,
  type MarkShape,
  chartDrawing,
  chartHits,
  jumpTo,
  markWords,
  marksInOrder,
  showRange,
  showingWords,
  timelineSummary,
  trackRows,
  unplacedLines,
} from '../../../../src/domain/visualize/time/timelineView';

type Out = Record<string, unknown>;

/** A width as Dart writes a double in a key ("390.0"). */
const dartWidth = (w: number) => (Number.isInteger(w) ? `${w}.0` : `${w}`);

function shapeOut(s: MarkShape): Out {
  switch (s.kind) {
    case 'circle':
      return { kind: 'circle', c: [s.cx, s.cy], r: s.r, paint: s.paint };
    case 'rrect':
      return { kind: 'rrect', rect: [s.left, s.top, s.right, s.bottom], radius: s.radius, paint: s.paint };
    case 'hatch':
      return { kind: 'hatch', rect: [s.left, s.top, s.right, s.bottom], lines: s.lines.map((l) => [l.x1, l.y1, l.x2, l.y2]) };
    case 'arrow':
      return { kind: 'arrow', points: s.points };
    case 'fade':
      return { kind: 'fade', rect: [s.left, s.top, s.right, s.bottom] };
    case 'question':
      return { kind: 'question', at: [s.x, s.y] };
  }
}

function drawing(tracks: ChartTrack[], window: TimeWindow, width: number, selected: string | null): Out {
  const d = chartDrawing(tracks, window, width, selected);
  return {
    height: d.height,
    bands: d.bands.map((b) => ({
      top: b.top,
      height: b.height,
      heading: b.heading,
      marks: b.marks.map((m) => ({
        id: m.id,
        selected: m.selected,
        shapes: m.shapes.map(shapeOut),
        label: { text: m.label.text, x: m.label.x, y: m.label.y, above: m.label.above },
      })),
    })),
    hits: chartHits(tracks, window, width).map((h) => ({
      rect: [h.rect.left, h.rect.top, h.rect.right, h.rect.bottom],
      mark: h.mark.id,
      track: h.track,
      words: markWords(h.mark),
    })),
  };
}

function timelineOf(model: StoryModel, records: EventRecord[], cal: Calendar): Out {
  const out: Out = {};
  const byId = new Map(records.map((r) => [r.id, r]));
  const domain = domainOf(records, { day: cal.minutesPerDay, year: cal.minutesPerYear });
  const fit: TimeWindow | null = domain === null ? null : { from: domain.from, to: domain.to };
  const dated = records.filter((r) => r.bounds !== null).length;
  for (const g of groupings(model)) {
    const grouping = decodeGrouping(g.value);
    const tracks = tracksFor(model, records, grouping);
    const prefs: [string, TrackPrefs][] = [['plain', {}]];
    if (tracks.length > 1) {
      prefs.push(['arranged', { folded: [tracks[0].id], hidden: [tracks[tracks.length - 1].id], order: [...tracks].reverse().map((t) => t.id) }]);
    }
    const part: Out = { label: g.label };
    for (const [how, p] of prefs) {
      const shown = arrange(tracks, p).shown;
      const at: Out = {
        summary: timelineSummary({ dated, grouping, shown: shown.length, filtered: false, matching: records.length, all: records.length }),
        filtered: timelineSummary({ dated, grouping, shown: shown.length, filtered: true, matching: 1, all: records.length }),
        lists: shown.map((t) => (t.folded ? `folded:${t.eventIds.length}` : trackRows(t, byId))),
        unplaced: unplacedLines(
          layoutAxis(shown.flatMap((t) => t.eventIds.map((id) => byId.get(id)).filter((r): r is EventRecord => r !== undefined && r.bounds === null)))
            .unplaced,
        ).map((u) => `${u.id}|${u.text}`),
      };
      if (fit !== null) {
        for (const width of [390, 1000]) {
          const chart: ChartTrack[] = shown.map((t) => ({
            track: t,
            axis: layoutAxis(
              t.eventIds.map((id) => byId.get(id)).filter((r): r is EventRecord => r !== undefined),
              { width, domain, useDomain: true, day: cal.minutesPerDay, year: cal.minutesPerYear },
            ),
          }));
          const order = marksInOrder(chart).map((m) => m.id);
          const selected = order.length === 0 ? null : order[Math.trunc(order.length / 2)];
          const zoomed = zoomWindow(fit, 1.5, (fit.from + fit.to) / 2, fit);
          const moved = panWindow(zoomWindow(zoomed, 3, (zoomed.from + zoomed.to) / 2, fit), 0.25);
          at[`w${dartWidth(width)}`] = {
            order,
            all: drawing(chart, fit, width, selected),
            zoomed: drawing(chart, zoomed, width, null),
            moved: drawing(chart, moved, width, selected),
            showing: [fit, zoomed, moved].map((w) => showingWords(w, cal)),
          };
        }
      }
      part[how] = at;
    }
    out[g.value] = part;
  }
  return out;
}

function orderOf(model: StoryModel): Out {
  const orders = twoOrders(model);
  const { events, tellings, nodes } = orderShown(orders, null);
  const name = eventNameOf(model);
  const lines = (selected: string | null, width: number): Out => ({
    related: tellings.filter((t) => touches(t, selected)).flatMap((t) => [t.nodeId, t.eventId]),
    lines: orderLines(nodes, events, tellings, selected).map((l) => {
      const d = lineDrawing(l, width);
      return { d: d.d, width: d.width, role: l.role, muted: d.muted };
    }),
  });
  const lists = orderLists(model, events, tellings);
  const out: Out = {
    nodes: nodes.map((n) => `${n.id}|${nodeSaid(n, name)}`),
    events: events.map((e) => `${e.id}|${eventSaid(e)}`),
    none: lines(null, 120),
  };
  if (nodes.length > 0) out['node'] = lines(nodes[0].id, 72);
  if (events.length > 0) out['event'] = lines(events[events.length - 1].id, 120);
  out['reading'] = lists.reading.map((r) => `${r.title}|${r.subtitle}`);
  out['story'] = lists.story.map((r) => `${r.title}|${r.subtitle}`);
  return out;
}

function livesOf(model: StoryModel, s: NovelSnapshot): Out {
  const out: Out = {};
  const ids = [...model.entries.values()]
    .filter((e) => e.category === 'character')
    .map((e) => e.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const id of ids) {
    const life = lifeHistory(model, id, {
      snapshots: s.rows('progressSnapshots'),
      milestones: s.rows('characterHistory').map((r) => new CharacterHistoryLine(r)),
    });
    if (life === null) continue;
    const lines = (items: readonly HistoryItem[]) =>
      items.map((i) => `${historyKindLabel(i.kind)}|${i.title}|${historySubtitle(i)}|${historyPressable(i)}`);
    const [story, reading, throughout] = historySections(life);
    out[id] = { born: life.born, issues: life.issues, story: lines(story.items), reading: lines(reading.items), throughout: lines(throughout.items) };
  }
  return out;
}

export function novel(s: NovelSnapshot): Out {
  const model = StoryModel.fromSnapshot(s);
  const cal = model.calendar;
  const histories = new Map(s.rows('alternateHistories').map((r) => [str(r['id']), new AlternateHistory(r)]));
  const ids = [...histories.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out: Out = { timeline: timelineOf(model, eventRecords(model), cal) };
  for (const h of ids) {
    const m = withHistory(model, histories, h);
    out[`history:${h}`] = timelineOf(m, eventRecords(m), cal);
  }
  out['order'] = orderOf(model);
  out['lives'] = livesOf(model, s);
  return out;
}

export function misc(): Out {
  const cal = Calendar.standardCalendar;
  return {
    jump: ['10', '-500', '10-6', '10-6-14', 'June 10', 'nonsense', '', ' 1026 '].map((t) => [t, jumpTo(t, cal, true), jumpTo(t, cal, false)]),
    range: (
      [
        ['10', '12'],
        ['12', '10'],
        ['10-6', '10-6'],
        ['x', '10'],
        ['10', 'y'],
        ['June 10', '11'],
      ] as const
    ).map(([a, b]) => [a, b, showRange(a, b, cal)]),
  };
}
