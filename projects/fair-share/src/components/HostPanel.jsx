import { useEffect, useId, useState } from 'react';
import { centsToDecimal, currencyDigits, formatMoney, lineCents, newId, parseMoney, parseReceipt } from '../../core/index.js';
import { useBillStore } from '../store/billStore.js';
import { TipFields, fieldsFromTip, tipFromFields } from './TipFields.jsx';

export default function HostPanel({ view }) {
  const hostOps = useBillStore((s) => s.hostOps);
  const digits = currencyDigits(view.currency);
  const ids = { tax: useId(), name: useId(), price: useId(), qty: useId(), paste: useId() };

  const [tax, setTax] = useState(() => centsToDecimal(view.taxCents, digits));
  const [tip, setTip] = useState(() => fieldsFromTip(view.tip, digits));
  const [item, setItem] = useState({ name: '', price: '', qty: '1' });
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setTax(centsToDecimal(view.taxCents, digits));
    setTip(fieldsFromTip(view.tip, digits));
  }, [view.taxCents, view.tip, digits]);

  async function saveCharges(e) {
    e.preventDefault();
    const taxCents = tax.trim() === '' ? 0 : parseMoney(tax, digits);
    const tipValue = tipFromFields(tip, digits);
    if (taxCents === null || !tipValue) {
      setMsg('Check the tax and tip values.');
      return;
    }
    if (await hostOps([{ op: 'bill.set', taxCents, tip: tipValue }])) setMsg('Tax and tip saved.');
  }

  async function addItem(e) {
    e.preventDefault();
    const qty = Number.parseInt(item.qty, 10) || 1;
    const total = parseMoney(item.price, digits);
    if (!item.name.trim() || total === null || total % qty !== 0) {
      setMsg(total !== null && total % qty !== 0 ? 'The line total must divide evenly by the quantity.' : 'Enter a name and a price.');
      return;
    }
    const ok = await hostOps([
      { op: 'item.add', item: { id: newId(), name: item.name.trim(), unitCents: total / qty, qty } },
    ]);
    if (ok) {
      setItem({ name: '', price: '', qty: '1' });
      setMsg(`Added ${item.name.trim()}.`);
    }
  }

  async function addPasted(e) {
    e.preventDefault();
    const parsed = parseReceipt(paste, { digits });
    if (!parsed.items.length) {
      setMsg('No item lines found.');
      return;
    }
    const ops = parsed.items.map((it) => ({ op: 'item.add', item: { ...it, id: newId() } }));
    if (parsed.taxCents) ops.push({ op: 'bill.set', taxCents: parsed.taxCents });
    if (await hostOps(ops)) {
      setPaste('');
      setMsg(`Added ${parsed.items.length} items.`);
    }
  }

  return (
    <section className="host panel" aria-labelledby="host-title">
      <div className="host-head">
        <h2 id="host-title">Host controls</h2>
        <button
          type="button"
          className={view.locked ? 'btn' : 'btn btn-primary'}
          onClick={() => hostOps([{ op: 'bill.lock', locked: !view.locked }])}
        >
          {view.locked ? 'Unlock bill' : 'Lock bill'}
        </button>
      </div>
      <p className="hint">
        Locking freezes claims and turns this page into a read-only summary for everyone.
      </p>

      {!view.locked && (
        <>
          <form className="host-block" onSubmit={saveCharges}>
            <h3>Tax and tip</h3>
            <div className="row-2">
              <div className="field">
                <label htmlFor={ids.tax}>Tax ({view.currency})</label>
                <input id={ids.tax} type="text" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
              <TipFields value={tip} onChange={setTip} currency={view.currency} />
            </div>
            <button type="submit" className="btn">
              Save tax and tip
            </button>
          </form>

          <form className="host-block" onSubmit={addItem}>
            <h3>Add an item</h3>
            <div className="row-3">
              <div className="field">
                <label htmlFor={ids.name}>Name</label>
                <input id={ids.name} type="text" maxLength={60} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} />
              </div>
              <div className="field field-narrow">
                <label htmlFor={ids.qty}>Qty</label>
                <input id={ids.qty} type="number" min={1} max={99} value={item.qty} onChange={(e) => setItem({ ...item, qty: e.target.value })} />
              </div>
              <div className="field field-narrow">
                <label htmlFor={ids.price}>Line total</label>
                <input id={ids.price} type="text" inputMode="decimal" value={item.price} placeholder="0.00" onChange={(e) => setItem({ ...item, price: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn">
              Add item
            </button>
          </form>

          <form className="host-block" onSubmit={addPasted}>
            <h3>
              <label htmlFor={ids.paste}>Paste more receipt lines</label>
            </h3>
            <textarea id={ids.paste} className="mono" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="2 Espresso 7.00" />
            <button type="submit" className="btn">
              Add lines
            </button>
          </form>

          <div className="host-block">
            <h3>Remove items</h3>
            <ul className="remove-list">
              {view.items.map((it) => (
                <li key={it.id}>
                  <span>
                    {it.qty > 1 ? `${it.qty}× ` : ''}
                    {it.name} · <span className="money">{formatMoney(lineCents(it), view.currency)}</span>
                  </span>
                  <button
                    type="button"
                    className="link-btn danger"
                    onClick={() => hostOps([{ op: 'item.remove', id: it.id }])}
                    aria-label={`Remove ${it.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="hint host-msg" aria-live="polite">
        {msg}
      </p>
    </section>
  );
}
