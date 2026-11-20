// Progressive enhancement: every form works without JS; this upgrades voting/upvoting to fetch().
const csrf = document.querySelector('meta[name="csrf-token"]')?.content ?? '';
const live = document.getElementById('live');
const announce = (msg) => { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); } };

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed (${res.status})`);
  return data;
}

function showError(form, message) {
  let p = form.querySelector('.error[data-js-error]');
  if (!p) {
    p = document.createElement('p');
    p.className = 'error';
    p.dataset.jsError = '';
    p.setAttribute('role', 'alert');
    form.append(p);
  }
  p.textContent = message;
}

// Voting
document.querySelectorAll('form[data-js="vote"]').forEach((form) => {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const verdict = ev.submitter?.value;
    if (!verdict) return;
    const buttons = form.querySelectorAll('button');
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const argument = form.querySelector('[name="argument"]')?.value ?? '';
      const data = await postJson(form.action, { verdict, argument });
      document.querySelector('[data-count="guilty"]').textContent = data.guilty;
      document.querySelector('[data-count="acquit"]').textContent = data.acquit;
      const total = data.guilty + data.acquit;
      const bar = document.querySelector('.split-lg .split-g');
      if (bar && total) bar.setAttribute('width', String(Math.round((data.guilty * 100) / total)));
      const card = document.getElementById('verdict-card');
      if (card) card.src = card.src.split('?')[0] + '?v=' + Date.now();
      const label = verdict === 'guilty' ? 'Guilty' : 'Not guilty';
      const p = document.createElement('p');
      p.className = 'your-vote';
      p.innerHTML = 'You voted <strong></strong>.';
      p.querySelector('strong').textContent = label;
      p.querySelector('strong').className = verdict === 'guilty' ? 'g' : 'a';
      form.replaceWith(p);
      announce(`Vote recorded: ${label}. Tally is ${data.guilty} guilty, ${data.acquit} not guilty.`);
      if (data.argument) setTimeout(() => location.reload(), 600);
    } catch (e) {
      showError(form, e.message);
      buttons.forEach((b) => { b.disabled = false; });
    }
  });
});

// Upvotes
document.querySelectorAll('form[data-js="upvote"]').forEach((form) => {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const data = await postJson(form.action, {});
      const span = document.createElement('span');
      span.className = 'mono upvotes';
      span.textContent = `▲ ${data.upvotes}`;
      form.replaceWith(span);
      announce(`Upvoted. ${data.upvotes} upvotes.`);
    } catch (e) {
      btn.disabled = false;
      announce(e.message);
    }
  });
});

// Copy link (made absolute here: without APP_URL the server only knows the path)
document.querySelectorAll('[data-js="copy"]').forEach((btn) => {
  const abs = new URL(btn.dataset.copy, location.href).href;
  btn.dataset.copy = abs;
  const field = document.getElementById('share-url');
  if (field) field.value = abs;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied!';
      announce('Link copied to clipboard');
      setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
    } catch {
      document.getElementById('share-url')?.select();
    }
  });
});

// Character counters
document.querySelectorAll('[data-counter-for]').forEach((out) => {
  const input = document.getElementById(out.dataset.counterFor);
  if (!input) return;
  const update = () => { out.textContent = String([...input.value].length); };
  input.addEventListener('input', update);
  update();
});
