const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tween = (from, to, ms, fn) => {
  const t0 = performance.now();
  const tick = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); fn(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

/* ---- Hero: animated walkthrough (email -> understanding -> consequences -> model update) ---- */
(() => {
  const stage = $('#stage'), score = $('#score'), bar = $('#sbar'), pill = $('#pill'), dots = $('#dots'), cap = $('#cap'), pp = $('#pp');
  const caps = ['An email arrives', 'BESSMIND reads and understands it', 'It traces the consequences', 'The project model updates'];
  const hold = [2400, 2400, 2800, 4000];
  let cur = 0, timer = null, playing = !reduce, visible = true;
  caps.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Step ' + (i + 1) + ': ' + c); b.onclick = () => { go(i); restart(); }; dots.appendChild(b); });
  function setScore(v) { score.textContent = v; bar.style.width = v + '%'; }
  function go(n) {
    cur = n;
    if (n === 0) { stage.className = 'stage'; void stage.offsetWidth; }
    stage.className = 'stage ' + caps.map((_, i) => i <= n ? 's' + i : '').join(' ');
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === n));
    cap.textContent = caps[n];
    if (n >= 3) { pill.textContent = 'At risk'; reduce ? setScore(59) : tween(82, 59, 1000, setScore); }
    else { pill.textContent = 'On track'; setScore(82); }
  }
  function restart() { clearTimeout(timer); if (playing && visible) timer = setTimeout(() => { go((cur + 1) % caps.length); restart(); }, hold[cur]); }
  pp.onclick = () => { playing = !playing; pp.textContent = playing ? '❚❚' : '▶'; pp.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation'); restart(); };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; restart(); }).observe(stage);
  if (reduce) { pp.hidden = true; go(3); } else { go(0); restart(); }
})();

/* ---- Consequence tracer ---- */
(() => {
  const D = [
    { t: 'Grid connection date slips', s: 'Operator announces a later date', r: [['Schedule', 'Commissioning date moves; RTB timeline re-baselined'], ['Contract', 'Long-stop date and delay clauses flagged for review'], ['Filing', 'E1 / E8 forms marked for update'], ['People', 'Grid lead gets a task; owner is notified']] },
    { t: 'Supplier quote changes', s: 'New price in an email attachment', r: [['Budget', 'Cost deviation calculated against the plan'], ['Contract', 'Amendment needed before signing'], ['Financing', 'Model inputs flagged for the finance team'], ['People', 'Procurement lead gets a review task']] },
    { t: 'Permit condition revised', s: 'Authority adds a new requirement', r: [['Register', 'Permit register updated with the new condition'], ['Design', 'Construction plan checked against the condition'], ['Schedule', 'Impact on the building start estimated'], ['People', 'Permitting lead gets an assessment task']] }
  ];
  const pick = $('#tr-pick'), out = $('#tr-out');
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function show(i) {
    [...pick.children].forEach((b, k) => b.setAttribute('aria-selected', k === i));
    const d = D[i];
    out.className = 'tr-out';
    out.innerHTML = `<div class="trig">⚠ ${esc(d.t)}</div>` + d.r.map((r, k) => `<div class="rip" style="--i:${k + 1}"><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join('');
    void out.offsetWidth; out.className = 'tr-out go';
  }
  D.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.innerHTML = `${esc(d.t)}<small>${esc(d.s)}</small>`; b.onclick = () => show(i); pick.appendChild(b); });
  show(0);
})();

/* ---- Lifecycle tabs ---- */
(() => {
  const P = [
    { n: 'Planning', c: '#1b7fd0', bg: '#f3f9ff', m: ['Site selection', 'Permits & approvals', 'Grid connection application', 'Supplier & contract setup'], d: ['Land lease', 'Permit documents', 'Grid connection application', 'Supplier offers'], r: 'Grid connection date slips or permit conditions change late.' },
    { n: 'Building', c: '#e89c35', bg: '#fffaf1', m: ['Procurement', 'Construction', 'Testing & commissioning', 'Documentation'], d: ['Supplier contracts', 'Construction plans', 'Test reports', 'Handover documents'], r: 'Delivery delays and design changes ripple into commissioning.' },
    { n: 'Operation', c: '#169d76', bg: '#f2fbf7', m: ['Performance monitoring', 'Maintenance', 'Reporting', 'Lifecycle management'], d: ['Performance reports', 'Maintenance logs', 'Warranty documents', 'Grid operator reports'], r: 'Performance drifts and warranty or reporting deadlines are missed.' }
  ];
  const tabs = $('#tabs'), body = $('#life-body');
  const li = a => a.map(x => `<li>${x}</li>`).join('');
  function show(i) {
    const p = P[i];
    [...tabs.children].forEach((b, k) => b.setAttribute('aria-selected', k === i));
    body.style.setProperty('--c', p.c); body.style.setProperty('--bg', p.bg);
    body.innerHTML = `<div class="ms"><h3>MILESTONES</h3><ul>${li(p.m)}</ul></div><div><h3>KEY DOCUMENTS</h3><ul>${li(p.d)}</ul></div><div><h3>TYPICAL RISK</h3><p>${p.r}</p></div>`;
  }
  P.forEach((p, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = p.n; b.style.setProperty('--c', p.c); b.onclick = () => show(i); tabs.appendChild(b); });
  show(0);
})();

/* ---- Score count-up when visible ---- */
new IntersectionObserver((e, o) => {
  if (!e[0].isIntersecting) return; o.disconnect();
  const set = v => { $('#big').textContent = v; $('#bigbar').style.width = v + '%'; };
  reduce ? set(82) : tween(0, 82, 1400, set);
}, { threshold: .5 }).observe($('.score-card'));
