interface ViewSwitchProps {
  mode: 'visual' | 'list';
  onChange: (mode: 'visual' | 'list') => void;
  /** What the drawn form is called: "Map", "Timeline", "Board". */
  visualLabel: string;
}

/** Every view can be read as a list as well as drawn: this switches between the two, and the choice is kept in the page address. */
export function ViewSwitch({ mode, onChange, visualLabel }: ViewSwitchProps) {
  return (
    <div className="segmented viz-switch" role="group" aria-label="Show as">
      {(['visual', 'list'] as const).map((m) => (
        <button key={m} type="button" className={mode === m ? 'active' : ''} aria-pressed={mode === m} onClick={() => onChange(m)}>
          {m === 'visual' ? visualLabel : 'List'}
        </button>
      ))}
    </div>
  );
}
