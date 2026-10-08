// BESSMIND demo — all data is fictional sample data and stays in your browser.
// The message reader and the Ask / search engines are rule-based; the full product uses AI models.
const SESS = (() => { try { return JSON.parse(sessionStorage.getItem('bm-session')); } catch { return null; } })();
if (!SESS) location.replace('login.html');
const KEY = 'bessmind-ws-' + (SESS ? SESS.user : 'anon'), H = 3600000;
const $ = s => document.querySelector(s);
const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = ts => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtT = ts => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const fmtD = iso => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const eur = n => n >= 1e6 ? '€' + (n / 1e6).toFixed(1) + 'M' : '€' + Math.round(n / 1e3) + 'k';
const MI = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11, januar:0, februar:1, märz:2, mai:4, juni:5, juli:6, oktober:9, dezember:11 };
function dm(s) { const y = +(s.match(/\d{4}/) || [2026])[0], q = s.match(/Q([1-4])/i); if (q) return (y - 2025) * 12 + (+q[1] - 1) * 3 + 1.5; const mo = (s.toLowerCase().match(/[a-zäöü]+/) || ['january'])[0], d = +(s.match(/^\d{1,2}/) || [15])[0]; return (y - 2025) * 12 + (MI[mo] ?? 0) + d / 31; }
function pd(s) { const m = s.match(/^(\d{1,2})\.?\s+([A-Za-zäöü]+)\s+(\d{4})$/); if (!m || MI[m[2].toLowerCase()] === undefined) return null; return Date.UTC(+m[3], MI[m[2].toLowerCase()], +m[1]) / 864e5; }
const qlab = m => { const x = m - 0.01; return 'Q' + (Math.floor((x % 12) / 3) + 1) + ' ' + (2025 + Math.floor(x / 12)); };

const STEPS = [['Site selection','Planning'],['Permits & approvals','Planning'],['Grid connection application','Planning'],['Supplier & contract setup','Planning'],['Procurement','Building'],['Construction','Building'],['Testing & commissioning','Building'],['Documentation','Building'],['Performance monitoring','Operation'],['Maintenance','Operation'],['Reporting','Operation'],['Lifecycle management','Operation']];
const FX = [['Permits','Permit notice (BImSchG).pdf'],['Grid connection','Grid connection application v2.pdf'],['Supplier contract','Supplier contract draft v4.docx'],['Financing','Financing term sheet.pdf']];

// Timeline model: five dependent rows per project (months since Jan 2025). COD = end of Commissioning.
const ROWS = ['Permitting', 'Grid connection', 'Procurement', 'Construction', 'Commissioning'];
const DEPS = [[3, 4], [4], [3, 4], [4], []];
const TL = { heide: [[8,15],[12,22],[20,28],[24,31],[31,33]], nord: [[4,9],[6,13],[12,20],[14,30],[30,33]], sued: [[9,15],[11,21],[20,27],[24,33],[33,35]], west: [[0,3],[1,6],[4,8],[7,11],[11,12]], ost: [[8,13],[9,17],[17,25],[24,33],[33,35]] };
const TS = { heide: { pl: [6,22], bu: [22,33], op: [33,47] }, nord: { pl: [4,12], bu: [12,33], op: [33,47] }, sued: { pl: [9,21], bu: [21,35], op: [35,47] }, west: { pl: [0,4], bu: [4,12], op: [12,47] }, ost: { pl: [8,17], bu: [17,35], op: [35,47] } };
const TR = { heide: [70,73,76,78,80], nord: [72,70,66,62,58], sued: [80,83,85,88,90], west: [94,95,95,96,96], ost: [60,58,55,52,50] };
function shiftProject(p, row, days, why, ev, quiet) {
  if (!p.tl) { (p.shifts = p.shifts || []).unshift({ row, days, why, ev: ev || '', t: Date.now() }); return; }
  const i = ROWS.indexOf(row), d = days / 30.4, R = p.tl;
  R[i].e += d; DEPS[i].forEach(j => { R[j].s += d; R[j].e += d; });
  p.t.bu[1] = R[4].e; p.t.op[0] = R[4].e;
  if (p.phase !== 'Operation') p.cod = qlab(R[4].e);
  (p.shifts = p.shifts || []).unshift({ row, days, why, ev: ev || '', t: Date.now() });
  p.fresh = !quiet;
}
const delayDays = p => (p.shifts || []).reduce((a, x) => a + x.days, 0);
const RATE = 380;                                   // illustrative revenue assumption, EUR per MW per day
const isSc = p => !!p.demo;                          // only the sample portfolio is scored; imported projects show facts, never invented scores
const impact = p => isSc(p) ? delayDays(p) * (p.mw || 0) * RATE : 0;

// Risk engine: five weighted categories, 0-100 (higher = riskier). Every adjustment keeps its evidence.
const CATS = ['Schedule', 'Permitting', 'Grid', 'Procurement', 'Financial'], WT = [.25, .2, .25, .15, .15], BASE = { ok: 18, open: 62, none: 70 };
const adjOf = p => (p.why || []).reduce((o, w) => (o[w.cat] = (o[w.cat] || 0) + w.pts, o), {});
function rk(p) {
  if (p.rtb == null) return { sc: [0, 0, 0, 0, 0], total: 0, none: true };
  const a = adjOf(p), cl = v => Math.max(0, Math.min(100, Math.round(v)));
  const sc = [(100 - p.rtb) * .9 + 10, BASE[p.f[0]], BASE[p.f[1]], BASE[p.f[2]], BASE[p.f[3]]].map((v, i) => cl(v + (a[CATS[i]] || 0)));
  return { sc, total: Math.round(sc.reduce((s, v, i) => s + v * WT[i], 0)) };
}
const lvl = n => n >= 70 ? ['High', 'crit'] : n >= 45 ? ['Elevated', 'warn'] : ['Low', 'ok'];
const BR = { Permitting: p => p.f[0] !== 'ok' && ['Permit approval not yet complete', FX[0][1]], Grid: p => p.f[1] !== 'ok' && ['Grid connection application still in progress', FX[1][1]], Procurement: p => p.f[2] !== 'ok' && ['Supplier contract not signed', FX[2][1]],
  Financial: p => p.f[3] === 'none' ? ['No financing data: risk assumed, not estimated', null] : p.f[3] === 'open' && ['Financing still in progress', FX[3][1]], Schedule: p => p.rtb < 70 && ['RTB probability ' + p.rtb + '%: limited schedule buffer', null] };
const WHYMAP = { 'Planned date no longer achievable': [['Grid', 25], ['Schedule', 20]], 'Grid constraint identified': [['Grid', 12]], 'Delay reported': [['Procurement', 15], ['Schedule', 12]], 'Technical design needs revision': [['Grid', 6], ['Schedule', 6]], 'Supplier price change': [['Procurement', 10], ['Financial', 8]], 'Permit condition change': [['Permitting', 18], ['Schedule', 5]] };
function shiftOf(f) {
  if (f.type !== 'risk') return null;
  const ev = f.ev, d = dates(ev);
  if (f.title === 'Planned date no longer achievable') { if (d.length > 1 && /previous/i.test(ev)) return { row: 'Grid connection', days: Math.max(14, Math.round((dm(d[0]) - dm(d[1])) * 30.4)) }; return { row: 'Grid connection', days: 14 }; }
  if (f.title === 'Delay reported') { const m = ev.match(/(\d+)\s*(day|week|month)/i); return { row: /deliver|supplier|transformer|quote/i.test(ev) ? 'Procurement' : 'Construction', days: m ? +m[1] * { day: 1, week: 7, month: 30 }[m[2].toLowerCase()] : 14 }; }
  return null;
}

function seed() {
  const n = Date.now();
  const P = (id, name, phase, rtb, done, lon, lat, mw, kv, cp, cod, city, f) => ({ demo: true, id, name, phase, rtb, done, lon, lat, mw, kv, cp, cod, city, f, milestones: [], trend: TR[id], t: JSON.parse(JSON.stringify(TS[id])), tl: TL[id].map(([s, e]) => ({ s, e, s0: s, e0: e })), shifts: [], why: [] });
  const D = (p, name, ver, cur, src, date, page, text) => ({ p, name, ver, cur, src, date, page, text });
  const W = (cat, pts, title, ev) => ({ cat, pts, title, ev, t: n - 5 * H });
  const projects = [
    P('heide', 'BESS Heide', 'Planning', 82, 3, 9.1, 54.2, 200, 110, null, 'Q3 2027', 'Heide, Schleswig-Holstein', ['ok','ok','open','none']),
    P('nord', 'BESS Nord', 'Building', 56, 5, 8.1, 53.5, 120, 110, 'UW Nord', 'Q3 2027', 'Wilhelmshaven, Niedersachsen', ['ok','open','ok','ok']),
    P('sued', 'BESS Süd', 'Planning', 91, 4, 11.7, 48.4, 80, 110, 'UW Freising', 'Q4 2027', 'Freising, Bayern', ['ok','ok','ok','ok']),
    P('west', 'BESS West', 'Operation', 96, 9, 6.6, 51.1, 150, 220, 'UW Grevenbroich', 'In operation', 'Grevenbroich, NRW', ['ok','ok','ok','ok']),
    P('ost', 'BESS Ost', 'Building', 48, 4, 14.3, 51.8, 100, 110, null, 'Q4 2027', 'Cottbus, Brandenburg', ['open','open','open','none'])];
  const g = id => projects.find(p => p.id === id);
  shiftProject(g('nord'), 'Grid connection', 21, 'Operator confirmed a later energisation date', 'Operator letter', true);
  shiftProject(g('ost'), 'Procurement', 30, 'Transformer delivery not confirmed', 'Supplier did not confirm the slot', true);
  g('nord').why = [W('Grid', 35, 'Grid connection moved +21 days', 'Operator letter: later energisation date'), W('Schedule', 25, 'COD follows grid connection', 'EPC schedule v3.2: COD depends on grid connection'), W('Procurement', 12, 'Supplier quote updated', 'Quote CF-2291 rev. 2 received from CellForm Systems')];
  g('ost').why = [W('Procurement', 25, 'Transformer delivery date unconfirmed', 'Supplier did not confirm the slot by the deadline'), W('Schedule', 15, 'Procurement delay +30 days', 'Derived from the timeline'), W('Permitting', 8, 'Permit approval still pending', 'Permit notice (BImSchG).pdf: status open'), W('Grid', 6, 'Connection point missing', 'Grid application incomplete')];
  return {
    projects,
    changes: [
      { t: n - 2 * H, p: 'nord', text: 'Supplier price change detected', src: 'Email', ev: 'Quote CF-2291 rev. 2 received from CellForm Systems' },
      { t: n - 4 * H, p: 'nord', text: 'Permit condition changed', src: 'SharePoint', ev: 'Permit conditions v3 uploaded to the Nord folder' },
      { t: n - 6 * H, p: 'west', text: 'Grid document received', src: 'Files', ev: 'Grid connection agreement.pdf' },
      { t: n - 9 * H, p: 'ost', text: 'Transformer delivery date unconfirmed', src: 'Email', ev: 'Supplier did not confirm the slot by the deadline' },
      { t: n - 11 * H, p: 'sued', text: 'Revenue assumption updated', src: 'Files', ev: 'Revenue model v5 uploaded' },
      { t: n - 13 * H, p: 'heide', text: 'Grid application revised', src: 'SharePoint', ev: 'Grid connection application v2 uploaded' }],
    tasks: [{ id: 1, p: 'ost', text: 'Confirm transformer delivery date', due: null, done: false }, { id: 2, p: 'heide', text: 'Review E1 form draft', due: null, done: false }],
    docs: [
      D('nord', 'Grid Connection Agreement', 'v1', 1, 'SharePoint', '2026-03-12', 14, 'Connection date: 14 May 2027. The operator may adjust the date following network studies.'),
      D('nord', 'Grid operator correspondence', '', 1, 'Email', '2026-10-08', null, 'Expected connection date: 28 May 2027, following the latest network assessment.'),
      D('nord', 'EPC Schedule', 'v3.2', 1, 'Files', '2026-09-02', 7, 'Commissioning start and COD are dependent on grid connection. Energisation planned for mid-May 2027.'),
      D('nord', 'EPC Schedule', 'v3.1', 0, 'Files', '2026-07-20', 7, 'Energisation planned for mid-May 2027.'),
      D('nord', 'Permit conditions', 'v3', 1, 'SharePoint', '2026-10-08', 6, 'Condition 7: sound emissions at night must not exceed the agreed limit.'),
      D('nord', 'Permit conditions', 'v2', 0, 'SharePoint', '2026-06-03', 6, 'Condition 7 is not included.'),
      D('nord', 'Protection concept', 'v2', 1, 'Email', '2026-08-20', 3, 'The protection concept must be revised following the latest short-circuit calculations.'),
      D('nord', 'Supplier quote CF-2291', 'rev. 2', 1, 'Email', '2026-10-08', 2, 'Revised unit price. Delivery window moves by three weeks. Quote valid until 30 November 2026.'),
      D('heide', 'Grid connection application', 'v2', 1, 'SharePoint', '2026-09-02', 5, 'Requested connection date: 30 June 2027 at 110 kV, 200 MW import/export.'),
      D('heide', 'Grid connection application', 'v1', 0, 'Files', '2026-07-14', 5, 'Requested connection date: 30 June 2027.'),
      D('heide', 'Supplier contract draft', 'v4', 1, 'Email', '2026-09-12', 9, 'Delivery of battery containers 12 weeks after signature. A long-stop date applies.'),
      D('heide', 'Supplier contract draft', 'v3', 0, 'SharePoint', '2026-08-28', 9, 'Delivery 14 weeks after signature.'),
      D('heide', 'Permit notice (BImSchG)', 'v1', 1, 'Files', '2026-05-20', 2, 'Operation approved subject to the noise limits in annex 2.'),
      D('sued', 'Site lease', 'v1', 1, 'Files', '2026-03-09', 3, 'Lease term of 30 years with an option to extend.'),
      D('sued', 'E1 form', 'v1', 1, 'Files', '2026-09-01', 1, 'Planned connection date: Q4 2027.'),
      D('west', 'Grid connection agreement', 'v1', 1, 'Files', '2026-10-08', 12, 'Connection date: 12 January 2026. Operation started.'),
      D('ost', 'Transformer order', 'v2', 1, 'Email', '2026-08-30', 1, 'Delivery slot to be confirmed by the supplier.')],
    filings: {}, applied: {}, sel: 'heide', rsel: 'ost', nextId: 10
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || emptyState(); } catch { S = emptyState(); }
S.log = S.log || []; S.filings = S.filings || {}; S.applied = S.applied || {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const proj = id => S.projects.find(p => p.id === id);
const cls = p => p.rtb == null ? 'na' : p.rtb < 60 ? 'risk' : p.rtb >= 90 ? 'ready' : 'ok';
const status = p => p.rtb == null ? 'No assessment' : p.rtb < 60 ? 'At risk' : p.rtb >= 90 ? 'Ready' : 'On track';
const stepState = (p, i) => !p.demo ? (secCount(p, STEPSEC[i]) ? 'open' : 'todo') : i < p.done ? 'done' : i === p.done ? (p.rtb < 60 ? 'risk' : 'open') : 'todo';

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
      if (p.rtb != null) p.rtb = Math.max(0, Math.min(100, p.rtb + (f.delta || 0)));
      if (['risk', 'milestone', 'action'].includes(f.type)) S.changes.unshift({ t: Date.now(), p: p.id, text: f.title, src: 'Email', ev: f.ev });
      const sh = shiftOf(f); if (sh) { shiftProject(p, sh.row, sh.days, f.title, f.ev); f.shift = sh; }
      (WHYMAP[f.title] || []).forEach(([cat, pts]) => (p.why = p.why || []).unshift({ cat, pts, title: f.title + (sh ? ' (+' + sh.days + ' days)' : ''), ev: f.ev, t: Date.now() }));
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
let view = 'portfolio', DS = { q: '', p: 'all' }, ANS = '', pulse = [], flt = 'all', srt = { k: 'risk', d: -1 }, qry = '', MAP = null;
const PH = { Planning: '#6c8aa3', Building: '#34c9ee', Operation: '#2de2a6' };
const T0 = 6, T1 = 47, pos = m => (Math.max(0, Math.min(1, (m - T0) / (T1 - T0))) * 100).toFixed(2);
const A0 = 6, A1 = 44, px2 = m => (Math.max(0, Math.min(1, (m - A0) / (A1 - A0))) * 100).toFixed(2);
const nowM = () => { const d = new Date(); return (d.getFullYear() - 2025) * 12 + d.getMonth() + d.getDate() / 31; };
const fmt = n => n.toLocaleString('en');
const lvTag = n => { const [l, c] = lvl(n); return `<span class="lv ${c}"><b>${n}</b> ${l}</span>`; };
const pinCls = p => rk(p).total >= 70 ? 'crit' : cls(p);

function spark(p) {
  if (p.rtb == null) return '';
  const v = [...(p.trend || [p.rtb, p.rtb, p.rtb, p.rtb, p.rtb]), p.rtb], mn = Math.min(...v) - 3, mx = Math.max(...v) + 3;
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${v.map((y, i) => i * 20 + ',' + (28 - (y - mn) / (mx - mn) * 26).toFixed(1)).join(' ')}" fill="none" stroke="${p.rtb < 60 ? '#f5a524' : '#2de2a6'}" stroke-width="1.8" vector-effect="non-scaling-stroke"/></svg>`;
}
const VAL = { name: p => p.name, mw: p => p.mw, rtb: p => p.rtb == null ? -1 : p.rtb, cod: p => p.t ? p.t.bu[1] : 99, prog: p => p.done, risk: p => rk(p).total };
function listP() {
  const l = S.projects.filter(p => (flt === 'all' || (flt === 'risk' ? (p.rtb != null && p.rtb < 60) : p.phase === flt)) && (p.name + ' ' + p.city).toLowerCase().includes(qry.toLowerCase()));
  return l.sort((a, b) => { const x = VAL[srt.k](a), y = VAL[srt.k](b); return (x > y ? 1 : x < y ? -1 : 0) * srt.d; });
}
function ganttHtml0(l) {
  const yr = [[2026, 12], [2027, 24], [2028, 36]], now = nowM();
  const seg = (k, a) => `<i class="gs" style="left:${pos(a[0])}%;width:${(pos(a[1]) - pos(a[0])).toFixed(2)}%;background:${PH[k]}" title="${k}"></i>`;
  return `<div class="g-row g-h"><span></span><div class="trk">${yr.map(([y, m]) => `<b style="left:${pos(m)}%">${y}</b>`).join('')}</div></div>` +
    l.map(p => `<div class="g-row" data-p="${p.id}" tabindex="0"><b>${esc(p.name)}</b><div class="trk">${yr.map(([, m]) => `<u style="left:${pos(m)}%"></u>`).join('')}${seg('Planning', p.t.pl)}${seg('Building', p.t.bu)}${seg('Operation', p.t.op)}<em class="today" style="left:${pos(now)}%"></em><s class="cod ${cls(p)}" style="left:${pos(p.t.bu[1])}%" title="Target COD ${esc(p.cod)}"></s></div></div>`).join('') +
    `<div class="glg">${Object.keys(PH).map(k => `<span><i style="background:${PH[k]}"></i>${k}</span>`).join('')}<span><i class="dm"></i>Target COD</span><span><i class="td"></i>Today</span></div>`;
}
const segHtml = () => [['all', 'All'], ['Planning', 'Planning'], ['Building', 'Building'], ['Operation', 'Operation'], ['risk', 'At risk']].map(([k, l]) => `<button class="${flt === k ? 'on' : ''}" data-flt="${k}" type="button">${l}</button>`).join('');
function refreshList() { const l = listP(); $('#ptw').innerHTML = tableHtml(l); $('#gw').innerHTML = ganttHtml(l); $('#seg').innerHTML = segHtml(); $('#cnt').textContent = l.length + ' of ' + S.projects.length; }

function initMap() {
  try { if (MAP) MAP.remove(); } catch {} MAP = null;
  const el = $('#map'); if (!el) return;
  if (typeof L === 'undefined') { el.innerHTML = '<p class="nomap">Map could not be loaded.</p>'; return; }
  const E = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const sat = L.tileLayer(E + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 15, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
  const labels = L.tileLayer(E + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 15 });
  const topo = L.tileLayer(E + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 15, attribution: 'Map © Esri, HERE, Garmin, OpenStreetMap contributors' });
  MAP = L.map(el, { scrollWheelZoom: false, minZoom: 5, layers: [sat, labels] });
  L.control.layers({ Satellite: sat, Terrain: topo }, null, { position: 'topright', collapsed: false }).addTo(MAP);
  MAP.on('baselayerchange', e => { if (e.name === 'Terrain') MAP.removeLayer(labels); else labels.addTo(MAP); });
  const pts = S.projects.filter(p => p.lat != null).map(p => {
    const icon = L.divIcon({ className: 'pin ' + pinCls(p) + (pulse.includes(p.id) ? ' hot' : ''), iconSize: [0, 0], html: `<span class="rg"></span><span class="rg r2"></span><i></i><b>${esc(shortOf(p.name))}</b>` });
    L.marker([p.lat, p.lon], { icon, title: p.name, riseOnHover: true }).addTo(MAP)
      .bindTooltip(`<b>${esc(p.name)}</b><br>${p.mw ?? '—'} MW · ${p.rtb == null ? 'not assessed' : 'RTB ' + p.rtb + '% · risk ' + rk(p).total + '%'}${p.geo ? '<br>Position: ' + esc(p.geo.prec) : ''}`, { direction: 'top', offset: [0, -14] }).on('click', () => openDrawer(p.id));
    return [p.lat, p.lon];
  });
  if (pts.length) MAP.fitBounds(pts, { padding: [60, 60], maxZoom: 7 }); else MAP.setView([51.2, 10.4], 5);
  setTimeout(() => MAP && MAP.invalidateSize(), 150);
}

/* ---------- Intelligence: activity + Ask BESSMIND ---------- */
const SUG = ['Which projects are at risk of missing COD?', 'What changed in the last 24 hours?', 'Which projects have grid connection risk?', 'What is the estimated revenue impact of delays?'];
function baseReason(cat, p) { return BR[cat](p) || null; }
function topDriver(p) { const w = (p.why || []).slice().sort((a, b) => b.pts - a.pts)[0]; if (w) return w.title; const r = rk(p), i = r.sc.indexOf(Math.max(...r.sc)), b = baseReason(CATS[i], p); return b ? b[0] : CATS[i] + ' risk'; }
function ask0(q) {
  const t = q.toLowerCase(), P = S.projects.filter(isSc).map(p => ({ p, r: rk(p) })).sort((a, b) => b.r.total - a.r.total), imp = S.projects.reduce((a, p) => a + impact(p), 0);
  const it = (x, why) => ({ pid: x.p.id, name: x.p.name, why, n: x.r.total });
  if (/impact|revenue|€|money|cost/.test(t)) { const l = P.filter(x => impact(x.p) > 0); return { head: eur(imp), sub: 'Estimated revenue impact from ' + l.length + ' delayed project' + (l.length === 1 ? '' : 's') + '.', items: l.map(x => it(x, '+' + delayDays(x.p) + ' days · ' + eur(impact(x.p)))), note: `Illustrative: delay days × MW × €${RATE} per MW per day. An assumption, not a forecast.`, src: 'Timeline, project model' }; }
  if (/yesterday|changed|last 24|what happened|latest|new/.test(t)) { const l = S.changes.filter(c => Date.now() - c.t < 26 * H); return { head: l.length + ' changes', sub: 'Across ' + new Set(l.map(c => c.p)).size + ' projects in the last 24 hours.', items: l.slice(0, 6).map(c => ({ pid: c.p, name: pname(c.p), why: c.text + ' · ' + c.src })), src: 'Email, SharePoint, files' }; }
  if (/grid/.test(t)) { const l = P.filter(x => x.r.sc[2] >= 45); return { head: l.length + ' project' + (l.length === 1 ? '' : 's'), sub: 'Grid connection risk is elevated or high.', items: l.map(x => it(x, (x.p.shifts || []).find(s => s.row === 'Grid connection') ? 'Grid connection moved +' + x.p.shifts.find(s => s.row === 'Grid connection').days + ' days' : (baseReason('Grid', x.p) || ['Grid risk'])[0])), src: 'Risk engine, timeline, documents' }; }
  if (/cod|miss|risk|late|delay|slip/.test(t)) { const l = P.filter(x => x.r.total >= 45 || delayDays(x.p) > 0 || (x.p.rtb != null && x.p.rtb < 60)), hi = l.filter(x => x.r.total >= 70).length;
    return { head: l.length + ' project' + (l.length === 1 ? '' : 's'), sub: hi ? hi + (hi === 1 ? ' is' : ' are') + ' at high risk.' : 'None at high risk.', items: l.map(x => it(x, topDriver(x.p))), note: imp ? 'Estimated portfolio impact: ' + eur(imp) + ` (illustrative, €${RATE}/MW/day)` : '', src: 'Risk engine, timeline' }; }
  if (/document|mention|find|search|contract|permit/.test(t)) { const r = searchDocs(q, 'all').slice(0, 4); return { head: r.length + ' documents', sub: 'Best matches. Open Documents for the full search and conclusion.', items: r.map(x => ({ pid: x.d.p, name: x.d.name + ' ' + x.d.ver, why: x.d.text.slice(0, 80) })), src: 'Document index' }; }
  return { head: 'I can answer questions about', sub: 'risk, COD, grid connection, revenue impact, documents and recent changes.', items: [], src: 'Project model' };
}
function ansHtml(q, a) {
  return `<div class="qa"><div class="q">${esc(q)}</div><div class="rsp"><small>BESSMIND</small><b class="hd">${esc(a.head)}</b><p>${esc(a.sub)}</p>${a.items.length ? `<ul>${a.items.map(x => `<li data-p="${x.pid}" tabindex="0">${x.n !== undefined ? lvTag(x.n) : ''}<b>${esc(x.name)}</b><span>${esc(x.why)}</span></li>`).join('')}</ul>` : ''}${a.note ? `<div class="imp">${esc(a.note)}</div>` : ''}<small class="srcs">Sources: ${esc(a.src)}</small></div></div>`;
}
function vIntel() {
  return `<div class="ph"><div><h2>BESSMIND Intelligence</h2><small>Continuous monitoring of project emails, files and systems</small></div><div class="live"><i></i>Monitoring ${S.projects.length} projects · ${S.docs.length} documents indexed</div></div>
  <div class="two"><div class="panel"><div class="p-h"><h3>Ask BESSMIND</h3><small>Computed from the live project model</small></div><div class="ask">
    <form id="askf"><input id="askq" placeholder="Which projects are at risk of missing COD?" autocomplete="off" aria-label="Ask BESSMIND"><button class="btn pri" type="submit">Ask</button></form>
    <div class="sug">${sugList().map(q => `<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div><div id="ans">${ANS}</div></div></div>
  <div class="panel"><div class="p-h"><h3>Activity</h3><small>Last sync ${fmtT(Date.now())}</small></div><ul class="act">${S.changes.slice(0, 12).map(c => `<li data-p="${c.p}" tabindex="0" class="${Date.now() - c.t < 120000 ? 'new' : ''}"><time>${fmtT(c.t)}</time><div><b>${esc(c.text)}</b><small>${esc(pname(c.p))} · ${esc(c.src)}</small></div></li>`).join('')}</ul></div></div>`;
}

/* ---------- Risk engine ---------- */
/* ---------- Documents: semantic search ---------- */
const SYN = [['grid', 'netz', 'operator', 'tennet', 'connection', 'energisation', 'energization', 'anschluss'], ['date', 'deadline', 'expected', 'planned', 'scheduled', 'target', 'when'], ['permit', 'approval', 'genehmigung', 'condition', 'noise', 'sound'], ['supplier', 'quote', 'price', 'delivery', 'contract', 'order'], ['schedule', 'epc', 'cod', 'commissioning', 'milestone']];
const STOP = new Set('show me every all the a an of in on for and or to is are what which that mention mentioning mentions documents document with about find'.split(' '));
function searchDocs(q, pid) {
  const k = (q.toLowerCase().match(/[a-zäöüß0-9]+/g) || []).filter(t => !STOP.has(t)); if (!k.length) return [];
  const exp = new Set(k); k.forEach(t => SYN.forEach(g => { if (g.includes(t)) g.forEach(x => exp.add(x)); }));
  return S.docs.filter(d => pid === 'all' || d.p === pid).map(d => { const w = new Set(((d.name + ' ' + d.text).toLowerCase().match(/[a-zäöüß0-9]+/g)) || []); let sc = 0; k.forEach(t => { if (w.has(t)) sc += 3; }); exp.forEach(t => { if (!k.includes(t) && w.has(t)) sc += 1; }); if (d.cur) sc += .5; return { d, sc, k }; }).filter(x => x.sc >= 3).sort((a, b) => b.sc - a.sc);
}
const hl = (t, k) => esc(t).replace(new RegExp('(\\b(?:' + k.map(x => x.replace(/[^a-zäöüß0-9]/g, '')).join('|') + ')\\b|' + DATE_SRC + ')', 'gi'), '<mark>$1</mark>');
function conclude(res) {
  const by = {}; res.forEach(x => { const ds = dates(x.d.text).filter(s => pd(s) !== null); if (x.d.cur && ds.length && /connection/i.test(x.d.name + ' ' + x.d.text)) (by[x.d.p] = by[x.d.p] || []).push({ x, s: ds[0], v: pd(ds[0]) }); });
  const out = [];
  Object.entries(by).forEach(([pid, arr]) => { if (arr.length < 2) return; arr.sort((a, b) => a.x.d.date < b.x.d.date ? -1 : 1); const a = arr[0], b = arr[arr.length - 1], diff = Math.round(b.v - a.v); if (!diff) return; out.push({ pid, diff, a, b, epc: S.docs.find(d => d.p === pid && d.cur && /dependent on grid connection/i.test(d.text)) }); });
  return out;
}
function dres() {
  if (!DS.q) return '';
  const res = searchDocs(DS.q, DS.p), k = res[0] ? res[0].k : [], con = conclude(res.slice(0, 8));
  if (!res.length) return '<div class="panel"><div class="pad">No document matches this query.</div></div>';
  return `<div class="panel"><div class="p-h"><h3>${res.length} results</h3><small>${esc(DS.q)}</small></div><ul class="res">${res.slice(0, 7).map(x => `<li><div class="rh"><b>${esc(x.d.name)}</b>${x.d.ver ? `<span class="ver ${x.d.cur ? '' : 'old'}">${esc(x.d.ver)}${x.d.cur ? '' : ' · superseded'}</span>` : ''}<small>${esc(pname(x.d.p))} · ${esc(x.d.src)} · ${fmtD(x.d.date)}${x.d.page ? ' · p. ' + x.d.page : ''}</small></div><p>${hl(x.d.text, k)}</p></li>`).join('')}</ul></div>` +
    `<div class="concl"><small class="lbl">BESSMIND CONCLUSION</small>` + (con.length ? con.map(c => { const p = proj(c.pid), key = c.pid + ':' + c.diff;
      return `<p><b>${esc(p.name)}:</b> the latest information (${esc(c.b.x.d.name)}, ${fmtD(c.b.x.d.date)}) gives ${esc(c.b.s)}, versus ${esc(c.a.s)} in ${esc(c.a.x.d.name)}. That is a ${Math.abs(c.diff)}-day ${c.diff > 0 ? 'delay' : 'advance'} to grid connection.${c.epc && c.diff > 0 ? ` This conflicts with the current ${esc(c.epc.name)} ${esc(c.epc.ver)}, where COD depends on grid connection.` : ''}</p>` +
        (c.diff > 0 ? (S.applied[key] ? '<div class="done">Timeline updated</div>' : `<button class="btn pri" data-apply="${key}" type="button">Apply to timeline</button>`) : ''); }).join('') : `<p>${res.length} documents match. No conflicting dates found between current documents.</p>`) + '</div>';
}
function docRows() {
  const rows = S.docs.filter(d => DS.p === 'all' || d.p === DS.p);
  return '<tr><th>Document</th><th>Version</th><th>Project</th><th>Found in</th><th>Date</th></tr>' + rows.map(d => `<tr class="${d.cur ? '' : 'old'}"><td>${esc(d.name)}</td><td>${d.ver ? `<span class="ver ${d.cur ? '' : 'old'}">${esc(d.ver)}${d.cur ? ' · current' : ' · superseded'}</span>` : ''}</td><td>${esc(pname(d.p))}</td><td><span class="src">${esc(d.src)}</span></td><td>${fmtD(d.date)}</td></tr>`).join('');
}
const DSUG = ['Show me every document mentioning the grid connection date.', 'Which documents mention permit conditions?', 'Find supplier quote and delivery documents.'];
function vDocs() {
  return `<div class="ph"><div><h2>Documents</h2><small>${S.docs.length} documents indexed across email, SharePoint and files. Old versions are marked.</small></div></div>
  <form id="dsf" class="dsearch"><input id="dq" value="${esc(DS.q)}" placeholder="Show me every document mentioning the grid connection date." autocomplete="off" aria-label="Search documents"><select id="dp" aria-label="Project"><option value="all">All projects</option>${S.projects.map(p => `<option value="${p.id}" ${DS.p === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="btn pri" type="submit">Search</button></form>
  <div class="sug">${DSUG.map(q => `<button type="button" data-dq="${esc(q)}">${esc(q)}</button>`).join('')}</div><div id="dres">${dres()}</div>
  <div class="panel"><div class="p-h"><h3>All documents</h3></div><div class="tw"><table id="dt">${docRows()}</table></div></div>`;
}
function applyDoc(key) {
  const [pid, d] = key.split(':'), days = +d, p = proj(pid);
  shiftProject(p, 'Grid connection', days, 'Current documents show a later connection date', 'Conflicting dates found in current documents');
  p.why.unshift({ cat: 'Grid', pts: 15, title: 'Grid connection moved +' + days + ' days', ev: 'Grid operator correspondence conflicts with the grid connection agreement', t: Date.now() }, { cat: 'Schedule', pts: 10, title: 'COD follows grid connection', ev: 'EPC schedule: COD depends on grid connection', t: Date.now() });
  S.changes.unshift({ t: Date.now(), p: pid, text: 'Grid connection moved +' + days + ' days', src: 'Documents', ev: 'Detected by comparing current documents' });
  S.applied[key] = 1; save(); render(); openDrawer(pid);
}

/* ---------- Tasks / Filings ---------- */
function vTasks() {
  return `<div class="ph"><div><h2>Tasks</h2><small>Created automatically from incoming messages</small></div></div><div class="panel pad">${S.tasks.length ? S.tasks.map(t => `<label class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-t="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.text)}<small>${esc(pname(t.p))}${t.due ? ' · due ' + esc(t.due) : ''}</small></span></label>`).join('') : 'No tasks yet. Process a message to create some.'}</div>`;
}
/* ---------- Project drawer with living timeline ---------- */
function timelineHtml0(p) {
  const now = nowM(), yr = [[2026, 12], [2027, 24], [2028, 36]], fresh = p.fresh, grid = yr.map(([, m]) => `<u style="left:${px2(m)}%"></u>`).join('');
  const mv = r => Math.abs(r.e - r.e0) > .02 || Math.abs(r.s - r.s0) > .02, W = (a, b) => (px2(b) - px2(a)).toFixed(2);
  const rows = p.tl.map((r, i) => { const m = mv(r), s = fresh ? r.s0 : r.s, e = fresh ? r.e0 : r.e;
    return `<div class="tl-r"><span>${ROWS[i]}</span><div class="trk">${grid}${m ? `<i class="tb ghost" style="left:${px2(r.s0)}%;width:${W(r.s0, r.e0)}%"></i>` : ''}<i class="tb ${m ? 'moved' : ''}" data-l="${px2(r.s)}%" data-w="${W(r.s, r.e)}%" style="left:${px2(s)}%;width:${W(s, e)}%"></i><em class="today" style="left:${px2(now)}%"></em></div></div>`; }).join('');
  const L5 = p.tl[4], m5 = mv(L5);
  return `<div class="tl-r tl-h"><span></span><div class="trk">${yr.map(([y, m]) => `<b style="left:${px2(m)}%">${y}</b>`).join('')}</div></div>${rows}<div class="tl-r"><span>COD · ${esc(p.cod)}</span><div class="trk">${grid}${m5 ? `<s class="cdm ghost" style="left:${px2(L5.e0)}%"></s>` : ''}<s class="cdm ${m5 ? 'moved' : ''}" data-l="${px2(L5.e)}%" style="left:${px2(fresh ? L5.e0 : L5.e)}%"></s><em class="today" style="left:${px2(now)}%"></em></div></div>`;
}
const closeAll = () => { $('#pop').hidden = true; $('#drawer').hidden = true; $('#inbox').hidden = true; $('#imp').hidden = true; };

const TITLES = { portfolio: 'Portfolio', intel: 'Intelligence', risk: 'Risk', documents: 'Documents', tasks: 'Tasks', filings: 'Filings' };
let RENDERED = '';
function render() {
  $('#tc').textContent = S.tasks.filter(t => !t.done).length || '';
  $('#mon').textContent = 'Monitoring ' + S.projects.length + ' projects';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === (view === 'project' ? 'portfolio' : view)));
  $('#psel').innerHTML = '<option value="auto">Detect from message</option>' + S.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#main').innerHTML = { portfolio: vPortfolio, intel: vIntel, risk: vRisk, documents: vDocs, tasks: vTasks, filings: vFilings, sources: vSources, project: vProject }[view]();
  if (RENDERED !== view) { RENDERED = view; const m = $('#main'); if (m) m.scrollTop = 0; }
  if (view === 'portfolio') initMap(); else { try { if (MAP) MAP.remove(); } catch {} MAP = null; }
}

document.addEventListener('click', e => {
  const t = e.target, g = s => t.closest(s);
  if (g('[data-flt]')) { flt = g('[data-flt]').dataset.flt; refreshList(); return; }
  if (g('[data-sort]')) { const k = g('[data-sort]').dataset.sort; srt = { k, d: srt.k === k ? -srt.d : (k === 'name' ? 1 : -1) }; refreshList(); return; }
  if (g('[data-view]')) { view = g('[data-view]').dataset.view; render(); return; }
  if (g('[data-rsel]')) { S.rsel = g('[data-rsel]').dataset.rsel; view = 'risk'; $('#drawer').hidden = true; render(); return; }
  if (g('[data-step]')) { const [id, i] = g('[data-step]').dataset.step.split(':'); openPop(id, +i); return; }
  if (g('[data-close-pop]') || t.id === 'pop') { $('#pop').hidden = true; return; }
  if (g('[data-close]') || t.id === 'drawer') { $('#drawer').hidden = true; return; }
  if (g('[data-apply]')) { applyDoc(g('[data-apply]').dataset.apply); return; }
  if (g('[data-ask]')) { runAsk(g('[data-ask]').dataset.ask); return; }
  if (g('[data-dq]')) { DS.q = g('[data-dq]').dataset.dq; render(); return; }
  if (g('[data-p]')) { $('#inbox').hidden = true; openDrawer(g('[data-p]').dataset.p); return; }
  if (g('[data-sample]')) { $('#msg').value = SAMPLES[+g('[data-sample]').dataset.sample]; $('#psel').value = 'auto'; return; }
  if (t.id === 'cp-save') { const v = $('#cp-in').value.trim(); if (v) { S.filings[S.sel].cp = v; save(); render(); } }
  if (t.id === 'confirm') { S.filings[S.sel].done = true; save(); render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); if (e.key === 'Enter' && e.target.dataset) { if (e.target.dataset.p) openDrawer(e.target.dataset.p); if (e.target.dataset.rsel) { S.rsel = e.target.dataset.rsel; render(); } } });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.t) { S.tasks.find(x => x.id == t.dataset.t).done = t.checked; save(); render(); }
  if (t.id === 'dp') { DS.p = t.value; if (DS.q) render(); else $('#dt').innerHTML = docRows(); }
  if (t.id === 'fsel') { S.sel = t.value; save(); render(); }
});
document.addEventListener('input', e => { if (e.target.id === 'pq') { qry = e.target.value; refreshList(); } });
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'askf') runAsk($('#askq').value.trim());
  if (e.target.id === 'dsf') { DS.q = $('#dq').value.trim(); DS.p = $('#dp').value; render(); }
});
async function runAsk(q) {
  if (!q) return;
  const box = $('#ans'); if (box) box.innerHTML = ANS + '<p class="think">Analyzing ' + S.projects.length + ' projects and ' + S.docs.length + ' documents</p>';
  await sleep(reduce ? 0 : 600);
  ANS = ansHtml(q, ask(q)) + ANS; if (view !== 'intel') view = 'intel'; render();
}
$('#open-inbox').onclick = () => { $('#inbox').hidden = false; $('#msg').focus(); };
$('#close-inbox').onclick = () => { $('#inbox').hidden = true; };
$('#reset').onclick = () => { S = seed(); save(); pulse = []; DS = { q: '', p: 'all' }; ANS = ''; $('#result').innerHTML = ''; $('#pipe').innerHTML = ''; render(); };

const PIPE = ['Reading message', 'Understanding what changed', 'Tracing consequences', 'Updating the project model'], TAG = { risk: 'RISK', ok: 'OK', action: 'TASK', info: 'INFO', milestone: 'DATE' };
$('#analyze').onclick = async () => {
  const text = $('#msg').value.trim(), box = $('#result'), pipe = $('#pipe');
  box.innerHTML = ''; pipe.innerHTML = '';
  if (!text) { box.innerHTML = '<p>Paste a message first.</p>'; return; }
  const r = analyze(text, $('#psel').value);
  if (r.error) { box.innerHTML = `<p>${esc(r.error)}</p>`; return; }
  pipe.innerHTML = PIPE.map(s => `<li>${s}</li>`).join('');
  for (const li of pipe.children) { await sleep(reduce ? 0 : 420); li.classList.add('on'); }
  pulse = r.results.map(x => x.p.id);
  box.innerHTML = r.results.map(x => `<div class="result"><b>${esc(x.p.name)}</b> · RTB ${x.before}% → ${x.p.rtb}% · risk ${rk(x.p).total}% · <a data-p="${x.p.id}">Open project</a>
    <ul class="fl">${x.findings.map(f => `<li><span class="tg ${f.type}">${TAG[f.type]}</span> <b>${esc(f.title)}</b>${f.detail ? ' · ' + esc(f.detail) : ''}${f.due ? ' (due ' + esc(f.due) + ')' : ''}${f.shift ? `<div class="shiftn">Timeline: ${f.shift.row} +${f.shift.days} days · COD now ${esc(x.p.cod)}</div>` : ''}${f.cons ? '<ul>' + f.cons.map(c => `<li>${esc(c)}</li>`).join('') + '</ul>' : ''}<em>“${esc(f.ev.slice(0, 110))}${f.ev.length > 110 ? '…' : ''}”</em></li>`).join('')}</ul></div>`).join('');
  $('#msg').value = ''; render();
};

