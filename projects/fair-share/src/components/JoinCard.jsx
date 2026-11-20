import { useId, useState } from 'react';
import { PARTICIPANT_COLORS, nextColor } from '../../core/index.js';
import { useBillStore } from '../store/billStore.js';
import { inkFor } from '../lib/color.js';
import { colorName } from '../lib/colorNames.js';

export default function JoinCard() {
  const view = useBillStore((s) => s.view);
  const join = useBillStore((s) => s.join);
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextColor(view));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nameId = useId();
  const groupName = useId();

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter your name so others know who claimed what.');
      return;
    }
    setBusy(true);
    const ok = await join(name.trim(), color);
    setBusy(false);
    if (!ok) setError('Could not join. Try again.');
  }

  return (
    <form className="join panel" onSubmit={submit} aria-labelledby="join-title" noValidate>
      <h2 id="join-title">Join this bill</h2>
      <div className="field">
        <label htmlFor={nameId}>Your name</label>
        <input
          id={nameId}
          type="text"
          value={name}
          maxLength={32}
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${nameId}-err` : undefined}
        />
        {error && (
          <p id={`${nameId}-err`} className="error">
            {error}
          </p>
        )}
      </div>
      <fieldset className="field">
        <legend>Your color</legend>
        <div className="swatches">
          {PARTICIPANT_COLORS.map((c, i) => (
            <label key={c} className="swatch" style={{ background: c, color: inkFor(c) }}>
              <input
                type="radio"
                name={groupName}
                value={c}
                checked={color === c}
                onChange={() => setColor(c)}
                aria-label={colorName(c, i)}
              />
              <span aria-hidden="true">{color === c ? '✓' : ''}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Joining…' : 'Join and start claiming'}
      </button>
    </form>
  );
}
