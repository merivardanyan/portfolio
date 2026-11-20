import { forwardRef, useId, useRef } from 'react';
import { hslToCss } from '../../core/index.js';
import { describeColor, hsToPoint, padKey, pointToHs } from '../lib/picker.js';
import styles from './ColorPicker.module.css';

const ColorPicker = forwardRef(function ColorPicker({ value, onChange, onSubmit }, padRef) {
  const ownRef = useRef(null);
  const ref = padRef ?? ownRef;
  const lightId = useId();
  const { h, s, l } = value;
  const point = hsToPoint(value);

  function fromPointer(e) {
    const rect = ref.current.getBoundingClientRect();
    onChange({ ...pointToHs(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height), l });
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    const next = padKey(e.key, value, e.shiftKey);
    if (next) {
      e.preventDefault();
      onChange({ ...next, l });
    }
  }

  return (
    <div className={styles.picker}>
      <div
        ref={ref}
        className={styles.pad}
        role="slider"
        tabIndex={0}
        aria-label="Hue (left and right) and saturation (up and down)"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={h}
        aria-valuetext={describeColor(value)}
        style={{ '--l': `${l}%` }}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
      >
        <span
          className={styles.thumb}
          style={{ left: `${point.x}%`, top: `${point.y}%`, background: hslToCss(value) }}
          aria-hidden="true"
        />
      </div>

      <div className={styles.lightRow}>
        <label htmlFor={lightId} className={styles.lightLabel}>
          Lightness
        </label>
        <input
          id={lightId}
          className={styles.light}
          type="range"
          min={0}
          max={100}
          step={1}
          value={l}
          aria-valuetext={`${l}%`}
          style={{ '--h': h, '--s': `${s}%` }}
          onChange={(e) => onChange({ h, s, l: Number(e.target.value) })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSubmit?.();
            }
          }}
        />
      </div>
    </div>
  );
});

export default ColorPicker;
