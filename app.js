// BESSMIND demo app — state, views and a rule-based message analyzer.
// Step 2 will replace analyze() with a real AI call through a backend.
const KEY = 'bessmind-demo-v1';
const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };

const RTB = ['Site secured', 'Permits approved', 'Grid connection confirmed', 'Supplier contract signed', 'Financing in place'];
function seed() {
  const h = 3600000, n = Date.now();
  const mk = (id, name, phase, rtb, done) => ({ id, name, phase, rtb, done });
  return {
    projects: [mk('heide', 'BESS Heide', 'Planning', 82, 4), mk('nord', 'BESS Nord', 'Building', 56, 3), mk('sued', 'BESS Süd', 'Planning', 91, 5),
      mk('west', 'BESS West', 'Operation', 96, 5), mk('ost', 'BESS Ost', 'Building', 48, 2)],
    changes: [
      { t: n - 2 * h, p: 'nord', text: 'Supplier quote updated', src: 'Email' },
      { t: n - 4 * h, p: 'nord', text: 'Permit condition revised', src: 'SharePoint' },
      { t: n - 6 * h, p: 'west', text: 'Grid connection document added', src: 'Files' }],
    tasks: [{ id: 1, p: 'ost', text: 'Confirm transformer delivery date', done: false }, { id: 2, p: 'heide', text: 'Review E1 form draft', done: false }],
    docs: [{ p: 'west', name: 'Grid connection agreement.pdf', src: 'Files' }, { p: 'nord', name: 'Permit conditions v3.pdf', src: 'SharePoint' },
      { p: 'heide', name: 'Supplier quote 2026-09.xlsx', src: 'Email' }, { p: 'sued', name: 'Site lease.pdf', src: 'Files' }],
    nextId: 3
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { S = seed(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const proj = id => S.projects.find(p => p.id === id);
const status = p => p.rtb < 60 ? 'At risk' : 'On track';

// Rules: keyword -> what changed, consequences, RTB effect, follow-up task, optional document.
const RULES = [
  { re: /delay|postpon|verschob|verzög/i, what: 'Schedule change', delta: -8, task: 'Re-baseline the project schedule',
    cons: ['Delivery and commissioning dates shift', 'Check contract penalty and delay clauses', 'Inform grid operator if connection date is affected'] },
  { re: /quote|price|angebot|preis|cost/i, what: 'Supplier price change', delta: -3, task: 'Review updated supplier quote against budget',
    cons: ['Project budget needs re-checking', 'Supplier contract terms may need an amendment'] },
  { re: /permit|genehmig|auflage|condition|approval/i, what: 'Permit condition change', delta: -5, task: 'Assess new permit condition with the permitting lead',
    cons: ['Permit register must be updated', 'Construction plan may need adjusting'] },
  { re: /grid|netz|\bE1\b|\bE8\b|connection/i, what: 'Grid connection update', delta: 4, task: 'Review pre-filled E1/E8 form and confirm', doc: 'Grid connection correspondence.pdf',
    cons: ['Grid connection milestone moves forward', 'E1/E8 forms can be pre-filled for review'] }
];

function analyze(text, selected) {
  const p = proj(selected !== 'auto' ? selected : (S.projects.find(x => text.toLowerCase().includes(x.name.toLowerCase()) || text.toLowerCase().includes(x.name.split(' ')[1].toLowerCase())) || {}).id);
  if (!p) return { error: 'No project found in the message. Choose a project from the list and try again.' };
  const hits = RULES.filter(r => r.re.test(text));
  if (!hits.length) return { error: 'No known change type found (delay, quote, permit, grid). Add more detail or rephrase.' };
  const out = { p, hits: [] };
  hits.forEach(r => {
    p.rtb = Math.max(0, Math.min(100, p.rtb + r.delta));
    S.changes.unshift({ t: Date.now(), p: p.id, text: r.what, src: 'Email' });
    S.tasks.unshift({ id: S.nextId++, p: p.id, text: r.task, done: false });
    if (r.doc) S.docs.unshift({ p: p.id, name: r.doc, src: 'Email' });
    out.hits.push(r);
  });
  save();
  return out;
}

const SAMPLES = ['Supplier quote for BESS Nord updated: new price +4%, delivery postponed by 3 weeks.',
  'Permit condition revised for BESS Heide: new noise limit applies at night.',
  'Grid operator confirmed connection point for BESS Süd, E1 form attached.'];
let si = 0, view = 'portfolio';

function render() {
  $('#task-count').textContent = S.tasks.filter(t => !t.done).length || '';
  $('#proj-select').innerHTML = '<option value="auto">Detect from message</option>' + S.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const m = $('#main');
  if (view === 'portfolio') {
    const ready = S.projects.filter(p => p.rtb >= 90).length, risk = S.projects.filter(p => p.rtb < 60).length, tot = S.projects.length;
    m.innerHTML = `<h1>Portfolio overview</h1>
    <div class="metrics-lg"><div><small>Total projects</small><b>${tot}</b></div>
      <div><small>Ready to build</small><b>${ready}</b><span>${Math.round(ready / tot * 100)}%</span></div>
      <div class="risk"><small>At risk</small><b>${risk}</b><span>${Math.round(risk / tot * 100)}%</span></div>
      <div><small>On track</small><b>${tot - risk}</b><span>${Math.round((tot - risk) / tot * 100)}%</span></div></div>
    <div class="cols"><div class="card"><h2>Projects</h2><table><tr><th>Project</th><th>Phase</th><th>Status</th><th>RTB probability</th></tr>
    ${S.projects.map(p => `<tr class="row-btn" tabindex="0" data-p="${p.id}"><td><b>${esc(p.name)}</b></td><td><span class="pill ${p.phase}">${p.phase}</span></td>
      <td class="${status(p) === 'At risk' ? 'warn' : 'ok'}">${status(p)}</td><td><span class="bar"><i class="${p.rtb < 60 ? 'warn' : ''}" style="width:${p.rtb}%"></i></span>${p.rtb}%</td></tr>`).join('')}</table></div>
    <div class="card"><h2>Latest changes</h2><ul class="feed">${S.changes.slice(0, 6).map(c => `<li><b>${esc(c.text)}</b><small>${esc(proj(c.p).name)} · ${c.src} · ${ago(c.t)}</small></li>`).join('')}</ul>
    <div class="digest">Today's digest<br>${S.changes.length} changes across ${new Set(S.changes.map(c => c.p)).size} projects</div></div></div>`;
  } else if (view === 'tasks') {
    m.innerHTML = `<h1>Tasks</h1><div class="card">${S.tasks.length ? S.tasks.map(t => `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-t="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}<small>${esc(proj(t.p).name)}</small></span></label>`).join('') : 'No tasks yet. Process a message to create one.'}</div>`;
  } else {
    m.innerHTML = `<h1>Documents</h1><div class="card"><table><tr><th>Document</th><th>Project</th><th>Source</th></tr>${S.docs.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(proj(d.p).name)}</td><td>${d.src}</td></tr>`).join('')}</table></div>`;
  }
}

function openDrawer(id) {
  const p = proj(id), d = $('#drawer');
  d.innerHTML = `<div role="dialog" aria-label="${esc(p.name)}"><button class="text-btn" id="close">Close ✕</button><h2>${esc(p.name)}</h2><p>${p.phase} · RTB probability ${p.rtb}%</p>
    <h3>Ready-to-build checklist</h3><ul>${RTB.map((r, i) => `<li class="${i < p.done ? '' : 'open'}">${r}</li>`).join('')}</ul>
    <h3>Recent changes</h3><ul class="feed">${S.changes.filter(c => c.p === id).slice(0, 5).map(c => `<li>${esc(c.text)}<small>${c.src} · ${ago(c.t)}</small></li>`).join('') || '<li>None yet</li>'}</ul></div>`;
  d.hidden = false; $('#close').focus();
}

document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; document.querySelectorAll('.side button').forEach(b => b.classList.toggle('active', b === v)); render(); }
  const r = e.target.closest('[data-p]'); if (r) openDrawer(r.dataset.p);
  if (e.target.id === 'close' || e.target.id === 'drawer') $('#drawer').hidden = true;
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $('#drawer').hidden = true;
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.p) openDrawer(e.target.dataset.p);
});
document.addEventListener('change', e => { if (e.target.dataset.t) { S.tasks.find(t => t.id == e.target.dataset.t).done = e.target.checked; save(); render(); } });
$('#sample').onclick = () => { $('#msg').value = SAMPLES[si++ % SAMPLES.length]; $('#proj-select').value = 'auto'; };
$('#reset').onclick = () => { S = seed(); save(); $('#result').innerHTML = ''; render(); };
$('#analyze').onclick = () => {
  const text = $('#msg').value.trim(), box = $('#result');
  if (!text) { box.innerHTML = '<p>Paste a message first.</p>'; return; }
  const r = analyze(text, $('#proj-select').value);
  if (r.error) { box.innerHTML = `<p>${esc(r.error)}</p>`; return; }
  box.innerHTML = `<div class="result"><b>${esc(r.p.name)} updated</b>${r.hits.map(h => `<p><b>${h.what}</b> (RTB ${h.delta > 0 ? '+' : ''}${h.delta}%)</p><ul>${h.cons.map(c => `<li>${c}</li>`).join('')}</ul><p>New task: ${esc(h.task)}</p>`).join('')}</div>`;
  $('#msg').value = ''; render();
};
render();
