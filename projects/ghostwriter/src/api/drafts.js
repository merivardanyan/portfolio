const KEY = 'ghostwriter:draft:v1';

export function saveDraft(draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage full or disabled: drafts are best-effort */
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
