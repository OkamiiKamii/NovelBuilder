import type { Run } from '../compile';

/** What a source file is read into, whatever its format. */
export type ImportBlock =
  /** A heading the file itself marked as one. `level` 0 is a document title. */
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; runs: Run[]; align?: 'left' | 'center' | 'right' | 'justify'; quote?: boolean }
  /** A scene break or horizontal rule. */
  | { type: 'divider' };

export const plainOf = (runs: Run[]): string => runs.map((r) => r.text).join('');
