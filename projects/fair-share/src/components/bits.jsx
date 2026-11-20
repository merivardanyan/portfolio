import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { formatMoney } from '../../core/index.js';
import { inkFor, initials } from '../lib/color.js';

export function Avatar({ person, size = 'md' }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ background: person.color, color: inkFor(person.color) }}
      aria-hidden="true"
    >
      {initials(person.name)}
    </span>
  );
}

export function Money({ cents, currency }) {
  return <span className="money">{formatMoney(cents, currency)}</span>;
}

const STATUS_TEXT = {
  idle: 'Offline',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline, changes will sync',
  live: 'Live',
  error: 'Unavailable',
};

export function StatusPill({ status }) {
  return (
    <span className={`status status-${status}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export function QrCode({ text, label }) {
  const { path, size } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
      }
    }
    return { path: d, size: n + 8 };
  }, [text]);

  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  );
}
