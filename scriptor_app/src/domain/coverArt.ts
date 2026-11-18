// The designed jacket's choices (src/ui/library/NovelCover.tsx): which line pattern a novel's genre gets, and the
// letter in its medallion.

export type CoverPattern = 'arches' | 'orbits' | 'waves' | 'rain' | 'rings' | 'halo' | 'chevrons' | 'ruled';

const patternRules: [RegExp, CoverPattern][] = [
  [/sci|space|cyber|star/, 'orbits'],
  [/litrpg|progression|cultivation|system|gamelit/, 'chevrons'],
  [/romance|love/, 'rings'],
  [/horror|dark|gothic/, 'halo'],
  [/myster|detective|crime|thriller|noir/, 'rain'],
  [/adventure|sea|journey|pirate/, 'waves'],
  [/fantasy|magic|myth|fairy/, 'arches'],
];

/** The pattern of a novel's genre: the primary genre decides, the others only when it says nothing. */
export function coverPatternOf(primaryGenre: string, secondaryGenres: string[]): CoverPattern {
  for (const genre of [primaryGenre, ...secondaryGenres]) {
    const g = genre.toLowerCase();
    const found = patternRules.find(([test]) => test.test(g));
    if (found) return found[1];
  }
  return 'ruled';
}

/** The title's initial for the medallion, past a leading "The", "A" or "An". */
export function coverInitial(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lead = words.length > 1 && /^(the|a|an)$/i.test(words[0]) ? words[1] : words[0] ?? '';
  const letter = Array.from(lead).find((c) => /[\p{L}\p{N}]/u.test(c));
  return (letter ?? '✦').toLocaleUpperCase();
}

/** A small steady hash, so a book's stars stay where they are. */
export function coverSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The pattern's lines as one SVG path (plus dots for the stars), for a w × h cover. */
export function coverLines(pattern: CoverPattern, w: number, h: number, seed: number): { d: string; dots: [number, number][] } {
  const f = (n: number) => n.toFixed(1);
  const parts: string[] = [];
  const dots: [number, number][] = [];
  switch (pattern) {
    case 'arches': {
      // Concentric pointed arches rising from the foot: a cathedral window.
      const cx = w / 2;
      const base = h * 1.02;
      for (let k = 1; k <= 7; k++) {
        const half = w * 0.085 * k;
        const tall = h * 0.13 * k;
        parts.push(
          `M${f(cx - half)} ${f(base)}L${f(cx - half)} ${f(base - tall * 0.55)}` +
            `Q${f(cx - half)} ${f(base - tall * 0.92)} ${f(cx)} ${f(base - tall)}` +
            `Q${f(cx + half)} ${f(base - tall * 0.92)} ${f(cx + half)} ${f(base - tall * 0.55)}L${f(cx + half)} ${f(base)}`,
        );
      }
      break;
    }
    case 'waves': {
      const gap = h / 13;
      const length = w / 3;
      for (let y = gap * 1.5; y < h; y += gap) {
        let d = `M0 ${f(y)}Q${f(length / 4)} ${f(y - gap * 0.3)} ${f(length / 2)} ${f(y)}`;
        for (let x = length; x <= w + length; x += length / 2) d += `T${f(x)} ${f(y)}`;
        parts.push(d);
      }
      break;
    }
    case 'orbits': {
      const cx = w * 0.5;
      const cy = h * 0.44;
      for (const r of [0.28, 0.46, 0.66, 0.88]) {
        const rx = w * r;
        const ry = rx * 0.34;
        parts.push(`M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}`);
      }
      let s = seed || 1;
      for (let i = 0; i < 18; i++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        const x = (s % 1000) / 1000;
        s = (Math.imul(s, 1103515245) + 12345) >>> 0;
        const y = (s % 1000) / 1000;
        dots.push([x * w, y * h]);
      }
      break;
    }
    case 'rain': {
      // Fine slanted lines: rain on a window.
      const gap = Math.max(6, w / 22);
      const slant = h * 0.35;
      for (let x = -slant; x < w + gap; x += gap) parts.push(`M${f(x)} ${f(h)}L${f(x + slant)} 0`);
      break;
    }
    case 'rings': {
      // A lattice of overlapping circles.
      const r = w / 5;
      const dy = r * 0.866;
      for (let row = 0, y = 0; y <= h + r; row++, y += dy) {
        for (let x = row % 2 ? r / 2 : 0; x <= w + r; x += r) {
          parts.push(`M${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 1 0 ${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 1 0 ${f(x - r)} ${f(y)}`);
        }
      }
      break;
    }
    case 'halo': {
      // Rings around a pale moon high on the cover.
      const cx = w * 0.72;
      const cy = h * 0.2;
      for (let k = 1; k <= 9; k++) {
        const r = w * 0.09 * k;
        parts.push(`M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}`);
      }
      break;
    }
    case 'chevrons': {
      // Stacked chevrons climbing the cover: levels.
      const gap = h / 9;
      for (let y = h + gap; y > -gap; y -= gap) parts.push(`M0 ${f(y)}L${f(w / 2)} ${f(y - gap * 0.9)}L${f(w)} ${f(y)}`);
      break;
    }
    default: {
      // Manuscript paper: ruled lines and the margin.
      const gap = h / 16;
      for (let y = gap * 2; y < h; y += gap) parts.push(`M0 ${f(y)}L${f(w)} ${f(y)}`);
      parts.push(`M${f(w * 0.2)} 0L${f(w * 0.2)} ${f(h)}`);
    }
  }
  return { d: parts.join(''), dots };
}

/** How strongly each pattern is drawn: dense ones fainter, so every jacket carries about the same weight of line. */
export const coverPatternStrength: Record<CoverPattern, number> = {
  arches: 0.22,
  orbits: 0.24,
  waves: 0.17,
  rain: 0.11,
  rings: 0.13,
  halo: 0.2,
  chevrons: 0.15,
  ruled: 0.1,
};
