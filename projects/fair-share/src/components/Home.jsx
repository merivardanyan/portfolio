import { api } from '../api/index.js';
import { SAMPLE_BILL_ID } from '../api/localAdapter.js';
import { recentBills } from '../lib/identity.js';

export default function Home() {
  const recent = recentBills();
  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Split the receipt by who ate what, live.</h1>
        <p className="lede">
          Paste the receipt and send one link. Everyone taps what they ate, and the math settles itself to the
          cent, tax and tip included. No app, no signup.
        </p>
        <div className="cta">
          <a className="btn btn-primary btn-lg" href="#/new">
            Start a bill
          </a>
          <a className="btn btn-lg" href={`#/b/${SAMPLE_BILL_ID}`}>
            Open the sample receipt
          </a>
        </div>
        {api.name === 'local' && (
          <p className="demo-note">
            Static demo: bills live in this browser. Open a bill in two tabs to watch them sync live.
          </p>
        )}
      </section>

      <section className="steps" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li>
            <strong>Host pastes the receipt.</strong> Lines like <code>2 Margherita 24.00</code> become items,
            and tax and tip are picked up too.
          </li>
          <li>
            <strong>Everyone opens the link</strong> (or scans the QR code) and taps what they had. Shared items
            are split evenly between everyone who tapped them.
          </li>
          <li>
            <strong>Totals update live</strong> for everyone. Tax and tip are split in proportion to what each
            person ordered, and the shares always add up to the exact total.
          </li>
        </ol>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-title">
          <h2 id="recent-title">Your recent bills</h2>
          <ul className="recent">
            {recent.map((b) => (
              <li key={b.id}>
                <a href={`#/b/${b.id}`}>
                  <span>{b.title || 'Untitled bill'}</span>
                  <span className="mono muted">
                    {b.id}
                    {b.hostToken ? ' · host' : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
