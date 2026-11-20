const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapHue = (h) => ((h % 360) + 360) % 360;

export function pointToHs(x, y, width, height) {
  return {
    h: Math.round(clamp(x / width, 0, 1) * 359),
    s: Math.round((1 - clamp(y / height, 0, 1)) * 100),
  };
}

export function hsToPoint({ h, s }) {
  return { x: (wrapHue(h) / 359) * 100, y: (1 - s / 100) * 100 };
}

export function padKey(key, { h, s }, big = false) {
  const hStep = big ? 15 : 2;
  const sStep = big ? 10 : 2;
  switch (key) {
    case 'ArrowLeft':
      return { h: wrapHue(h - hStep), s };
    case 'ArrowRight':
      return { h: wrapHue(h + hStep), s };
    case 'ArrowUp':
      return { h, s: clamp(s + sStep, 0, 100) };
    case 'ArrowDown':
      return { h, s: clamp(s - sStep, 0, 100) };
    case 'PageUp':
      return { h, s: clamp(s + 20, 0, 100) };
    case 'PageDown':
      return { h, s: clamp(s - 20, 0, 100) };
    case 'Home':
      return { h: 0, s };
    case 'End':
      return { h: 359, s };
    default:
      return null;
  }
}

const HUE_NAMES = [
  [15, 'red'], [45, 'orange'], [70, 'yellow'], [150, 'green'], [190, 'cyan'],
  [255, 'blue'], [290, 'purple'], [335, 'pink'], [360, 'red'],
];

export function describeColor({ h, s, l }) {
  const hue = HUE_NAMES.find(([max]) => wrapHue(h) < max)[1];
  const tone = s < 12 ? 'grey' : hue;
  const light = l < 30 ? 'dark ' : l > 70 ? 'light ' : '';
  return `${light}${tone}, hue ${Math.round(h)} degrees, saturation ${Math.round(s)}%, lightness ${Math.round(l)}%`;
}
