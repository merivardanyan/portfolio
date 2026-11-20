export function diffEdit(prev, next, caret) {
  const growth = next.length - prev.length;
  let limit = Math.min(prev.length, next.length);
  if (Number.isInteger(caret) && caret >= 0) {
    limit = Math.min(limit, Math.max(0, caret - Math.max(0, growth)));
  }
  let start = 0;
  while (start < limit && prev.charCodeAt(start) === next.charCodeAt(start)) start++;

  let endPrev = prev.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
  ) {
    endPrev--;
    endNext--;
  }

  if (start > 0 && isLowSurrogate(next.charCodeAt(start)) && isHighSurrogate(next.charCodeAt(start - 1))) {
    start--;
  }
  if (endNext < next.length && isLowSurrogate(next.charCodeAt(endNext))) {
    endNext++;
    endPrev++;
  }

  return {
    pos: start,
    removed: endPrev - start,
    inserted: next.slice(start, endNext),
  };
}

function isHighSurrogate(c) {
  return c >= 0xd800 && c <= 0xdbff;
}

function isLowSurrogate(c) {
  return c >= 0xdc00 && c <= 0xdfff;
}
