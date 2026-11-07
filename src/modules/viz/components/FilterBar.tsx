import type { ReactNode } from 'react';

interface FilterBarProps {
  /** What is being filtered, for screen readers: "Timeline filters". */
  label: string;
  /** How many filters are set; the clear button appears when there are any. */
  active: number;
  onClear: () => void;
  /** The view's own controls, each with its own visible or aria label. */
  children: ReactNode;
}

/** The row of filters above a view, with one button to take them all off. Its controls keep their place in the tab order. */
export function FilterBar({ label, active, onClear, children }: FilterBarProps) {
  return (
    <div className="viz-filters" role="search" aria-label={label}>
      {children}
      {active > 0 && (
        <button type="button" className="btn ghost" onClick={onClear}>
          Clear filters ({active})
        </button>
      )}
    </div>
  );
}

interface ChipProps {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}

/** A filter that is simply on or off ("Show minor events"), as a checkbox styled as a chip. */
export function FilterChip({ label, on, onChange }: ChipProps) {
  return (
    <label className={`chip-toggle${on ? ' on' : ''}`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
