/**
 * STORY STRUCTURE
 * Markers the author places in the book (an act break, a turning point, a
 * reveal, the climax, anything they name) and labels they give chapters,
 * scenes and events (action, dialogue, a quiet moment…). No formula is
 * assumed: these lists are suggestions to pick from, nothing is expected in
 * any order, and a novel needs none of them.
 */
export const SUGGESTED_MARKERS = ['Act break', 'Inciting incident', 'Turning point', 'Midpoint', 'Major reveal', 'Climax', 'Resolution'];
export const SUGGESTED_LABELS = ['Action', 'Dialogue', 'Exposition', 'Romance', 'Mystery clue', 'Quiet moment'];

/** A structural marker: where in the book something the author considers structural happens. */
export interface StructureMarker {
  id: string;
  projectId: string;
  /** What it is, in the author's words: one of the suggestions, or their own. */
  kind: string;
  /** Optional words of its own: "The bridge falls". */
  title: string;
  /** Where the reader meets it: a chapter or scene. */
  nodeId: string | null;
  /** When it happens in story time, if the author ties it to an event. */
  eventId: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type MarkerChanges = Partial<Pick<StructureMarker, 'kind' | 'title' | 'nodeId' | 'eventId' | 'note'>>;

export const LABEL_MAX = 40;
export const LABELS_PER_ITEM = 12;

/** A list of labels as stored: trimmed, not too long, each once (whatever its capitals), in the order given; one that matches a suggestion takes the suggestion's spelling. */
export function cleanLabels(list: unknown): string[] {
  const out: string[] = [];
  for (const value of Array.isArray(list) ? list : []) {
    if (typeof value !== 'string') continue;
    const typed = value.trim().replace(/\s+/g, ' ').slice(0, LABEL_MAX);
    const label = SUGGESTED_LABELS.find((l) => l.toLowerCase() === typed.toLowerCase()) ?? typed;
    if (label && !out.some((l) => l.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  return out.slice(0, LABELS_PER_ITEM);
}

/** Labels in a steady order: the suggestions first, as listed, then the author's own, alphabetically. */
export function labelOrder(labels: Iterable<string>): string[] {
  const rank = (l: string) => {
    const i = SUGGESTED_LABELS.findIndex((s) => s.toLowerCase() === l.toLowerCase());
    return i < 0 ? SUGGESTED_LABELS.length : i;
  };
  return [...new Set(labels)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
