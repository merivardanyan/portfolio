// Colour-space conversions and CIEDE2000. Plain ESM, zero dependencies.
// Conventions:
//   HSL:   h 0-360 (wraps), s 0-100, l 0-100
//   RGB:   r/g/b 0-255 (gamma-encoded sRGB, may be fractional)
//   Lab:   CIE L*a*b*, D65 white point
//   OKLCH: l 0-1, c >= 0 (~0-0.37 in sRGB), h 0-360

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DEG = Math.PI / 180;

/** Normalise a hue to [0, 360). */
export function normalizeHue(h) {
  const r = h % 360;
  return r < 0 ? r + 360 : r;
}

/**
 * HSL to sRGB.
 * @returns {{r:number,g:number,b:number}} 0-255, fractional
 */
export function hslToRgb({ h, s, l }) {
  const hh = normalizeHue(h);
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const k = (n) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n) => ll - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
}

/** sRGB to HSL. */
export function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h = normalizeHue(h * 60);
  }
  return { h, s: s * 100, l: l * 100 };
}

/** `{r,g,b}` to `#rrggbb` (rounded, clamped). */
export function rgbToHex({ r, g, b }) {
  const to = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** `#rgb` / `#rrggbb` to `{r,g,b}`. Throws on malformed input. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new TypeError(`Invalid hex colour: ${hex}`);
  let v = m[1];
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** HSL to `#rrggbb`. */
export const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));

/** CSS `hsl()` string. */
export const hslToCss = ({ h, s, l }) => `hsl(${round(normalizeHue(h), 1)} ${round(s, 1)}% ${round(l, 1)}%)`;

function round(v, dp) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** sRGB channel (0-1) to linear light. */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light (0-1) to sRGB channel. */
export function linearToSrgb(c) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

// D65 reference white (CIE 1931 2 degree), Y normalised to 1.
const WHITE = { x: 0.95047, y: 1.0, z: 1.08883 };

/** sRGB (0-255) to CIE XYZ (D65, Y in 0-1). */
export function rgbToXyz({ r, g, b }) {
  const R = srgbToLinear(r / 255), G = srgbToLinear(g / 255), B = srgbToLinear(b / 255);
  return {
    x: 0.4124564 * R + 0.3575761 * G + 0.1804375 * B,
    y: 0.2126729 * R + 0.7151522 * G + 0.072175 * B,
    z: 0.0193339 * R + 0.119192 * G + 0.9503041 * B,
  };
}

/** CIE XYZ to CIE L*a*b* (D65). */
export function xyzToLab({ x, y, z }) {
  const e = 216 / 24389, k = 24389 / 27;
  const f = (t) => (t > e ? Math.cbrt(t) : (k * t + 16) / 116);
  const fx = f(x / WHITE.x), fy = f(y / WHITE.y), fz = f(z / WHITE.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** sRGB to Lab. */
export const rgbToLab = (rgb) => xyzToLab(rgbToXyz(rgb));

/** HSL to Lab. This is what scoring uses. */
export const hslToLab = (hsl) => rgbToLab(hslToRgb(hsl));

/** Linear sRGB (0-1) to OKLab. */
function linearRgbToOklab(R, G, B) {
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** sRGB (0-255) to OKLCH. */
export function rgbToOklch({ r, g, b }) {
  const { L, a, b: bb } = linearRgbToOklab(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
  const c = Math.hypot(a, bb);
  return { l: L, c, h: c < 1e-7 ? 0 : normalizeHue(Math.atan2(bb, a) / DEG) };
}

/**
 * OKLCH to sRGB (0-255). Out-of-gamut colours are brought into gamut by
 * reducing chroma (binary search) so hue and lightness are preserved.
 * @returns {{r:number,g:number,b:number, clipped:boolean}}
 */
export function oklchToRgb({ l, c, h }) {
  const toLinear = (C) => {
    const a = C * Math.cos(h * DEG), b = C * Math.sin(h * DEG);
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
      -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
      -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
  };
  const inGamut = (v) => v.every((x) => x >= -1e-6 && x <= 1 + 1e-6);
  let lin = toLinear(c);
  let clipped = false;
  if (!inGamut(lin)) {
    clipped = true;
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(toLinear(mid))) lo = mid; else hi = mid;
    }
    lin = toLinear(lo);
  }
  const [R, G, B] = lin.map((x) => clamp(linearToSrgb(clamp(x, 0, 1)) * 255, 0, 255));
  return { r: R, g: G, b: B, clipped };
}

/**
 * CIEDE2000 colour difference (Sharma, Wu, Dalal 2005), kL = kC = kH = 1.
 * ~1 is a just-noticeable difference; > 50 is "a different colour".
 * @param {{L:number,a:number,b:number}} lab1
 * @param {{L:number,a:number,b:number}} lab2
 */
export function deltaE2000(lab1, lab2) {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (b, ap) => (b === 0 && ap === 0 ? 0 : normalizeHue(Math.atan2(b, ap) / DEG));
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }
  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * DEG)
    + 0.24 * Math.cos(2 * hbarp * DEG)
    + 0.32 * Math.cos((3 * hbarp + 6) * DEG)
    - 0.2 * Math.cos((4 * hbarp - 63) * DEG);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * DEG) * Rc;
  const tl = dLp / Sl, tc = dCp / Sc, th = dHp / Sh;
  return Math.sqrt(tl * tl + tc * tc + th * th + Rt * tc * th);
}

/** ΔE2000 between two HSL colours. */
export const deltaEHsl = (a, b) => deltaE2000(hslToLab(a), hslToLab(b));
