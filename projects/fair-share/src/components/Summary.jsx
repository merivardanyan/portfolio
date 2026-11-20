import { Avatar, Money } from './bits.jsx';

export default function Summary({ view, split, me }) {
  const cur = view.currency;
  const people = [...split.people].sort((a, b) => (a.participantId === me ? -1 : b.participantId === me ? 1 : 0));
  const u = split.unclaimed;

  return (
    <section className="summary" aria-labelledby="summary-title">
      <h2 id="summary-title" className="receipt-title">
        Who owes what
      </h2>

      {people.length === 0 && <p className="muted">Nobody has joined yet.</p>}

      <ul className="people">
        {people.map((p) => (
          <li key={p.participantId} className={p.participantId === me ? 'person is-me' : 'person'}>
            <div className="person-head">
              <Avatar person={p} />
              <span className="person-name">
                {p.name}
                {p.participantId === me && <span className="muted"> (you)</span>}
              </span>
              <strong className="person-total">
                <Money cents={p.totalCents} currency={cur} />
              </strong>
            </div>
            {p.items.length > 0 ? (
              <dl className="breakdown">
                <div>
                  <dt>Items</dt>
                  <dd>
                    <Money cents={p.subtotalCents} currency={cur} />
                  </dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>
                    <Money cents={p.taxCents} currency={cur} />
                  </dd>
                </div>
                <div>
                  <dt>Tip</dt>
                  <dd>
                    <Money cents={p.tipCents} currency={cur} />
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="hint">Nothing claimed yet.</p>
            )}
          </li>
        ))}
        {u.itemIds.length > 0 && (
          <li className="person is-unclaimed">
            <div className="person-head">
              <span className="avatar avatar-md avatar-empty" aria-hidden="true">
                ?
              </span>
              <span className="person-name">Unclaimed</span>
              <strong className="person-total">
                <Money cents={u.totalCents} currency={cur} />
              </strong>
            </div>
            <p className="hint">
              {u.itemIds.length} {u.itemIds.length === 1 ? 'item' : 'items'} still need an owner (tax and tip
              included).
            </p>
          </li>
        )}
      </ul>

      <dl className="totals">
        <div>
          <dt>Subtotal</dt>
          <dd>
            <Money cents={split.subtotalCents} currency={cur} />
          </dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>
            <Money cents={split.taxCents} currency={cur} />
          </dd>
        </div>
        <div>
          <dt>Tip{view.tip.mode === 'percent' ? ` (${view.tip.value / 100}%)` : ''}</dt>
          <dd>
            <Money cents={split.tipCents} currency={cur} />
          </dd>
        </div>
        <div className="grand">
          <dt>Total</dt>
          <dd>
            <Money cents={split.totalCents} currency={cur} />
          </dd>
        </div>
      </dl>
    </section>
  );
}
