const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tween = (a, b, ms, fn) => { const t0 = performance.now(); const f = t => { const k = Math.min(1, (t - t0) / ms); fn(Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); };

/* Hero: live change pipeline */
(() => {
  const con = $('#con'), lis = [...document.querySelectorAll('#steps li')], dots = $('#dots'), pp = $('#pp'), N = lis.length;
  const cod = $('#c-cod'), risk = $('#c-risk'), task = $('#c-task');
  let n = 0, timer = null, playing = !reduce, visible = true;
  lis.forEach((_, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Step ' + (i + 1)); b.onclick = () => { go(i); restart(); }; dots.appendChild(b); });
  function go(k) {
    n = k;
    lis.forEach((l, i) => l.className = i < k ? 'done' : i === k ? 'on' : '');
    con.classList.toggle('con-2', k >= 1);
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === k));
    const upd = k >= 4;
    cod.textContent = upd ? 'Q1 2028' : 'Q3 2027'; cod.classList.toggle('hot', upd);
    risk.classList.toggle('hot', upd); task.classList.toggle('hot', k >= 5);
    if (upd) tween(34, 54, reduce ? 0 : 800, v => risk.textContent = v + '%'); else risk.textContent = '34%';
    task.textContent = k >= 5 ? '3' : '1';
  }
  function restart() { clearTimeout(timer); if (!playing || !visible) return; timer = setTimeout(() => { if (n >= N) go(0); else go(n + 1); restart(); }, n >= N - 1 ? 4200 : 1500); }
  pp.onclick = () => { playing = !playing; pp.textContent = playing ? 'Pause' : 'Play'; restart(); };
  new IntersectionObserver(e => { visible = e[0].isIntersecting; restart(); }).observe(con);
  if (reduce) { pp.hidden = true; go(N - 1); } else { go(0); restart(); }
})();

/* Domino effect */
(() => {
  const D = [
    { t: 'Grid connection delayed', c: [['Trigger', 'Grid connection +123 days', 'Grid operator email, 08:42'], ['Schedule', 'COD Q3 2027 → Q1 2028', 'Timeline shifts automatically'], ['EPC', 'Commissioning window moves', 'Contractor flagged'], ['Financing', 'Long-stop date at risk', 'Drawdown schedule flagged'], ['Revenue', 'About €9.3M delayed', 'Illustrative, 200 MW'], ['Filings', 'E1 connection date outdated', 'Pre-filled update ready'], ['Actions', '3 tasks assigned', 'Grid lead, EPC lead, finance']] },
    { t: 'Supplier price changes', c: [['Trigger', 'Supplier quote updated', 'Email attachment, rev. 2'], ['Budget', 'Deviation vs plan calculated', 'Cost model flagged'], ['Contract', 'Amendment required', 'Before signature'], ['Delivery', 'Delivery +3 weeks', 'Procurement row shifts'], ['Schedule', 'COD Q3 → Q4 2027', 'Dependent rows follow'], ['Financing', 'Model inputs outdated', 'Finance team notified'], ['Actions', '2 tasks assigned', 'Procurement lead, finance']] },
    { t: 'Permit condition revised', c: [['Trigger', 'New noise condition at night', 'Permit conditions v3'], ['Register', 'Permit register updated', 'Condition 7 added'], ['Design', 'Layout check required', 'Container placement'], ['Construction', 'Plan needs adjusting', 'Start date at risk'], ['Schedule', 'Impact on building start', 'Estimated from timeline'], ['Filings', 'Application annex to update', 'Pre-filled for review'], ['Actions', '2 tasks assigned', 'Permitting lead, EPC']] }
  ];
  const scn = $('#scn'), chain = $('#chain');
  function show(i) {
    [...scn.children].forEach((b, k) => b.setAttribute('aria-selected', k === i));
    chain.className = 'chain';
    chain.innerHTML = D[i].c.map((c, k) => `<div class="nd ${k === 0 ? 'trig' : ''}" style="--i:${k}"><small>${esc(c[0])}</small><b>${esc(c[1])}</b><span>${esc(c[2])}</span></div>`).join('');
    void chain.offsetWidth; chain.className = 'chain go';
  }
  D.forEach((d, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = d.t; b.onclick = () => show(i); scn.appendChild(b); });
  show(0);
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); const cur = [...scn.children].findIndex(b => b.getAttribute('aria-selected') === 'true'); show(cur < 0 ? 0 : cur); } }, { threshold: .35 }).observe(chain);
})();

/* Living project model */
(() => {
  const F = [['Grid', 'Connection 28 May 2027', '+14 days vs agreement'], ['Schedule', 'COD Q4 2027', '5 dependent rows'], ['Permits', '7 conditions', '1 new today'], ['Contracts', '2 drafts open', 'Supplier v4 current'], ['Suppliers', 'Quote rev. 2', 'Delivery +3 weeks'], ['Costs', 'Deviation flagged', 'Review required'], ['Tasks', '5 open', '2 created today'], ['Risks', '54% elevated', 'Grid, schedule'], ['Filings', 'E1 draft', '5 of 6 fields filled']];
  const el = $('#facets'), note = $('#pulse-note');
  el.innerHTML = F.map(f => `<div><small>${f[0]}</small><b>${f[1]}</b><span>${f[2]}</span></div>`).join('');
  const tiles = [...el.children], order = [0, 1, 3, 7, 6, 8];
  let k = 0, timer = null;
  function pulse() {
    tiles.forEach(t => t.classList.remove('hit'));
    const i = order[k++ % order.length]; tiles[i].classList.add('hit');
    note.textContent = F[i][0].toUpperCase() + ' · UPDATED JUST NOW';
  }
  new IntersectionObserver(e => { clearInterval(timer); if (e[0].isIntersecting && !reduce) { pulse(); timer = setInterval(pulse, 1900); } else if (e[0].isIntersecting) pulse(); }, { threshold: .3 }).observe(el);
})();

/* Provenance card */
(() => {
  const card = $('#prov');
  new IntersectionObserver((e, o) => { if (!e[0].isIntersecting) return; o.disconnect(); card.classList.add('in'); const set = v => $('#big').textContent = v; reduce ? set(82) : tween(0, 82, 1300, set); }, { threshold: .4 }).observe(card);
})();
