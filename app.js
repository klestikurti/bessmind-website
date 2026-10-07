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

// ---- Message reader ----
// 1) splits the message by project  2) classifies each sentence  3) extracts dates and requests
// 4) updates RTB, milestones, tasks and the change feed. Step 3 of the roadmap swaps this for an AI model.
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Januar|Februar|März|Mai|Juni|Juli|Oktober|Dezember';
const DATE_SRC = '\\d{1,2}\\.?\\s+(?:' + MONTHS + ')\\s+\\d{4}|(?:' + MONTHS + ')\\s+\\d{4}|Q[1-4]\\s+\\d{4}';
const DATE_RE = new RegExp('\\b(?:' + DATE_SRC + ')\\b', 'gi');
const dates = s => s.match(DATE_RE) || [];
const names = p => p.name + '|' + p.name.replace(/^BESS\s+/i, '');
const mentions = s => S.projects.filter(p => new RegExp('\\b(?:' + names(p) + ')\\b', 'i').test(s));

const REQ = /\bplease\s+(?:send|provide|confirm|submit|share|check|review)\b|\b(?:we|i)\s+(?:only\s+)?(?:require|need)\b|\boutstanding\b|\bbitte\s+(?:senden|schicken)/i;
const FIND = [
  { re: /no longer (?:be )?(?:achievable|possible|feasible|realistic)|cannot be (?:met|achieved)|not (?:achievable|possible)|nicht mehr (?:möglich|erreichbar)/i,
    type: 'risk', title: 'Planned date no longer achievable', delta: -18, task: 'Re-baseline schedule and agree a new connection date',
    cons: ['Schedule and RTB timeline shift', 'Check contract, financing and offtake deadlines', 'Inform stakeholders of the new date'] },
  { re: /constraint|\bN-1\b|overload|congestion|bottleneck|engpass/i,
    type: 'risk', title: 'Grid constraint identified', delta: -5,
    cons: ['Usable capacity or operating mode may be reduced', 'Revenue case needs re-checking'] },
  { re: /delay|postpon|pushed back|slipp|verschob|verzög/i,
    type: 'risk', title: 'Delay reported', delta: -8, task: 'Assess delay impact on the schedule',
    cons: ['Delivery and commissioning dates shift', 'Check contract delay clauses'] },
  { re: /\b(?:revised|revise|redesign|rework)\b/i, also: /protection|concept|design|settings|calculation|study/i,
    type: 'risk', title: 'Technical design needs revision', delta: -3, task: 'Revise the design with engineering and resubmit',
    cons: ['Engineering documents need updating', 'Grid operator must review the revised concept'] },
  { re: /quote|price|angebot|preis/i, also: /increase|higher|rise|\+\s?\d|updated|revised|erhöh/i,
    type: 'risk', title: 'Supplier price change', delta: -3, task: 'Review updated supplier quote against budget',
    cons: ['Budget needs re-checking', 'Supplier contract may need an amendment'] },
  { re: /permit|genehmig|auflage/i, also: /condition|revised|new|auflage/i,
    type: 'risk', title: 'Permit condition change', delta: -5, task: 'Assess the permit condition with the permitting lead',
    cons: ['Permit register must be updated', 'Construction plan may need adjusting'] },
  { re: /(?:assessing|evaluating|exploring|investigating|considering)\b[^.]*\b(?:whether|if)\b|temporary/i,
    type: 'info', title: 'Mitigation option being assessed', delta: 0, task: 'Follow up on the mitigation assessment',
    cons: ['An earlier connection might be possible with reduced capacity'] },
  { re: /\bE1\b|\bE8\b/, type: 'info', title: 'E1/E8 grid form involved', delta: 0, task: 'Review pre-filled E1/E8 form and confirm',
    cons: ['Form can be pre-filled for review'] },
  { re: /(?:remains|is|are|still)\s+(?:technically\s+)?(?:feasible|on track|targeted|confirmed|approved|achievable)|as planned|on schedule|\bapproved\b|\bconfirmed\b|genehmigt/i,
    type: 'ok', title: 'Confirmed or on plan', delta: 2 }
];
const MILE = [{ kw: /connection agreement/i, title: 'Connection agreement expected' }, { kw: /energi[sz]ation|commissioning|go-live/i, title: 'Energisation target' }];

function taskFrom(s, p) {
  const n = names(p);
  let t = s.replace(/[.!]+$/, '').replace(new RegExp('^for\\s+(?:' + n + ')\\s*,\\s*', 'i'), '');
  const need = t.match(/\b(?:we|i)\s+(?:only\s+)?(?:require|need)\s+(.*)$/i);
  if (need) t = 'Provide ' + need[1];
  t = t.replace(/^please\s+/i, '').replace(new RegExp('\\s+for\\s+(?:' + n + ')\\b', 'i'), '');
  const due = dates(t)[0] || null;
  t = t.replace(new RegExp('\\s+by\\s+(?:' + DATE_SRC + ')', 'i'), '');
  return { text: t.charAt(0).toUpperCase() + t.slice(1), due };
}

function readSentence(s, p, res) {
  const r = res.get(p.id) || { p, before: p.rtb, findings: [] };
  res.set(p.id, r);
  const add = f => { if (!r.findings.some(x => x.title === f.title)) r.findings.push(f); };
  if (REQ.test(s)) { const t = taskFrom(s, p); add({ type: 'action', title: t.text, due: t.due, ev: s, taskText: t.text, delta: 0 }); return; }
  const d = dates(s);
  FIND.forEach(f => {
    if (!f.re.test(s) || (f.also && !f.also.test(s))) return;
    let detail = '';
    if (f.type === 'risk' && d.length) detail = /previous/i.test(s) && d.length > 1 ? `${d[0]} expected; ${d[1]} was planned` : d.join(', ');
    add({ ...f, ev: s, detail, taskText: f.task });
  });
  s.split(/,|;|\bwith\b|\bwhile\b/).forEach(c => MILE.forEach(m => {
    const cd = dates(c)[0];
    if (m.kw.test(c) && cd) add({ type: 'milestone', title: m.title, detail: cd, ev: s, delta: 0 });
  }));
}

function analyze(text, selected) {
  const forced = selected !== 'auto' ? proj(selected) : null, res = new Map();
  let seen = false;
  text.split(/\n+/).forEach(line => {
    let cur = forced;
    line.split(/(?<=[.!?])\s+/).forEach(sent => {
      const m = forced ? [forced] : mentions(sent);
      if (m.length > 1) return;                 // statement about several projects: skip
      if (m.length === 1) { cur = m[0]; seen = true; }
      if (cur) readSentence(sent.trim(), cur, res);
    });
  });
  if (!seen && !forced) return { error: 'No project name found in the message. Choose a project from the list and try again.' };
  const results = [...res.values()].filter(r => r.findings.length);
  if (!results.length) return { error: 'Project found, but no recognizable change, date or request. Add more detail or rephrase.' };
  results.forEach(r => {
    const p = r.p; let okUsed = false;
    r.findings.forEach(f => {
      if (f.type === 'ok') { if (okUsed) f.delta = 0; okUsed = true; }
      p.rtb = Math.max(0, Math.min(100, p.rtb + (f.delta || 0)));
      S.changes.unshift({ t: Date.now(), p: p.id, text: f.title, src: 'Email', ev: f.ev });
      if (f.type === 'milestone' || (f.type === 'risk' && f.detail)) { p.milestones = p.milestones || []; p.milestones.unshift({ label: f.title, date: f.detail }); }
      if (f.taskText && !S.tasks.some(t => !t.done && t.p === p.id && t.text === f.taskText))
        S.tasks.unshift({ id: S.nextId++, p: p.id, text: f.taskText, due: f.due || null, done: false });
    });
  });
  save();
  return { results };
}

const SAMPLES = [
  'Dear Mr. Schneider,\nFor BESS Heide, the 200 MW configuration creates a thermal constraint under N-1. The required reinforcement is now expected by 31 October 2027, so the previously discussed 30 June 2027 connection date is no longer achievable.\nFor BESS Nord, the assessment is progressing as planned. The protection concept needs to be revised. We expect the connection agreement by February 2027, with energisation still targeted for Q3 2027.\nPlease send the outstanding PCS data for Heide by 15 November 2026.',
  'Permit condition revised for BESS Heide: new noise limit applies at night.',
  'Supplier quote for BESS Nord updated: new price +4%, delivery postponed by 3 weeks.'
];

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
    m.innerHTML = `<h1>Tasks</h1><div class="card">${S.tasks.length ? S.tasks.map(t => `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-t="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}<small>${esc(proj(t.p).name)}${t.due ? ' · due ' + esc(t.due) : ''}</small></span></label>`).join('') : 'No tasks yet. Process a message to create one.'}</div>`;
  } else {
    m.innerHTML = `<h1>Documents</h1><div class="card"><table><tr><th>Document</th><th>Project</th><th>Source</th></tr>${S.docs.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(proj(d.p).name)}</td><td>${d.src}</td></tr>`).join('')}</table></div>`;
  }
}

function openDrawer(id) {
  const p = proj(id), d = $('#drawer');
  d.innerHTML = `<div role="dialog" aria-label="${esc(p.name)}"><button class="text-btn" id="close">Close ✕</button><h2>${esc(p.name)}</h2><p>${p.phase} · RTB probability ${p.rtb}%</p>
    <h3>Ready-to-build checklist</h3><ul>${RTB.map((r, i) => `<li class="${i < p.done ? '' : 'open'}">${r}</li>`).join('')}</ul>
    <h3>Milestones</h3><ul class="feed">${(p.milestones || []).slice(0, 6).map(m => `<li>${esc(m.label)}<small>${esc(m.date || '')}</small></li>`).join('') || '<li>None yet</li>'}</ul>
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
  const ICON = { risk: '⚠', ok: '✓', action: '☐', info: 'ℹ', milestone: '◷' };
  box.innerHTML = r.results.map(x => `<div class="result"><b>${esc(x.p.name)}</b> · RTB ${x.before}% → ${x.p.rtb}% · <span class="${status(x.p) === 'At risk' ? 'warn' : 'ok'}">${status(x.p)}</span>
    <ul class="fl">${x.findings.map(f => `<li><b>${ICON[f.type]} ${esc(f.title)}</b>${f.detail ? ' — ' + esc(f.detail) : ''}${f.due ? ' (due ' + esc(f.due) + ')' : ''}
    ${f.cons ? '<ul>' + f.cons.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>' : ''}<em>“${esc(f.ev.slice(0, 110))}${f.ev.length > 110 ? '…' : ''}”</em></li>`).join('')}</ul></div>`).join('');
  $('#msg').value = ''; render();
};
render();
