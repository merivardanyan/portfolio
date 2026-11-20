import { useEffect, useState } from 'react';

const query = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia(query).matches;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
