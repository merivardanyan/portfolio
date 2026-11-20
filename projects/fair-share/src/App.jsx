import { useEffect, useState } from 'react';
import Home from './components/Home.jsx';
import NewBill from './components/NewBill.jsx';
import BillPage from './components/BillPage.jsx';

export function parseHash(hash) {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'new') return { name: 'new' };
  const m = h.match(/^b\/([A-Za-z0-9]{4,16})$/);
  if (m) return { name: 'bill', id: m[1] };
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (route.name === 'home') document.title = 'Fair Share: split the receipt by who ate what';
    if (route.name === 'new') document.title = 'New bill · Fair Share';
  }, [route]);

  return (
    <>
      <a className="portfolio-pill" href="../../">
        <span aria-hidden="true">←</span> Portfolio
      </a>
      <header className="site-header">
        <a className="brand" href="#/">
          <span className="brand-mark" aria-hidden="true">
            ½
          </span>
          Fair Share
        </a>
        {route.name !== 'new' && (
          <a className="btn btn-small" href="#/new">
            New bill
          </a>
        )}
      </header>
      <main id="main" className="shell">
        {route.name === 'new' && <NewBill />}
        {route.name === 'bill' && <BillPage key={route.id} billId={route.id} />}
        {route.name === 'home' && <Home />}
      </main>
    </>
  );
}
