import { useId, useMemo, useState } from 'react';
import { centsToDecimal, currencyDigits, formatMoney, parseMoney, parseReceipt } from '../../core/index.js';
import { api } from '../api/index.js';
import { remember } from '../lib/identity.js';
import { TipFields, tipFromFields } from './TipFields.jsx';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'PLN', 'INR', 'BRL', 'MXN', 'JPY'];

const EXAMPLE = `2 Margherita 24.00
Caesar salad 11.50
3x Craft beer 21.00
Tiramisu 8.00
Subtotal 64.50
Tax 5.73`;

export default function NewBill() {
  const ids = { title: useId(), currency: useId(), receipt: useId(), tax: useId() };
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [receipt, setReceipt] = useState('');
  const [taxInput, setTaxInput] = useState('');
  const [tip, setTip] = useState({ mode: 'percent', percent: '18', amount: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const digits = currencyDigits(currency);

  const parsed = useMemo(() => parseReceipt(receipt, { digits }), [receipt, digits]);
  const taxFromReceipt = parsed.taxCents ? centsToDecimal(parsed.taxCents, digits) : '';
  const effectiveTax = taxInput === '' ? taxFromReceipt : taxInput;
  const taxCents = effectiveTax === '' ? 0 : parseMoney(effectiveTax, digits);
  const tipValue = tipFromFields(tip, digits, parsed.tipCents);
  const subtotal = parsed.items.reduce((s, it) => s + it.unitCents * it.qty, 0);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!parsed.items.length) return setError('Add at least one item line, for example "2 Margherita 24.00".');
    if (taxCents === null) return setError('Tax must be an amount like 5.73.');
    if (!tipValue) return setError('Tip must be a percentage (0-100) or an amount.');
    setBusy(true);
    try {
      const { id, hostToken } = await api.createBill({
        title: title.trim(),
        currency,
        taxCents,
        tip: tipValue,
        items: parsed.items,
      });
      remember(id, { hostToken, title: title.trim() });
      window.location.hash = `#/b/${id}`;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="new-bill" onSubmit={submit} noValidate aria-labelledby="new-title">
      <h1 id="new-title">New bill</h1>

      <div className="row-2">
        <div className="field">
          <label htmlFor={ids.title}>
            Title <span className="muted">(optional)</span>
          </label>
          <input id={ids.title} type="text" value={title} maxLength={80} placeholder="Friday dinner" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field field-narrow">
          <label htmlFor={ids.currency}>Currency</label>
          <select id={ids.currency} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <div className="label-row">
          <label htmlFor={ids.receipt}>Receipt lines</label>
          <button type="button" className="link-btn" onClick={() => setReceipt(EXAMPLE)}>
            Use an example
          </button>
        </div>
        <textarea
          id={ids.receipt}
          className="receipt-input mono"
          rows={8}
          value={receipt}
          onChange={(e) => setReceipt(e.target.value)}
          placeholder={'2 Margherita 24.00\nCaesar salad 11.50\nTax 3.10'}
          aria-describedby={`${ids.receipt}-hint`}
          spellCheck="false"
        />
        <p id={`${ids.receipt}-hint`} className="hint">
          One item per line: quantity (optional), name, line total. Tax and tip lines are detected; subtotal and
          total lines are skipped.
        </p>
      </div>

      {(parsed.items.length > 0 || parsed.skipped.length > 0) && (
        <section className="receipt preview" aria-labelledby="preview-title">
          <h2 id="preview-title" className="receipt-title">
            Preview · {parsed.items.length} {parsed.items.length === 1 ? 'item' : 'items'}
          </h2>
          <ul className="receipt-lines">
            {parsed.items.map((it, i) => (
              <li key={i}>
                <span>
                  {it.qty > 1 && <span className="muted">{it.qty}× </span>}
                  {it.name}
                </span>
                <span className="money">{formatMoney(it.unitCents * it.qty, currency)}</span>
              </li>
            ))}
            <li className="receipt-sum">
              <span>Subtotal</span>
              <span className="money">{formatMoney(subtotal, currency)}</span>
            </li>
          </ul>
          {parsed.skipped.length > 0 && (
            <p className="hint">
              Skipped: {parsed.skipped.join(' · ')}
            </p>
          )}
        </section>
      )}

      <div className="row-2">
        <div className="field">
          <label htmlFor={ids.tax}>Tax</label>
          <input
            id={ids.tax}
            type="text"
            inputMode="decimal"
            value={effectiveTax}
            placeholder="0.00"
            onChange={(e) => setTaxInput(e.target.value)}
            aria-invalid={taxCents === null || undefined}
          />
        </div>
        <TipFields value={tip} onChange={setTip} currency={currency} />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create bill and get the link'}
        </button>
      </div>
    </form>
  );
}
