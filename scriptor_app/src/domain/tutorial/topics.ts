// THE TUTORIAL (FEATURES.md #358): the lessons, and the lesson for where someone is. A port of
// flutter_app/lib/features/tutorial/topics.dart: its lessons are in topicsData.ts exactly as the Dart has them, and
// `topicFor` is the Dart's. Scriptor shows them in its own words (scriptorLessons.ts).

import { tutorialTopics } from './topicsData';

/** One short lesson. */
export type Topic = {
  id: string;
  title: string;
  group: string;
  /** One or two sentences: what it is for. */
  what: string;
  /** Three to five things to do, in order. */
  steps: readonly string[];
  /** A concrete case, with made-up names. */
  example: string;
  /** The page it lives on, when it has one ("Take me there"): the Flutter app's path. */
  path?: string;
  /** Other addresses that show this lesson first (besides `path`). */
  matches?: readonly string[];
  /** Where to find it when it is not a page of its own. */
  where?: string;
};

/** The lesson for a location (the Flutter app's path): the one whose page or addresses match it most closely. Falls
 * back to finding your way around. */
export function topicFor(location: string, topics: readonly Topic[] = tutorialTopics): Topic {
  const path = location.split('?')[0].split('#')[0];
  let best: Topic | null = null;
  let length = -1;
  for (const t of topics) {
    for (const p of [...(t.path !== undefined ? [t.path] : []), ...(t.matches ?? [])]) {
      const hit =
        p === '/'
          ? path === '/'
          : path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`) || (p.endsWith('/') && path.startsWith(p));
      if (hit && p.length > length) {
        best = t;
        length = p.length;
      }
    }
  }
  return best ?? topics.find((t) => t.id === 'areas')!;
}
