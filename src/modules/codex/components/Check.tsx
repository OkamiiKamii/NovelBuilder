import { useState } from 'react';

/** A checkbox saved to the project: it shows a click at once, and follows the stored value when that changes. */
export function Check({ label, name, checked, onChange }: { label: string; name: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const [local, setLocal] = useState({ from: checked, value: checked });
  if (local.from !== checked) setLocal({ from: checked, value: checked });
  return (
    <label className="check">
      <input
        type="checkbox"
        aria-label={name}
        checked={local.value}
        onChange={(e) => {
          setLocal({ from: checked, value: e.target.checked });
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}
