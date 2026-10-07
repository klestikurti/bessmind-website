// BESSMIND demo — sample data lives only in your browser. The message reader below is rule-based;
// the full product replaces it with an AI model.
const KEY = 'bessmind-demo-v3', H = 3600000;
const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEPS = [['Site selection','Planning'],['Permits & approvals','Planning'],['Grid connection application','Planning'],['Supplier & contract setup','Planning'],['Procurement','Building'],['Construction','Building'],['Testing & commissioning','Building'],['Documentation','Building'],['Performance monitoring','Operation'],['Maintenance','Operation'],['Reporting','Operation'],['Lifecycle management','Operation']];
const PEOPLE = [['Lena Hartmann','Nordwind Development','Signed the lease option','3 days ago'],['Jonas Weber','Brandt & Partner (legal)','Filed a permit amendment','2 days ago'],['Mira Köhler','Nordwind Development','Updated the grid application','5 h ago'],['Tobias Lang','CellForm Systems','Sent a revised quote','2 h ago'],['Ayşe Demir','CellForm Systems','Confirmed a delivery slot','1 day ago'],['Felix Ritter','Ritter Bau GmbH','Uploaded a site report','4 days ago'],['Nora Fischer','Voltgrid Commissioning','Scheduled the FAT','1 day ago'],['Paul Zimmer','Nordwind Development','Compiled the handover pack','6 days ago'],['Eva Lindner','Nordwind Asset Mgmt','Reviewed the KPI report','2 days ago'],['Ben Albrecht','Voltgrid Service','Logged a maintenance visit','3 days ago'],['Clara Vogt','Nordwind Asset Mgmt','Sent the monthly report','1 week ago'],['Max Brenner','Nordwind Asset Mgmt','Updated the lifecycle plan','2 weeks ago']];
const FX = [['Permits','Permit notice (BImSchG).pdf'],['Grid connection','Grid connection application v2.pdf'],['Supplier contract','Supplier contract draft v4.docx'],['Financing','Financing term sheet.pdf']];

const TR = { heide: [70,73,76,78,80], nord: [72,70,66,62,58], sued: [80,83,85,88,90], west: [94,95,95,96,96], ost: [60,58,55,52,50] };
function seed() {
  const n = Date.now();
  const P = (id, name, phase, rtb, done, lon, lat, mw, kv, cp, cod, city, f) => ({ id, name, phase, rtb, done, lon, lat, mw, kv, cp, cod, city, f, milestones: [], trend: TR[id] });
  const D = (p, name, ver, cur, src, date) => ({ p, name, ver, cur, src, date });
  return {
    projects: [
      P('heide', 'BESS Heide', 'Planning', 82, 3, 9.1, 54.2, 200, 110, null, 'Q3 2027', 'Heide, Schleswig-Holstein', ['ok','ok','open','none']),
      P('nord', 'BESS Nord', 'Building', 56, 5, 8.1, 53.5, 120, 110, 'UW Nord', 'Q3 2027', 'Wilhelmshaven, Niedersachsen', ['ok','open','ok','ok']),
      P('sued', 'BESS Süd', 'Planning', 91, 4, 11.7, 48.4, 80, 110, 'UW Freising', 'Q1 2027', 'Freising, Bayern', ['ok','ok','ok','ok']),
      P('west', 'BESS West', 'Operation', 96, 9, 6.6, 51.1, 150, 220, 'UW Grevenbroich', 'In operation', 'Grevenbroich, NRW', ['ok','ok','ok','ok']),
      P('ost', 'BESS Ost', 'Building', 48, 4, 14.3, 51.8, 100, 110, null, 'Q4 2027', 'Cottbus, Brandenburg', ['open','open','open','none'])],
    changes: [
      { t: n - 2 * H, p: 'nord', text: 'Supplier quote updated', src: 'Email', ev: 'Quote CF-2291 rev. 2 received from CellForm Systems' },
      { t: n - 4 * H, p: 'nord', text: 'Permit condition revised', src: 'SharePoint', ev: 'Permit conditions v3 uploaded to the Nord folder' },
      { t: n - 6 * H, p: 'west', text: 'Grid connection document added', src: 'Files', ev: 'Grid connection agreement.pdf' },
      { t: n - 9 * H, p: 'ost', text: 'Transformer delivery date unconfirmed', src: 'Email', ev: 'Supplier did not confirm the slot by the deadline' }],
    tasks: [{ id: 1, p: 'ost', text: 'Confirm transformer delivery date', due: null, done: false }, { id: 2, p: 'heide', text: 'Review E1 form draft', due: null, done: false }],
    docs: [D('heide','Supplier contract draft','v4',1,'Email','12 Sep'), D('heide','Supplier contract draft','v3',0,'SharePoint','28 Aug'), D('heide','Grid connection application','v2',1,'SharePoint','2 Sep'), D('heide','Grid connection application','v1',0,'Files','14 Jul'),
      D('nord','Permit conditions','v3',1,'SharePoint','Today'), D('nord','Permit conditions','v2',0,'SharePoint','3 Jun'), D('nord','Protection concept','v2',1,'Email','20 Aug'), D('sued','Site lease','v1',1,'Files','9 Mar'),
      D('sued','E1 form','v1',1,'Files','1 Sep'), D('west','Grid connection agreement','v1',1,'Files','Today'), D('ost','Transformer order','v2',1,'Email','30 Aug')],
    filings: {}, sel: 'heide', nextId: 10
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { S = seed(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const proj = id => S.projects.find(p => p.id === id);
const cls = p => p.rtb < 60 ? 'risk' : p.rtb >= 90 ? 'ready' : 'ok';
const status = p => p.rtb < 60 ? 'At risk' : p.rtb >= 90 ? 'Ready' : 'On track';
const stepState = (p, i) => i < p.done ? 'done' : i === p.done ? (p.rtb < 60 ? 'risk' : 'open') : 'todo';

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
// ==== UI ====
const TITLES = { portfolio: 'Portfolio', tasks: 'Tasks', documents: 'Documents', filings: 'Grid-connection filings' };
let view = 'portfolio', DQ = { q: '', p: 'all' }, pulse = [];

const DE = [[6.05,53.5],[7.2,53.7],[8.0,53.6],[8.9,54.0],[8.6,54.9],[9.4,54.85],[10.0,54.5],[10.9,54.0],[12.1,54.2],[13.4,54.6],[14.2,53.9],[14.6,53.0],[14.7,51.9],[15.0,51.0],[14.3,50.9],[12.2,50.3],[13.0,49.7],[13.8,48.8],[13.0,48.3],[13.0,47.6],[10.5,47.5],[9.6,47.55],[7.6,47.6],[7.55,48.5],[8.2,49.0],[6.4,49.4],[6.1,50.1],[6.0,50.8],[6.0,51.9],[7.1,52.2],[7.2,53.2]];
const px = (lo, la) => [((lo - 5.6) * 0.63 * 46 + 12).toFixed(1), ((55.2 - la) * 46 + 10).toFixed(1)];
function mapSvg() {
  const path = 'M' + DE.map(([lo, la]) => px(lo, la).join(',')).join('L') + 'Z';
  const dots = S.projects.map(p => { const [x, y] = px(p.lon, p.lat), c = p.rtb < 60 ? '#e89c35' : p.rtb >= 90 ? '#1688bd' : '#169d76';
    return `<g class="dot ${pulse.includes(p.id) ? 'pulse' : ''}" data-p="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}"><circle cx="${x}" cy="${y}" r="13" fill="${c}" opacity=".2"/><circle cx="${x}" cy="${y}" r="6.5" fill="${c}"/><text x="${+x + 11}" y="${+y + 3}">${esc(p.name.slice(5))}</text></g>`; }).join('');
  return `<div class="map"><svg viewBox="0 0 290 390" role="img" aria-label="Map of projects in Germany"><path class="de" d="${path}"/>${dots}</svg><div class="legend"><span><i style="background:#169d76"></i>On track</span><span><i style="background:#e89c35"></i>At risk</span><span><i style="background:#1688bd"></i>Ready</span></div></div>`;
}

let flt = 'all';
const PH_C = { Planning: '#1b7fd0', Building: '#e89c35', Operation: '#169d76' };
function spark(p) {
  const v = [...(p.trend || [p.rtb, p.rtb, p.rtb, p.rtb, p.rtb]), p.rtb], mn = Math.min(...v) - 4, mx = Math.max(...v) + 4;
  const pts = v.map((y, i) => (i * 20) + ',' + (30 - (y - mn) / (mx - mn) * 28).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${p.rtb < 60 ? '#e89c35' : '#169d76'}" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
const segs = p => STEPS.map((s, i) => `<i class="sg ${stepState(p, i)}" style="--c:${PH_C[s[1]]}" title="${esc(s[0])}"></i>` + (i === 3 || i === 7 ? '<u></u>' : '')).join('');
function card(p) {
  const k = Math.min(p.done, 11), last = S.changes.find(c => c.p === p.id);
  return `<article class="pc ${cls(p)}" data-p="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
  <div class="pc-h"><div><h3>${esc(p.name)}</h3><small>${esc(p.city)}</small></div><span class="badge ${cls(p)}">${status(p)}</span></div>
  <div class="pc-m"><div class="rtb"><b>${p.rtb}</b><span>%<small>ready to build</small></span></div>${spark(p)}</div>
  <div class="segs">${segs(p)}</div><div class="seg-l"><span>Planning</span><span>Building</span><span>Operation</span></div>
  <div class="pc-s"><div><b>${p.mw} MW</b><small>${p.mw * 2} MWh</small></div><div><b>${p.kv} kV</b><small>connection</small></div><div><b>${esc(p.cod)}</b><small>target COD</small></div></div>
  <div class="pc-n"><small>NEXT STEP</small><b>${STEPS[k][0]}</b><span>${PEOPLE[k][0]} · ${PEOPLE[k][1]}</span></div>
  ${last ? `<div class="pc-l">↻ ${esc(last.text)} · ${ago(last.t)}</div>` : ''}</article>`;
}
function vPortfolio() {
  const P = S.projects, tot = P.length, mw = P.reduce((a, p) => a + p.mw, 0), ready = P.filter(p => p.rtb >= 90).length, risk = P.filter(p => p.rtb < 60).length, avg = Math.round(P.reduce((a, p) => a + p.rtb, 0) / tot);
  const ph = ['Planning', 'Building', 'Operation'].map(f => [f, P.filter(p => p.phase === f).length]);
  const day = S.changes.filter(c => Date.now() - c.t < 26 * H), list = P.filter(p => flt === 'all' || (flt === 'risk' ? p.rtb < 60 : p.phase === flt));
  return `<section class="intro"><p class="eyebrow">PORTFOLIO OVERVIEW</p><h2>${tot} projects, ${mw} MW of battery storage</h2><small>Sample portfolio · every figure traces back to its source</small></section>
  <div class="kpis"><div class="kpi"><small>Portfolio capacity</small><b>${mw}<span> MW</span></b><em>${mw * 2} MWh storage</em></div>
    <div class="kpi"><small>Average RTB probability</small><b>${avg}<span>%</span></b><div class="mini"><i style="width:${avg}%"></i></div></div>
    <div class="kpi"><small>Projects by phase</small><div class="split">${ph.map(([f, n]) => `<i style="flex:${n || .01};background:${PH_C[f]}"></i>`).join('')}</div><em>${ph.map(([f, n]) => n + ' ' + f.toLowerCase()).join(' · ')}</em></div>
    <div class="kpi ${risk ? 'warnk' : ''}"><small>Needs attention</small><b>${risk}<span> at risk</span></b><em>${ready} ready to build</em></div></div>
  <div class="digest2"><span class="ai">AI</span><div><b>What happened yesterday</b><small>${day.length} changes across ${new Set(day.map(c => c.p)).size} projects</small></div><ul>${day.slice(0, 3).map(c => `<li data-p="${c.p}" tabindex="0"><b>${esc(proj(c.p).name.slice(5))}</b> ${esc(c.text)}<small>${ago(c.t)}</small></li>`).join('')}</ul></div>
  <div class="pf"><div><div class="filters">${[['all', 'All'], ['Planning', 'Planning'], ['Building', 'Building'], ['Operation', 'Operation'], ['risk', 'At risk']].map(([k, l]) => `<button class="fchip ${flt === k ? 'on' : ''}" data-flt="${k}" type="button">${l}</button>`).join('')}</div>
    <div class="pgrid">${list.map(card).join('') || '<p>No projects match.</p>'}</div></div>
  <aside class="pf-side"><div class="card"><h2>Portfolio map</h2>${mapSvg()}</div></aside></div>`;
}
function vTasks() {
  return `<div class="card">${S.tasks.length ? S.tasks.map(t => `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-t="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}<small>${esc(proj(t.p).name)}${t.due ? ' · due ' + esc(t.due) : ''}</small></span></label>`).join('') : 'No tasks yet. Process a message to create some.'}</div>`;
}
function docRows() {
  const q = DQ.q.toLowerCase();
  const rows = S.docs.filter(d => (DQ.p === 'all' || d.p === DQ.p) && (d.name + ' ' + d.src + ' ' + proj(d.p).name).toLowerCase().includes(q));
  return `<tr><th>Document</th><th>Version</th><th>Project</th><th>Found in</th><th>Date</th></tr>` + (rows.map(d => `<tr class="${d.cur ? '' : 'old'}"><td>${esc(d.name)}</td><td><span class="ver ${d.cur ? '' : 'old'}">${d.ver}${d.cur ? ' · current' : ' · superseded'}</span></td><td>${esc(proj(d.p).name)}</td><td><span class="src">${esc(d.src)}</span></td><td>${esc(d.date)}</td></tr>`).join('') || '<tr><td colspan="5">No matching document.</td></tr>');
}
function vDocs() {
  return `<div class="tool"><input id="dq" type="search" placeholder="Find a document across email, SharePoint and folders…" value="${esc(DQ.q)}" aria-label="Search documents"><select id="dp" aria-label="Project"><option value="all">All projects</option>${S.projects.map(p => `<option value="${p.id}" ${DQ.p === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div><div class="card"><table id="dt">${docRows()}</table></div>`;
}
function vFilings() {
  const p = proj(S.sel), F = S.filings[p.id] || (S.filings[p.id] = {}), cp = p.cp || F.cp || '';
  const rows = [['Applicant', `Nordwind Storage ${p.name.slice(5)} GmbH`, 'Commercial register extract.pdf'], ['Site', p.city, 'Lease agreement.pdf'], ['Capacity', `${p.mw} MW / ${p.mw * 2} MWh`, 'Grid connection application v2.pdf'], ['Connection voltage', p.kv + ' kV', 'Grid connection application v2.pdf'], ['Connection point', cp, p.cp ? 'Operator letter.pdf' : 'Entered by you'], ['Planned COD', p.cod, 'Project schedule.xlsx']];
  return `<div class="tool"><select id="fsel" aria-label="Project">${S.projects.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
  <div class="card"><h2>E1 / E8 — pre-filled from your project sources</h2><div class="form">${rows.map(r => r[1] ? `<div class="frow"><small>${r[0]}</small><b>${esc(r[1])}</b><span class="src">${esc(r[2])}</span></div>` :
    `<div class="miss"><b>${r[0]}: no source found</b><br><small>BESSMIND does not guess missing data.</small><div class="frow" style="border:0"><input class="f-in" id="cp-in" placeholder="Enter connection point"><button class="cta" id="cp-save" type="button">Save</button></div></div>`).join('')}</div>
  ${cp ? (F.done ? '<div class="banner">✓ Confirmed — ready to submit to the grid operator</div>' : '<button class="cta wide" id="confirm" type="button">Review done — confirm filing</button>') : ''}</div>`;
}

function render() {
  $('#tc').textContent = S.tasks.filter(t => !t.done).length || '';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#psel').innerHTML = '<option value="auto">Detect from message</option>' + S.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#main').innerHTML = (view === 'portfolio' ? '' : `<section class="intro"><h2>${TITLES[view]}</h2></section>`) + { portfolio: vPortfolio, tasks: vTasks, documents: vDocs, filings: vFilings }[view]();
}

function openDrawer(id) {
  const p = proj(id), known = p.f.filter(x => x !== 'none').length, lab = { ok: 'Complete', open: 'In progress', none: 'No data — not estimated' }, ic = { ok: '✓', open: '◔', none: '?' };
  const ph = ['Planning', 'Building', 'Operation'];
  $('#drawer').innerHTML = `<div role="dialog" aria-label="${esc(p.name)}"><button class="x" data-close type="button" aria-label="Close">✕</button>
  <h2>${esc(p.name)}</h2><small>${esc(p.city)} · ${p.mw} MW · ${p.phase}</small>
  <div class="d-top"><div class="ring ${p.rtb < 60 ? 'risk' : ''}" style="--v:${p.rtb}"><b>${p.rtb}%</b></div><div><b>Ready-to-Build probability</b><br><span class="${cls(p)}">${status(p)}</span> · target COD ${esc(p.cod)}</div></div>
  <h3>WHY THIS SCORE — EVERY FACTOR TRACED TO A SOURCE</h3><ul class="fx">${FX.map((f, i) => `<li class="${p.f[i]}"><span>${ic[p.f[i]]}</span><b>${f[0]}</b> ${lab[p.f[i]]}<small>${p.f[i] === 'none' ? 'no source' : esc(f[1])}</small></li>`).join('')}</ul>
  <div class="note">Based on ${known} of 4 verified factors. BESSMIND does not estimate missing data — it tells you what is missing.</div>
  <h3>PROJECT STEPS — CLICK A STEP TO SEE WHO IS BEHIND IT</h3>${ph.map(f => `<div class="phase"><b>${f}</b><div class="steps">${STEPS.map((s, i) => s[1] === f ? `<button class="step ${stepState(p, i)}" data-step="${p.id}:${i}" type="button">${s[0]}</button>` : '').join('')}</div></div>`).join('')}
  <h3>RECENT CHANGES</h3><ul class="feed">${S.changes.filter(c => c.p === id).slice(0, 5).map(c => `<li><b>${esc(c.text)}</b><small>${esc(c.src)} · ${ago(c.t)}${c.ev ? ' · “' + esc(c.ev.slice(0, 90)) + (c.ev.length > 90 ? '…' : '') + '”' : ''}</small></li>`).join('') || '<li>None yet</li>'}</ul>
  <h3>MILESTONES</h3><ul class="feed">${(p.milestones || []).slice(0, 6).map(m => `<li>${esc(m.label)}<small>${esc(m.date || '')}</small></li>`).join('') || '<li>None yet</li>'}</ul></div>`;
  $('#drawer').hidden = false; $('#drawer .x').focus();
}
function openPop(id, i) {
  const p = proj(id), [n, ph] = STEPS[i], [who, co, last, when] = PEOPLE[i], st = stepState(p, i), L = { done: 'Done', open: 'In progress', risk: 'At risk', todo: 'Not started' };
  $('#pop').innerHTML = `<div class="pop-card" role="dialog" aria-label="${esc(n)}"><button class="x" data-close-pop type="button" aria-label="Close">✕</button><small>${ph}</small><h3>${n}</h3><div class="who"><span class="av">${who.split(' ').map(w => w[0]).join('')}</span><div><b>${who}</b><small>${co}</small></div></div><p><b>Recent activity</b><br>${last} · ${when}</p><span class="st ${st}">${L[st]}</span></div>`;
  $('#pop').hidden = false;
}
const closeAll = () => { $('#pop').hidden = true; $('#drawer').hidden = true; $('#inbox').hidden = true; };

document.addEventListener('click', e => {
  const t = e.target, g = s => t.closest(s);
  if (g('[data-flt]')) { flt = g('[data-flt]').dataset.flt; render(); return; }
  if (g('[data-view]')) { view = g('[data-view]').dataset.view; render(); return; }
  if (g('[data-step]')) { const [id, i] = g('[data-step]').dataset.step.split(':'); openPop(id, +i); return; }
  if (g('[data-close-pop]') || t.id === 'pop') { $('#pop').hidden = true; return; }
  if (g('[data-close]') || t.id === 'drawer') { $('#drawer').hidden = true; return; }
  if (g('[data-p]')) { $('#inbox').hidden = true; openDrawer(g('[data-p]').dataset.p); return; }
  if (g('[data-sample]')) { $('#msg').value = SAMPLES[+g('[data-sample]').dataset.sample]; $('#psel').value = 'auto'; return; }
  if (t.id === 'cp-save') { const v = $('#cp-in').value.trim(); if (v) { S.filings[S.sel].cp = v; save(); render(); } }
  if (t.id === 'confirm') { S.filings[S.sel].done = true; save(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAll();
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.p) openDrawer(e.target.dataset.p);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.t) { S.tasks.find(x => x.id == t.dataset.t).done = t.checked; save(); render(); }
  if (t.id === 'dp') { DQ.p = t.value; $('#dt').innerHTML = docRows(); }
  if (t.id === 'fsel') { S.sel = t.value; save(); render(); }
});
document.addEventListener('input', e => { if (e.target.id === 'dq') { DQ.q = e.target.value; $('#dt').innerHTML = docRows(); } });
$('#open-inbox').onclick = () => { $('#inbox').hidden = false; $('#msg').focus(); };
$('#close-inbox').onclick = () => { $('#inbox').hidden = true; };
$('#reset').onclick = () => { S = seed(); save(); pulse = []; $('#result').innerHTML = ''; $('#pipe').innerHTML = ''; render(); };

const PIPE = ['Reading message', 'Understanding what changed', 'Tracing consequences', 'Updating the project model'], ICON = { risk: '⚠', ok: '✓', action: '☐', info: 'ℹ', milestone: '◷' };
$('#analyze').onclick = async () => {
  const text = $('#msg').value.trim(), box = $('#result'), pipe = $('#pipe');
  box.innerHTML = ''; pipe.innerHTML = '';
  if (!text) { box.innerHTML = '<p>Paste a message first.</p>'; return; }
  const r = analyze(text, $('#psel').value);
  if (r.error) { box.innerHTML = `<p>${esc(r.error)}</p>`; return; }
  pipe.innerHTML = PIPE.map(s => `<li>${s}</li>`).join('');
  for (const li of pipe.children) { await sleep(reduce ? 0 : 450); li.classList.add('on'); }
  pulse = r.results.map(x => x.p.id);
  box.innerHTML = r.results.map(x => `<div class="result"><b>${esc(x.p.name)}</b> · RTB ${x.before}% → ${x.p.rtb}% · <span class="${cls(x.p)}">${status(x.p)}</span> · <a data-p="${x.p.id}">Open project</a>
    <ul class="fl">${x.findings.map(f => `<li><b>${ICON[f.type]} ${esc(f.title)}</b>${f.detail ? ' — ' + esc(f.detail) : ''}${f.due ? ' (due ' + esc(f.due) + ')' : ''}${f.cons ? '<ul>' + f.cons.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>' : ''}<em>“${esc(f.ev.slice(0, 110))}${f.ev.length > 110 ? '…' : ''}”</em></li>`).join('')}</ul></div>`).join('');
  $('#msg').value = ''; view = 'portfolio'; render();
};
if (self !== top) document.body.classList.add('embedded');
render();
