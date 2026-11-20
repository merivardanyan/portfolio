import { formatMoney, lineCents } from '../../core/index.js';
import { useBillStore } from '../store/billStore.js';
import { Avatar } from './bits.jsx';

export default function ItemList({ view, split, me }) {
  const toggleClaim = useBillStore((s) => s.toggleClaim);
  const byId = new Map(view.participants.map((p) => [p.id, p]));
  const unclaimed = new Set(split.unclaimed.itemIds);
  const canClaim = Boolean(me) && !view.locked;

  return (
    <section className="receipt" aria-labelledby="items-title">
      <h2 id="items-title" className="receipt-title">
        Items
        {unclaimed.size > 0 && <span className="tag tag-warn">{unclaimed.size} unclaimed</span>}
      </h2>
      {view.items.length === 0 ? (
        <p className="muted">No items yet.</p>
      ) : (
        <ul className="items">
          {view.items.map((item) => {
            const claimers = (view.claims[item.id] ?? []).map((id) => byId.get(id)).filter(Boolean);
            const mine = claimers.some((p) => p.id === me);
            const ways = claimers.length;
            const names = claimers.map((p) => (p.id === me ? 'you' : p.name)).join(', ');
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`item${mine ? ' is-mine' : ''}${unclaimed.has(item.id) ? ' is-unclaimed' : ''}`}
                  aria-pressed={mine}
                  disabled={!canClaim}
                  onClick={() => toggleClaim(item.id)}
                >
                  <span className="item-check" aria-hidden="true" />
                  <span className="item-body">
                    <span className="item-name">
                      {item.qty > 1 && <span className="muted">{item.qty}× </span>}
                      {item.name}
                    </span>
                    <span className="item-meta">
                      {ways === 0 ? (
                        <span className="unclaimed-label">Unclaimed</span>
                      ) : (
                        <>
                          <span className="stack" aria-hidden="true">
                            {claimers.slice(0, 5).map((p) => (
                              <Avatar key={p.id} person={p} size="sm" />
                            ))}
                          </span>
                          <span className="claimers">
                            {ways > 1 ? `Split ${ways} ways: ` : ''}
                            {names}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="money item-price">{formatMoney(lineCents(item), view.currency)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!me && !view.locked && view.items.length > 0 && (
        <p className="hint">Join above to start claiming items.</p>
      )}
    </section>
  );
}
