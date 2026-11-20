import { useId } from 'react';
import { parseMoney } from '../../core/index.js';

export function tipFromFields({ mode, percent, amount }, digits, fallbackCents = null) {
  if (mode === 'percent') {
    const n = percent.trim() === '' ? 0 : Number(percent.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return { mode: 'percent', value: Math.round(n * 100) };
  }
  if (amount.trim() === '') return { mode: 'amount', value: fallbackCents ?? 0 };
  const cents = parseMoney(amount, digits);
  return cents === null ? null : { mode: 'amount', value: cents };
}

export function fieldsFromTip(tip, digits) {
  return tip.mode === 'percent'
    ? { mode: 'percent', percent: String(tip.value / 100), amount: '' }
    : { mode: 'amount', percent: '18', amount: (tip.value / 10 ** digits).toFixed(digits) };
}

export function TipFields({ value, onChange, currency }) {
  const id = useId();
  const percent = value.mode === 'percent';
  return (
    <fieldset className="field tip-fields">
      <legend>Tip</legend>
      <div className="tip-row">
        <div className="segmented" role="radiogroup" aria-label="Tip type">
          {[
            ['percent', '%'],
            ['amount', currency],
          ].map(([mode, label]) => (
            <label key={mode} className={value.mode === mode ? 'is-on' : undefined}>
              <input
                type="radio"
                name={`${id}-mode`}
                value={mode}
                checked={value.mode === mode}
                onChange={() => onChange({ ...value, mode })}
              />
              {label}
            </label>
          ))}
        </div>
        <label htmlFor={id} className="sr-only">
          {percent ? 'Tip percentage' : `Tip amount in ${currency}`}
        </label>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={percent ? value.percent : value.amount}
          placeholder={percent ? '18' : '0.00'}
          onChange={(e) => onChange({ ...value, [percent ? 'percent' : 'amount']: e.target.value })}
        />
      </div>
    </fieldset>
  );
}
