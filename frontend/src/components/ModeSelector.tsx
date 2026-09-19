import { useEffect, useRef, useState } from 'react';
import { Mode } from '../types';
import { Translations } from '../translations';

const MODES: Mode[] = ['calm', 'balanced', 'brave'];

export const MODE_COLORS: Record<Mode, string> = {
  calm: '#4838a8',
  balanced: '#2e7d4f',
  brave: '#e07040',
};

/* How long the tap-hint stays up on touch. Long enough to read a short
   sentence without holding up someone who is just switching modes. */
const HINT_MS = 2600;

interface Props {
  value: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
  t: Translations;
}

export function ModeSelector({ value, onChange, disabled, t }: Props) {
  // Touch devices have no hover, so tapping a mode briefly reveals what it
  // does. Desktop ignores this and uses :hover instead — see App.css.
  const [hinted, setHinted] = useState<Mode | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClick = (m: Mode) => {
    onChange(m);
    // Switching again cancels the previous hint rather than queueing behind it.
    if (timerRef.current) clearTimeout(timerRef.current);
    setHinted(m);
    timerRef.current = setTimeout(() => setHinted(null), HINT_MS);
  };

  return (
    <div className="mode-buttons">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          className={`mode-btn${value === m ? ' mode-btn--active' : ''}${hinted === m ? ' mode-btn--hinted' : ''}`}
          style={{ background: MODE_COLORS[m] }}
          onClick={() => handleClick(m)}
          disabled={disabled}
          data-tip={t.modeDescriptions[m]}
        >
          {t.modeLabels[m]}
        </button>
      ))}
    </div>
  );
}
