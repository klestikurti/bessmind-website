/* BESSMIND project layer (prototype)
   - honest portfolio views: imported projects show facts and sources, never invented scores
   - project drawer + full project page with one page per section (Procurement, Grid, Permits ... Others)
   - import / review UI built on the standardized information catalog (ingest.js)
   - fact answers in Intelligence ("What is the capacity of BESS X?") taken from the extracted documents */
const STEPSEC = ['site', 'perm', 'grid', 'contr', 'proc', 'cons', 'cons', 'docs', 'ops', 'ops', 'ops', 'ops'];
const CORE = ['mw', 'mwh', 'kv', 'street', 'postal', 'city', 'permit_status', 'operator', 'connpoint', 'grid_status', 'grid_date', 'supplier', 'contract_status', 'fin_status', 'cod'];
const FIELD_SECS = ['ov', 'site', 'perm', 'grid', 'contr', 'proc', 'fin', 'cons', 'ops'];
const DOCSEC = { 'Grid connection': 'grid', Permit: 'perm', Contract: 'contr', Quote: 'proc', Schedule: 'cons', Financing: 'fin' };
const TASKSEC = { site: /site|lease|land|address|parcel/i, perm: /permit|genehm|noise|condition|auflage/i, grid: /grid|connection|\bE1\b|\bE8\b|operator|PCS|protection|netz/i, contr: /contract|supplier|EPC|agreement/i, proc: /quote|delivery|transformer|price|order|supplier/i, fin: /financ|loan|term sheet|lender/i, cons: /construction|commission|schedule|COD/i, ops: /warranty|maintenance|monitoring/i };
let PV = { id: null, sec: 'ov' }, LASTP = null;
const HOPEN = new Set();

/* ---------- helpers ---------- */
const itemsOf = (p, k) => (p.items || []).filter(x => x.k === k);
const fieldsIn = sec => CAT.filter(c => c[1] === sec);
function valOf(p, k) {
  const a = itemsOf(p, k); if (a.length) return a;
  const l = LEGK[k]; if (p.demo && l && p[l[0]] != null && p[l[0]] !== '') return [{ k, v: l[1](p[l[0]]), num: p[l[0]], ev: { doc: 'Sample project record', date: '', s: '' } }];
  if (p.demo && k === 'city' && p.city) return [{ k, v: p.city, ev: { doc: 'Sample project record', date: '', s: '' } }];
  return [];
}
function secCount(p, sec) {
  if (sec === 'docs') return S.docs.filter(d => d.p === p.id).length;
  if (sec === 'act') return S.tasks.filter(t => t.p === p.id && !t.done).length;
  if (sec === 'oth' || sec === 'ctc') return fieldsIn(sec).reduce((a, c) => a + valOf(p, c[0]).length, 0);
  return fieldsIn(sec).filter(c => valOf(p, c[0]).length).length;
}
const completeness = p => { const have = CORE.filter(k => valOf(p, k).length).length; return { have, total: CORE.length, pct: Math.round(have / CORE.length * 100), miss: CORE.filter(k => !valOf(p, k).length) }; };
const dshow = d => { try { return d && /^\d{4}-\d{2}-\d{2}/.test(d) && d > '2000' ? fmtD(d) : ''; } catch { return ''; } };
const evSrc = ev => !ev ? '' : ev.doc === 'Manual entry' ? 'Entered by you' : ev.doc + (ev.pg ? ' · p. ' + ev.pg : '') + (dshow(ev.date) ? ' · ' + dshow(ev.date) : '');
const srcCell = ev => ev ? `<span class="src">${esc(evSrc(ev))}</span>${ev.s ? `<small>“${esc(ev.s.slice(0, 170))}”</small>` : ''}` : '';
const evq = ev => ev ? `<small>${esc(evSrc(ev))}${ev.s ? ' · “' + esc(ev.s.slice(0, 110)) + '”' : ''}</small>` : '';
const v1 = (p, k) => (valOf(p, k)[0] || {}).v || '';
const addrOf = p => [v1(p, 'street'), [v1(p, 'postal'), v1(p, 'city')].filter(Boolean).join(' '), v1(p, 'state')].filter(Boolean).join(', ');
const geoLine = p => p.geo ? (p.geo.prec === 'not found' ? 'Map position: address not found' : 'Map position: ' + p.geo.prec + (p.geo.src ? ' · ' + p.geo.src : '')) : (p.lat != null ? 'Map position: sample data' : 'No map position yet (no location found)');
const docSec = d => DOCSEC[d.kind] || (d.kind === 'Email' ? null : null);
function nextStep(p) {
  const t = S.tasks.find(x => x.p === p.id && !x.done); if (t) return t.text;
  const m = completeness(p).miss[0]; return m ? 'Find: ' + CATK[m].label : 'All key facts known';
}
function secOfChange(c) {
  if (c.sec) return c.sec; const t = c.text + ' ' + (c.ev || '');
  return /grid|connection|energi|operator|N-1/i.test(t) ? 'grid' : /permit|noise|condition/i.test(t) ? 'perm' : /supplier|quote|price|deliver|transformer/i.test(t) ? 'proc' : /contract/i.test(t) ? 'contr' : /financ/i.test(t) ? 'fin' : /cod|construction|commission|delay|schedule/i.test(t) ? 'cons' : 'ov';
}

/* ---------- migration: remove everything older versions invented ---------- */
function migrate() {
  S.learn = S.learn || { ent: {}, kw: {} }; S.learn.ent = S.learn.ent || {}; S.learn.kw = S.learn.kw || {};
  S.log = S.log || []; S.tasks = S.tasks || []; S.docs = S.docs || []; S.changes = S.changes || [];
  S.projects.forEach(p => {
    if (p.items) {                       // older workspaces: sentences filed as a parcel become notes; duplicate parcels / amounts collapse to the newest, the rest goes to the history
      p.items.forEach(x => { if (x.k === 'parcel' && !/\d/.test(x.v)) x.k = 'nt_site'; });
      ['parcel', 'fin_amount'].forEach(k => {
        const l = p.items.filter(x => x.k === k).sort((a, b) => (((a.ev && a.ev.date) || '') < ((b.ev && b.ev.date) || '') ? -1 : ((a.ev && a.ev.date) || '') > ((b.ev && b.ev.date) || '') ? 1 : (a.t || 0) - (b.t || 0)));
        if (l.length < 2) return;
        for (let i = 0; i < l.length - 1; i++) (p.hist = p.hist || []).push({ k, sec: CATK[k].sec, label: CATK[k].label, old: l[i].v, oldEv: l[i].ev, new: l[i + 1].v, ev: l[i + 1].ev, t: l[i + 1].t || 0, days: 0 });
        const keep = l[l.length - 1]; p.items = p.items.filter(x => x.k !== k || x === keep);
      });
    }
    if (S.sample && ['heide', 'nord', 'sued', 'west', 'ost'].includes(p.id) && !p.items) p.demo = true;
    if (!p.demo && !p.items) {
      const LK = { mw: 'mw', mwh: 'mwh', kv: 'kv', city: 'city', operator: 'operator', cod: 'cod', energisation: 'energisation', grid: 'grid_date' }; p.items = []; p.hist = p.hist || [];
      Object.entries(p.fs || {}).forEach(([k, f]) => { const key = LK[k]; if (!key) return; p.items.push({ id: 'i' + (S.nextId++), k: key, v: f.value, num: KEYNUM.has(key) ? parseFloat(f.value) : undefined, rk: 0, alts: [], ev: { doc: (f.src || '').split(' · ')[0] || 'Imported data', pg: null, date: new Date(p.created || Date.now()).toISOString().slice(0, 10), s: f.ev || '' }, t: p.created || Date.now() }); });
      if (!p.items.some(i => i.k === 'city')) { p.city = ''; p.lat = null; p.lon = null; }
      p.rtb = null; p.tl = null; p.t = null; p.done = 0; p.tlAssumed = false; p.codEst = false; p.cod = ''; p.trend = []; p.why = []; p.f = p.f || ['none', 'none', 'none', 'none']; p.fsrc = p.fsrc || [null, null, null, null];
      syncDerived(p);
    }
    if (!p.demo) { p.rtb = null; p.tl = null; p.t = null; p.hist = p.hist || []; p.items = p.items || []; }
  });
  save();
}

/* ---------- portfolio ---------- */
function tableHtml(l) {
  const th = (k, t) => `<th><button data-sort="${k}" type="button">${t}${srt.k === k ? (srt.d > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `<table class="pt"><tr>${th('name', 'Project')}<th>Stage</th>${th('mw', 'Capacity')}${th('rtb', 'RTB probability')}${th('risk', 'Risk')}${th('prog', 'Progress / data')}${th('cod', 'Target COD')}<th>Status</th><th>Next step</th></tr>` +
    (l.map(p => {
      const sc = isSc(p), last = S.changes.find(c => c.p === p.id), cm = completeness(p), k = Math.min(p.done, 11);
      return `<tr data-p="${p.id}" tabindex="0"><td><b>${esc(p.name)}</b><small>${p.city ? esc(p.city) : '<span class="na">Location not found</span>'}${last ? ' · updated ' + ago(last.t) : ''}</small></td>
      <td><span class="stg" style="--c:${PH[p.phase]}">${p.phase}</span></td><td><b>${p.mw ?? '—'}</b> ${p.mw != null ? 'MW' : ''}<small>${p.mwh ?? '—'} MWh · ${p.kv ?? '—'} kV</small></td>
      <td>${sc ? `<div class="rt"><b>${p.rtb}%</b><span class="pg"><i class="${p.rtb < 60 ? 'risk' : ''}" style="width:${p.rtb}%"></i></span>${spark(p)}</div>` : '<span class="na">—</span><small>not assessed</small>'}</td>
      <td>${sc ? lvTag(rk(p).total) : '<span class="lv na">Incomplete data</span>'}</td>
      <td>${sc ? `<div class="rt"><span class="pg"><i style="width:${Math.round(p.done / 12 * 100)}%"></i></span></div><small>${p.done} of 12 steps</small>` : `<div class="rt"><span class="pg"><i style="width:${cm.pct}%"></i></span></div><small>${cm.have} of ${cm.total} key facts</small>`}</td>
      <td>${p.cod ? esc(p.cod) : '<span class="na">—</span>'}${delayDays(p) && sc ? `<small class="warn">+${delayDays(p)} days</small>` : ''}</td>
      <td><span class="rag ${cls(p)}">${status(p)}</span></td><td>${sc ? STEPS[k][0] : esc(nextStep(p))}</td></tr>`;
    }).join('') || '<tr><td colspan="9">No projects match.</td></tr>') + '</table>';
}
function vPortfolio0() {
  const P = S.projects, tot = P.length, sc = P.filter(isSc), mwP = P.filter(p => p.mw != null), mw = mwP.reduce((a, p) => a + p.mw, 0);
  const avg = sc.length ? Math.round(sc.reduce((a, p) => a + p.rtb, 0) / sc.length) : null, avgR = sc.length ? Math.round(sc.reduce((a, p) => a + rk(p).total, 0) / sc.length) : null, [rl, rc] = avgR != null ? lvl(avgR) : ['', ''];
  const imp = sc.reduce((a, p) => a + impact(p), 0), atRisk = sc.filter(p => p.rtb < 60).length, ready = sc.filter(p => p.rtb >= 90).length, day = S.changes.filter(c => Date.now() - c.t < 26 * H), l = listP();
  const cmAvg = tot ? Math.round(P.reduce((a, p) => a + completeness(p).pct, 0) / tot) : 0;
  return `<div class="ph"><div><h2>Portfolio</h2><small>${S.sample ? 'Sample portfolio. ' : ''}Every figure traces back to its source. Missing information stays empty.</small></div>
    <div class="ctl"><input id="pq" type="search" placeholder="Search projects" value="${esc(qry)}" aria-label="Search projects"><div class="seg" id="seg">${segHtml()}</div></div></div>
  <div class="kstrip"><div><small>Projects</small><b>${tot}</b><em>${sc.length ? ready + ' ready to build · ' + atRisk + ' at risk' : 'built from your documents'}</em></div>
    <div><small>Capacity</small><b>${mwP.length ? fmt(mw) : '—'} <i>${mwP.length ? 'MW' : ''}</i></b><em>${mwP.length} of ${tot} with capacity found</em></div>
    <div><small>Avg. RTB probability</small><b>${avg != null ? avg + '<i>%</i>' : '—'}</b><em>${sc.length ? 'across ' + sc.length + ' assessed projects' : 'not assessed for imported projects'}</em></div>
    <div><small>Portfolio risk</small><b class="${rc}">${avgR != null ? avgR + '<i>%</i>' : '—'}</b><em>${avgR != null ? rl + ' · weighted average' : 'needs a schedule baseline and verified readiness data'}</em></div>
    ${sc.length ? `<div><small>Est. revenue impact</small><b class="${imp ? 'warn' : ''}">${eur(imp)}</b><em>Illustrative: delay days × MW × €${RATE}/day</em></div>` : `<div><small>Data completeness</small><b>${cmAvg}<i>%</i></b><em>of ${CORE.length} key facts per project</em></div>`}</div>
  <div class="mrow">
    <div class="panel"><div class="p-h"><h3>Project locations</h3><span class="mlg"><span><i style="background:#2de2a6"></i>On track</span><span><i style="background:#f5a524"></i>At risk</span><span><i style="background:#ff5c5c"></i>High risk</span><span><i style="background:#34c9ee"></i>Ready</span><span><i style="background:#7c8791"></i>Not assessed</span></span></div><div id="map"></div></div>
    <div class="panel dg"><div class="p-h"><h3>Daily digest</h3><small>Last 24 hours</small></div>
      <p class="sum">${day.length} changes across ${new Set(day.map(c => c.p)).size} projects. ${atRisk ? atRisk + (atRisk > 1 ? ' projects need' : ' project needs') + ' attention.' : ''}</p>
      <ul class="tl">${day.slice(0, 6).map(c => `<li data-p="${c.p}" tabindex="0"><i></i><div><b>${esc(c.text)}</b><small>${esc(pname(c.p))} · ${esc(c.src)} · ${ago(c.t)}</small></div></li>`).join('') || '<li>No changes</li>'}</ul></div></div>
  <div class="panel"><div class="p-h"><h3>Projects</h3><small id="cnt">${l.length} of ${tot}</small></div><div class="tw" id="ptw">${tableHtml(l)}</div></div>
  <div class="panel"><div class="p-h"><h3>Schedule</h3><small>Phases and target COD</small></div><div id="gw">${ganttHtml(l)}</div></div>`;
}
function vRisk0() {
  const L2 = S.projects.map(p => ({ p, r: rk(p) })).sort((a, b) => (isSc(b.p) - isSc(a.p)) || b.r.total - a.r.total), sel = proj(S.rsel) || L2[0].p, r = rk(sel), [rl, rc] = lvl(r.total);
  const list = `<div class="panel"><div class="p-h"><h3>Projects by risk</h3><small>${L2.length}</small></div><ul class="rl">${L2.map(x => `<li class="${x.p.id === sel.id ? 'on' : ''}" data-rsel="${x.p.id}" tabindex="0"><b>${esc(x.p.name)}</b>${isSc(x.p) ? `<span class="rbar sm"><i class="${lvl(x.r.total)[1]}" style="width:${x.r.total}%"></i></span>${lvTag(x.r.total)}` : '<span class="lv na">Incomplete data</span>'}</li>`).join('')}</ul></div>`;
  if (!isSc(sel)) {
    const cm = completeness(sel), sig = (sel.why || []).slice(0, 6);
    return `<div class="ph"><div><h2>Portfolio risk</h2><small>Risk is only shown where it can be explained with verified data.</small></div></div><div class="two risk2">${list}
    <div class="panel rdet"><div class="p-h"><h3>${esc(sel.name)}</h3><small>${esc(sel.city || 'Location not found')}</small></div><div class="pad">
      <small class="lbl">PROJECT RISK</small><div class="rk-big"><b>—</b><em>Not calculated</em></div>
      <p>BESSMIND does not estimate risk from missing data. A risk score needs a schedule baseline (permit, grid connection, delivery and construction dates) and at least 3 of 4 readiness factors backed by documents.</p>
      <p><b>${cm.have} of ${cm.total}</b> key facts are known. Missing: ${esc(cm.miss.slice(0, 8).map(k => CATK[k].label).join(', ')) || 'none'}.</p>
      ${sig.length ? `<h3 class="sh">Signals reported in documents</h3><ul class="why">${sig.map(w => `<li><div><b>${esc(w.cat)}</b> · ${esc(w.title)}<small>Source: “${esc((w.ev || '').slice(0, 120))}”</small></div></li>`).join('')}</ul>` : ''}
      <button class="btn" data-page="${sel.id}" type="button">Open project page</button></div></div></div>`;
  }
  const why = (sel.why || []).slice().sort((a, b) => b.pts - a.pts), seen = new Set(why.map(w => w.cat)), base = CATS.map((c, i) => [c, r.sc[i], baseReason(c, sel)]).filter(x => x[2] && !seen.has(x[0]));
  return `<div class="ph"><div><h2>Portfolio risk</h2><small>Five weighted categories. Every point of risk is explained.</small></div></div>
  <div class="two risk2">${list}
  <div class="panel rdet"><div class="p-h"><h3>${esc(sel.name)}</h3><small>${esc(sel.city)}</small></div><div class="pad">
    <small class="lbl">PROJECT RISK</small><div class="rk-big ${rc}"><b>${r.total}</b><span>%</span><em>${rl}</em></div><div class="rbar"><i class="${rc}" style="width:${r.total}%"></i></div>
    <div class="cats">${CATS.map((c, i) => `<div class="cat"><span>${c}</span><div class="rbar sm"><i class="${lvl(r.sc[i])[1]}" style="width:${r.sc[i]}%"></i></div><b>${r.sc[i]}</b></div>`).join('')}</div>
    <small class="lbl">WEIGHTS: SCHEDULE 25 · PERMITTING 20 · GRID 25 · PROCUREMENT 15 · FINANCIAL 15</small>
    <h3 class="sh">Why is risk ${r.total}%?</h3><ul class="why">${why.map(w => `<li><b class="pts">+${w.pts}</b><div><b>${w.cat}</b> · ${esc(w.title)}<small>Source: “${esc(w.ev.slice(0, 120))}”</small></div></li>`).join('')}${base.map(x => `<li><b class="pts">${x[1]}</b><div><b>${x[0]}</b> · ${esc(x[2][0])}<small>${x[2][1] ? 'Source: ' + esc(x[2][1]) : 'No source document available'}</small></div></li>`).join('')}${!why.length && !base.length ? '<li><div>No material risk drivers.</div></li>' : ''}</ul>
    ${delayDays(sel) ? `<div class="imp">Estimated revenue impact: ${eur(impact(sel))} (+${delayDays(sel)} days × ${sel.mw || 0} MW × €${RATE}/day, illustrative)</div>` : ''}
    <button class="btn" data-p="${sel.id}" type="button">Open project and timeline</button></div></div></div>`;
}

/* ---------- milestones (dated facts, with the previous date shown when it changed) ---------- */
function msHtml(p) {
  const ks = ['permit_date', 'con_start', 'grid_date', 'energisation', 'commissioning', 'cod'], rows = ks.map(k => ({ k, it: itemsOf(p, k)[0] })).filter(x => x.it);
  if (!rows.length) return '<div class="note">No dated milestones found yet. Import a document with a grid connection date, construction start or COD and they appear here.</div>';
  const pts = rows.map(x => ({ ...x, m: dm(x.it.v) })).filter(x => isFinite(x.m)).sort((a, b) => a.m - b.m), hist = (p.hist || []).filter(h => KEYDATE.has(h.k) && isFinite(dm(h.old)));
  let h = '';
  if (pts.length) {
    const all = pts.map(x => x.m).concat(hist.map(x => dm(x.old))), lo = Math.min(...all) - 1.5, W = Math.max(Math.max(...all) + 1.5 - lo, 8), pc = m => ((m - lo) / W * 100).toFixed(1), now = nowM();
    h += `<div class="msx"><i class="ax"></i>${hist.map(x => `<s class="mk ghost" style="left:${pc(dm(x.old))}%" title="was ${esc(x.old)}"></s>`).join('')}${pts.map((x, i) => `<s class="mk ${i % 2 ? 'dn' : 'up'}" style="left:${pc(x.m)}%"><b>${esc(CATK[x.k].label)}</b><em>${esc(x.it.v)}</em></s>`).join('')}${now > lo && now < lo + W ? `<u class="tdy" style="left:${pc(now)}%"></u>` : ''}</div>`;
  }
  return h + '<table class="ft">' + rows.map(x => { const hs = (p.hist || []).find(y => y.k === x.k); return `<tr><td>${esc(CATK[x.k].label)}</td><td><b>${esc(x.it.v)}</b></td><td>${srcCell(x.it.ev)}</td></tr>`; }).join('') + '</table>';
}

/* ---------- drawer (compact) ---------- */
let CLOSED_PAGE = false;
function openDrawer(id) {
  const p = proj(id); if (!p) return; LASTP = id;
  const sc = isSc(p), r = rk(p), [rl, rc] = lvl(r.total), cm = completeness(p), lab = { ok: 'Complete', open: 'In progress', none: 'No data, not estimated' }, ic = { ok: 'OK', open: 'OPEN', none: 'N/A' };
  const keyFacts = ['mw', 'mwh', 'kv', 'street', 'city', 'operator', 'connpoint', 'permit_status', 'grid_date', 'cod'].map(k => [k, valOf(p, k)[0]]).filter(x => x[1]);
  const sh = (p.shifts || []).slice(0, 3).map(x => `<div class="shift"><b>SHIFT</b> ${x.row} moved +${x.days} days<small>${esc(x.why)}</small></div>`).join('');
  const head = sc ? `<div class="dnum"><div><small>RTB PROBABILITY</small><b class="${cls(p)}">${p.rtb}%</b></div><div><small>PROJECT RISK</small><b class="${rc}">${r.total}%</b></div><div><small>TARGET COD</small><b>${esc(p.cod)}</b></div></div>`
    : `<div class="dnum"><div><small>CAPACITY</small><b>${p.mw != null ? p.mw + ' MW' : '—'}</b></div><div><small>TARGET COD</small><b>${p.cod ? esc(p.cod) : '—'}</b></div><div><small>KEY FACTS</small><b>${cm.have}/${cm.total}</b></div></div>`;
  $('#drawer').innerHTML = `<div role="dialog" aria-label="${esc(p.name)}"><button class="x" data-close type="button" aria-label="Close">✕</button>
  <h2>${esc(p.name)}</h2><small>${esc(addrOf(p) || p.city || 'Location not found')} · ${p.mw ?? '—'} MW · ${p.phase}</small>
  <div class="dact"><button class="btn pri" data-page="${p.id}" type="button">Open full page</button><button class="btn" data-imp="import" type="button">Add data</button></div>
  ${head}
  ${keyFacts.length ? `<h3>KEY FACTS AND SOURCES</h3><ul class="fx">${keyFacts.map(([k, it]) => `<li class="ok"><span>SRC</span><div><b>${esc(CATK[k].label)}</b> ${esc(it.v)}<small style="margin:0;display:block">${esc(evSrc(it.ev))}${it.ev && it.ev.s ? ' · “' + esc(snip(it.ev.s, 120)) + '”' : ''}</small></div></li>`).join('')}</ul>` : ''}
  ${cm.miss.length ? `<h3>NOT FOUND YET</h3><div class="note">${esc(cm.miss.slice(0, 8).map(k => CATK[k].label).join(' · '))}${cm.miss.length > 8 ? ' · +' + (cm.miss.length - 8) + ' more' : ''}. BESSMIND does not guess missing data.</div>` : ''}
  <h3>${sc ? 'TIMELINE' : 'MILESTONES'}</h3>${sc ? `${sh}<div class="tlw">${timelineHtml(p)}</div><div class="glg"><span><i class="tbk"></i>Planned</span><span><i class="tbk gh"></i>Original baseline</span><span><i class="tbk mv"></i>Shifted</span><span><i class="td"></i>Today</span></div>` : msHtml(p)}
  ${sc ? `<h3>RISK BREAKDOWN <a class="lnk" data-rsel="${p.id}">Why is risk ${r.total}%?</a></h3>${CATS.map((c, i) => `<div class="cat"><span>${c}</span><div class="rbar sm"><i class="${lvl(r.sc[i])[1]}" style="width:${r.sc[i]}%"></i></div><b>${r.sc[i]}</b></div>`).join('')}` : `<div class="note">RTB probability and risk are not calculated for imported projects yet. They need a schedule baseline and verified readiness data, and BESSMIND does not estimate missing data.</div>`}
  <h3>READY-TO-BUILD FACTORS</h3><ul class="fx">${FX.map((f, i) => { const it = itemsOf(p, ['permit_status', 'grid_status', 'contract_status', 'fin_status'][i])[0]; return `<li class="${p.f[i]}"><span>${ic[p.f[i]]}</span><b>${f[0]}</b> ${it ? esc(it.v) : lab[p.f[i]]}<small>${it ? esc(evSrc(it.ev)) : p.f[i] === 'none' ? 'no source' : esc(sc ? f[1] : (p.fsrc && p.fsrc[i]) || '')}</small></li>`; }).join('')}</ul>
  <h3>PROJECT STEPS <span class="hintx">click a step</span></h3>${['Planning', 'Building', 'Operation'].map(f => `<div class="phase"><b>${f}</b><div class="steps">${STEPS.map((s, i) => s[1] === f ? `<button class="step ${stepState(p, i)}" data-step="${p.id}:${i}" type="button">${s[0]}</button>` : '').join('')}</div></div>`).join('')}
  <h3>RECENT CHANGES</h3><ul class="feed">${S.changes.filter(c => c.p === id).slice(0, 5).map(c => `<li><b>${esc(c.text)}</b><small>${esc(c.src)} · ${ago(c.t)}${c.ev ? ' · “' + esc(c.ev.slice(0, 90)) + (c.ev.length > 90 ? '…' : '') + '”' : ''}</small></li>`).join('') || '<li>None yet</li>'}</ul></div>`;
  $('#drawer').hidden = false; $('#drawer .x').focus();
  if (p.fresh) setTimeout(() => { document.querySelectorAll('#drawer [data-l]').forEach(b => { b.style.left = b.dataset.l; if (b.dataset.w) b.style.width = b.dataset.w; }); p.fresh = false; save(); }, reduce ? 0 : 250);
}
function openPop(id, i) {
  const p = proj(id); if (!p) return; const [n, ph] = STEPS[i], sec = STEPSEC[i], st = stepState(p, i), cnt = secCount(p, sec), sc = isSc(p);
  const facts = sec === 'docs' || sec === 'act' ? [] : fieldsIn(sec).map(c => valOf(p, c[0])[0]).filter(Boolean).slice(0, 3);
  const Lb = sc ? { done: 'Done', open: 'In progress', risk: 'At risk', todo: 'Not started' } : { open: 'Information available', todo: 'No information yet' };
  $('#pop').innerHTML = `<div class="pop-card" role="dialog" aria-label="${esc(n)}"><button class="x" data-close-pop type="button" aria-label="Close">✕</button><small>${ph} · ${esc(SECN[sec])}</small><h3>${n}</h3>
  ${facts.length ? `<ul class="pf">${facts.map(f => `<li><b>${esc(CATK[f.k].label)}</b> ${esc(f.v)}<small>${esc(evSrc(f.ev))}</small></li>`).join('')}</ul>` : `<p class="na">${cnt ? cnt + ' item' + (cnt === 1 ? '' : 's') + ' on file.' : 'Nothing found for this step in the imported data yet.'}</p>`}
  <span class="st ${st}">${Lb[st] || st}</span><button class="btn pri wide" data-page="${p.id}" data-psec="${sec}" type="button">Open full page: ${esc(SECN[sec])}</button></div>`;
  $('#pop').hidden = false;
}

/* ---------- full project page: one page per section ---------- */
/* History of one section: for every field the values in order, oldest first, each with the date and source of the document that brought it. */
function histPanel(hist) {
  const by = {}; hist.forEach(h => (by[h.k] = by[h.k] || []).push(h));
  const when = h => (h.ev && /^\d{4}-\d{2}-\d{2}/.test(h.ev.date || '') ? h.ev.date : '') || new Date(h.t || 0).toISOString().slice(0, 10);
  const blocks = Object.keys(by).map(k => {
    const l = by[k].slice().sort((a, b) => when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : (a.t || 0) - (b.t || 0)), first = l[0];
    const rows = [{ v: first.old, ev: first.oldEv, days: 0, start: true }].concat(l.map(h => ({ v: h.new, ev: h.ev, days: h.days })));
    rows.reverse();   // newest first: the current value on top, replaced values below, struck through
    return `<div class="hf"><h4>${esc(l[0].label)}</h4><ol class="hl">${rows.map((r, i) => `<li class="${i === 0 ? 'cur' : 'old'}"><time>${esc(dshow(r.ev && r.ev.date) || (r.start ? 'earlier' : ''))}</time>${i === 0 ? `<b>${esc(r.v)}</b>` : `<s>${esc(r.v)}</s>`}${i === 0 && r.days ? ` <span class="warn">(${r.days > 0 ? '+' : ''}${r.days} days)</span>` : ''}${i > 0 ? `<em class="rpl">replaced</em>` : '<em class="rpl now">current</em>'}<small>${esc(r.ev ? evSrc(r.ev) : '')}</small></li>`).join('')}</ol></div>`;
  }).join('');
  return `<div class="panel"><div class="p-h"><h3>History of changes</h3><small>newest first</small></div><div class="pad">${blocks}</div></div>`;
}
function openPage(id, sec) { if (!proj(id)) return; PV = { id, sec: sec || 'ov' }; LASTP = id; closeAll(); view = 'project'; render(); }
function fieldRows(p, sec) {
  return fieldsIn(sec).map(([k, , label]) => {
    const a = valOf(p, k);
    if (!a.length) return `<tr class="mis"><td>${esc(label)}</td><td colspan="2"><span class="miss-l">Not found in the provided data</span></td></tr>`;
    return a.map((it, j) => `<tr><td>${j ? '' : esc(label)}</td><td><b>${esc(it.v)}</b>${it.alts && it.alts.length ? `<small>Also mentioned: ${esc(it.alts.join(', '))}</small>` : ''}</td><td>${srcCell(it.ev)}</td></tr>`).join('');
  }).join('');
}
const STATK = { perm: 'permit_status', grid: 'grid_status', contr: 'contract_status', fin: 'fin_status' };
function statusBlock(p, sec) {
  const k = STATK[sec]; if (!k) return '';
  const it = itemsOf(p, k)[0], st = it ? (it.st || 'open') : 'none';
  return `<div class="stat ${st}"><small>CURRENT STATUS</small><b>${it ? esc(it.v) : 'No status found'}</b><span>${it ? esc(evSrc(it.ev)) : 'Import a document that states the status.'}</span></div>`;
}
const updList = (p, sec) => {
  const ch = S.changes.filter(c => c.p === p.id && (sec === 'ov' || secOfChange(c) === sec));
  const filed = sec === 'ov' || !FIELD_SECS.includes(sec) && sec !== 'ctc' ? [] : (p.items || []).filter(i => CATK[i.k].sec === sec && i.t && i.ev && !ch.some(c => (c.text || '').includes(i.v))).map(i => ({ t: i.t, text: 'Filed: ' + CATK[i.k].label + ': ' + i.v, src: i.ev.doc === 'Manual entry' ? 'Entered by you' : i.ev.doc, ev: i.ev.s }));
  return ch.concat(filed).sort((a, b) => b.t - a.t).slice(0, 12);
};
const updHtml = (p, sec) => { const l = updList(p, sec); return `<div class="panel"><div class="p-h"><h3>Updates and news</h3><small>${l.length}</small></div><ul class="feed pad">${l.map(c => `<li><b>${esc(c.text)}</b><small>${esc(c.src)} · ${ago(c.t)}${c.ev ? ' · “' + esc(c.ev.slice(0, 140)) + '”' : ''}</small></li>`).join('') || '<li class="na">No updates yet for this section.</li>'}</ul></div>`; };
function docsFor(p, sec) {
  const ids = new Set((p.items || []).filter(i => CATK[i.k].sec === sec && i.ev && i.ev.docId).map(i => i.ev.docId));
  return S.docs.filter(d => d.p === p.id && (DOCSEC[d.kind] === sec || ids.has(d.id)));
}
function docLi(d) { return `<li><details><summary><b>${esc(d.name)}</b> ${d.ver ? `<span class="ver ${d.cur ? '' : 'old'}">${esc(d.ver)}${d.cur ? '' : ' · superseded'}</span>` : ''}<small>${esc(d.kind)} · ${esc(d.src)} · ${fmtD(d.date)}</small></summary><p class="excerpt">${esc((d.text || '').slice(0, 900))}${(d.text || '').length > 900 ? '…' : ''}</p></details></li>`; }
function ovHtml(p) {
  const cm = completeness(p), sc = isSc(p);
  const rows = CORE.map(k => { const it = valOf(p, k)[0]; return it ? `<tr><td>${esc(CATK[k].label)}</td><td><b>${esc(it.v)}</b></td><td>${srcCell(it.ev)}</td></tr>` : `<tr class="mis"><td>${esc(CATK[k].label)}</td><td colspan="2"><span class="miss-l">Not found in the provided data</span></td></tr>`; }).join('');
  return `<div class="panel"><div class="p-h"><h3>Key facts</h3><small>${cm.have} of ${cm.total} known</small></div><table class="ft">${rows}</table></div>
  <div class="panel"><div class="p-h"><h3>Milestones</h3></div><div class="pad">${sc ? `<div class="tlw">${timelineHtml(p)}</div>` : msHtml(p)}</div></div>
  <div class="panel"><div class="p-h"><h3>Assessment</h3></div><div class="pad">${sc ? `RTB probability <b>${p.rtb}%</b> · project risk <b>${rk(p).total}%</b>. <a class="lnk" data-rsel="${p.id}">Why?</a>` : 'RTB probability and risk are not calculated for this project. A score needs a schedule baseline and at least 3 of 4 readiness factors backed by documents, and BESSMIND does not estimate missing data.'}</div></div>${updHtml(p, 'ov')}`;
}
function othHtml(p) {
  const o = itemsOf(p, 'other'), by = {}; o.forEach(i => { const k = i.ev ? i.ev.doc : 'Unknown'; (by[k] = by[k] || []).push(i); });
  return `<div class="panel"><div class="p-h"><h3>Others</h3><small>${o.length} note${o.length === 1 ? '' : 's'}</small></div><div class="pad"><p class="na">Statements about this project that match none of the standard fields. Nothing is discarded; nothing is misfiled.</p>${Object.keys(by).map(d => `<h4 class="sec-h">${esc(d)} <small>${esc(by[d][0].ev.kind || '')} · ${dshow(by[d][0].ev.date)}</small></h4><ul class="oth">${by[d].map(i => `<li>${i.hint ? `<span class="hnt">Possibly: ${esc(i.hint)}, value unclear</span>` : ''}${esc(i.v)}${i.ev && i.ev.pg ? `<small>p. ${i.ev.pg}</small>` : ''}</li>`).join('')}</ul>`).join('') || '<p class="miss-l">No other information yet.</p>'}</div></div>`;
}
function secHtml(p, sec) {
  if (sec === 'ov') return ovHtml(p);
  if (sec === 'oth') return othHtml(p);
  if (sec === 'docs') { const d = S.docs.filter(x => x.p === p.id); return `<div class="panel"><div class="p-h"><h3>Documentation</h3><small>${d.length} documents</small></div><ul class="dl pad">${d.map(docLi).join('') || '<li class="na">No documents filed to this project yet.</li>'}</ul></div>${updHtml(p, 'docs')}`; }
  if (sec === 'act') { const t = S.tasks.filter(x => x.p === p.id), rq = itemsOf(p, 'request'); return `<div class="panel"><div class="p-h"><h3>Tasks and requests</h3><small>${t.filter(x => !x.done).length} open</small></div><div class="pad">${t.map(x => `<label class="task ${x.done ? 'done' : ''}"><input type="checkbox" data-t="${x.id}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}<small>${x.due ? 'due ' + esc(x.due) : ''}</small></span></label>`).join('') || '<p class="na">No tasks yet.</p>'}${rq.length ? '<h4 class="sec-h">Requests found in documents</h4><table class="ft">' + rq.map(i => `<tr><td></td><td><b>${esc(i.v)}</b></td><td>${srcCell(i.ev)}</td></tr>`).join('') + '</table>' : ''}</div></div>`; }
  const f = fieldsIn(sec), have = f.filter(c => valOf(p, c[0]).length).length, hist = (p.hist || []).filter(h => h.sec === sec), docs = docsFor(p, sec), tk = TASKSEC[sec] ? S.tasks.filter(t => t.p === p.id && TASKSEC[sec].test(t.text)) : [];
  const hopen = HOPEN.has(p.id + ':' + sec);
  return `<div class="panel"><div class="p-h"><h3>${esc(SECN[sec])}</h3><span class="hbar"><small>${have} of ${f.length} fields known</small>${hist.length ? `<button class="btn sm" data-hist="${sec}" type="button" aria-expanded="${hopen}">${hopen ? 'Hide history' : 'History'}</button>` : ''}</span></div>${statusBlock(p, sec)}<table class="ft">${fieldRows(p, sec)}</table></div>
  ${hist.length && hopen ? histPanel(hist) : ''}
  ${updHtml(p, sec)}
  <div class="panel"><div class="p-h"><h3>Documents</h3><small>${docs.length}</small></div><ul class="dl pad">${docs.map(docLi).join('') || '<li class="na">No document with information for this section yet.</li>'}</ul></div>
  ${tk.length ? `<div class="panel"><div class="p-h"><h3>Open tasks</h3></div><div class="pad">${tk.map(x => `<label class="task ${x.done ? 'done' : ''}"><input type="checkbox" data-t="${x.id}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}<small>${x.due ? 'due ' + esc(x.due) : ''}</small></span></label>`).join('')}</div></div>` : ''}`;
}
function vProject() {
  const p = proj(PV.id); if (!p) { view = 'portfolio'; return vPortfolio(); }
  const sec = PV.sec, cm = completeness(p), sc = isSc(p);
  const badge = k => k === 'docs' || k === 'act' || k === 'oth' || k === 'ctc' ? secCount(p, k) : (k === 'ov' ? cm.have + '/' + cm.total : secCount(p, k) + '/' + fieldsIn(k).length);
  return `<div class="ph"><div><button class="btn" data-back type="button">← Portfolio</button><h2 class="pgt">${esc(p.name)}</h2><small>${esc(addrOf(p) || p.city || 'Location not found')} · ${esc(geoLine(p))}</small></div>
    <div class="ctl"><button class="btn" data-imp="import" type="button">Add data</button><button class="btn danger" data-del="${p.id}" type="button">Delete project</button></div></div>
  <div class="kstrip"><div><small>Capacity</small><b>${p.mw != null ? p.mw + ' <i>MW</i>' : '—'}</b><em>${p.mwh != null ? p.mwh + ' MWh' : 'storage not found'}</em></div>
    <div><small>Grid</small><b>${p.kv != null ? p.kv + ' <i>kV</i>' : '—'}</b><em>${esc(p.operator || 'operator not found')}</em></div>
    <div><small>Target COD</small><b>${p.cod ? esc(p.cod) : '—'}</b><em>${p.cod ? '' : 'not found'}</em></div>
    <div><small>Key facts</small><b>${cm.have}<i>/${cm.total}</i></b><em>${cm.pct}% complete</em></div>
    <div><small>Assessment</small><b class="${sc ? cls(p) : ''}">${sc ? p.rtb + '<i>% RTB</i>' : '—'}</b><em>${sc ? 'risk ' + rk(p).total + '%' : 'not assessed (no estimates from missing data)'}</em></div></div>
  <div class="pgw"><nav class="pgn" aria-label="Sections">${SECS.map(([k, n]) => `<button type="button" data-psec="${k}" class="${k === sec ? 'on' : ''}"><span>${esc(n)}</span><i>${badge(k)}</i></button>`).join('')}</nav><div class="pgm">${secHtml(p, sec)}</div></div>`;
}
function deleteProject(id) {
  const p = proj(id); if (!p) return; const nd = S.docs.filter(d => d.p === id).length;
  if (!confirm('Delete "' + p.name + '"' + (nd ? ' and its ' + nd + ' filed document' + (nd === 1 ? '' : 's') : '') + '? This cannot be undone.')) return;
  S.projects = S.projects.filter(x => x.id !== id); S.changes = S.changes.filter(c => c.p !== id); S.tasks = S.tasks.filter(t => t.p !== id); S.docs = S.docs.filter(d => d.p !== id); delete S.filings[id];
  if (S.sel === id) S.sel = null; if (S.rsel === id) S.rsel = null; save(); closeAll(); view = 'portfolio'; render();
}

/* ---------- fact answers for Intelligence ---------- */
const QMAP = [
  [/connection point|substation|umspannwerk|netzverknüpfung|anschlusspunkt/i, ['connpoint'], 'Connection point'],
  [/grid operator|network operator|netzbetreiber|\bdso\b|\btso\b|\boperator\b/i, ['operator'], 'Grid operator'],
  [/energi[sz]ation|grid connection date|connection date|netzanschluss(?:datum|termin)|when.*connect/i, ['grid_date', 'energisation', 'nt_grid'], 'Grid connection date'],
  [/\bcod\b|commercial operation|go-?live|inbetriebnahme|operation date|when.*(?:operation|online|live)/i, ['cod', 'commissioning'], 'Target COD'],
  [/permit|genehmigung|approval/i, ['permit_status', 'permit_date', 'permit_auth', 'permit_ref', 'permit_cond', 'nt_perm'], 'Permit'],
  [/storage|mwh|energy content|speicher|duration/i, ['mwh', 'mw'], 'Storage capacity'],
  [/capacity|kapazität|leistung|\bmw\b|megawatt|how (?:big|large)|size|größe|nameplate/i, ['mw', 'mwh'], 'Capacity'],
  [/voltage|\bkv\b|spannung/i, ['kv'], 'Connection voltage'],
  [/where|location|located|address|street|city|postal|zip|postcode|\bplz\b|standort|adresse/i, ['street', 'postal', 'city', 'state', 'nt_site'], 'Location'],
  [/supplier|manufacturer|vendor|lieferant|hersteller|candidate|bidder|kandidat|anbieter/i, ['supplier', 'supplier_cand'], 'Supplier'],
  [/\bepc\b|contractor|generalunternehmer/i, ['epc'], 'EPC contractor'],
  [/deliver|lieferung|lieferzeit|lead time/i, ['delivery', 'nt_proc'], 'Delivery'],
  [/price|cost|quote|angebot|preis|kosten/i, ['price', 'price_chg', 'quote', 'quote_valid', 'nt_proc'], 'Price and quote'],
  [/financ|loan|lender|darlehen|funding/i, ['fin_status', 'fin_amount', 'lender', 'nt_fin'], 'Financing'],
  [/technology|chemistry|\blfp\b|battery type|technologie|container/i, ['tech', 'units'], 'Technology'],
  [/contract|vertrag/i, ['contract_status', 'longstop', 'nt_contr'], 'Contract'],
  [/lease|land\b|parcel|flurst|pacht|grundstück/i, ['lease', 'parcel'], 'Site and land rights'],
  [/warrant|garantie|maintenance|wartung/i, ['warranty'], 'Warranty and maintenance'],
  [/contact|e-?mail|ansprechpartner|who (?:wrote|sent)/i, ['contact'], 'Contacts'],
  [/request|outstanding|to-?do|open task|offen/i, ['request'], 'Open requests'],
  [/\bothers?\b|notes?\b|sonstige/i, ['other'], 'Other information']];
const sugList = () => { const p = S.projects[0]; return p ? ['What is the capacity of ' + p.name + '?', 'Where is ' + p.name + ' located?', 'Which projects are at risk of missing COD?', 'What changed in the last 24 hours?'] : SUG; };
const evText = ev => ev ? evSrc(ev) + (ev.s ? ': “' + ev.s.slice(0, 160) + '”' : '') : '';
function targetsOf(q) {
  const named = S.projects.filter(p => new RegExp('\\b(?:' + reEsc(p.name) + (/^BESS/i.test(p.name) ? '|' + reEsc(shortOf(p.name)) : '') + ')\\b', 'i').test(q));
  if (named.length) return named;
  const cur = /\b(this|the|current|dieses?|diesem)\b[^?]{0,20}\b(project|projekt)\b|\bhere\b/i.test(q) || S.projects.length === 1 || view === 'project';
  const last = proj(view === 'project' ? PV.id : LASTP); if (cur && last) return [last];
  return S.projects;
}
function shownVal(p, row) {
  const keys = row[1], got = keys.map(k => [k, valOf(p, k)]).filter(x => x[1].length);
  if (!got.length) return null;
  if (row[2] === 'Location') return { head: addrOf(p) || got[0][1][0].v, rest: [], evs: got.map(x => x[1][0]) };
  const [k0, a0] = got[0];
  return { head: a0.length > 1 ? a0.map(x => x.v).join(' · ') : a0[0].v, rest: got.slice(1).map(x => CATK[x[0]].label + ': ' + x[1].map(y => y.v).join(' · ')), evs: got.flatMap(x => x[1]).slice(0, 6) };
}
function passageAsk(q, ps) {
  const k = (q.toLowerCase().match(/[a-zäöüß0-9]+/g) || []).filter(t => !STOP.has(t) && t.length > 2 && !['project', 'this', 'what', 'does', 'say', 'about'].includes(t)); if (!k.length) return null;
  const exp = new Set(k); k.forEach(t => SYN.forEach(g => { if (g.includes(t)) g.forEach(x => exp.add(x)); }));
  const hits = [];
  S.docs.filter(d => ps.some(p => p.id === d.p)).forEach(d => (d.text || '').split(/\n+/).forEach(line => splitSent(line).forEach(s => { s = s.trim(); if (s.length < 15) return; const w = new Set(s.toLowerCase().match(/[a-zäöüß0-9]+/g) || []); let sc = 0; k.forEach(t => { if (w.has(t)) sc += 3; }); exp.forEach(t => { if (!k.includes(t) && w.has(t)) sc += 1; }); if (sc >= 3) hits.push({ s, d, sc }); })));
  hits.sort((a, b) => b.sc - a.sc);
  return hits.length ? { head: 'Closest passages', sub: 'No standard field matches this question. These sentences from your documents come closest.', items: hits.slice(0, 4).map(h => ({ pid: h.d.p, name: h.d.name + (h.d.ver ? ' ' + h.d.ver : ''), why: '“' + h.s.slice(0, 200) + '”' })), src: 'Document text' } : null;
}
function factAsk(q) {
  if (!S.projects.length) return null;
  if (/\b(at risk|risk|which projects|all projects|changed|last 24|what happened|revenue|impact|miss(?:ing)? cod|delays?)\b/i.test(q)) return null;
  const ps = targetsOf(q), row = QMAP.find(r => r[0].test(q));
  if (!row) return passageAsk(q, ps);
  if (ps.length === 1) {
    const p = ps[0], s = shownVal(p, row);
    if (!s) return passageAsk(q, ps) || { head: 'Not found', sub: 'No ' + row[2].toLowerCase() + ' for ' + p.name + ' in the imported documents. BESSMIND does not guess.', items: [], note: 'Import a document or email that contains it, or add it when you create the project.', src: 'Project facts' };
    return { head: s.head, sub: p.name + ' · ' + row[2] + (s.rest.length ? ' · ' + s.rest.join(' · ') : ''), items: s.evs.map(it => ({ pid: p.id, name: CATK[it.k].label + ': ' + it.v, why: evText(it.ev) || 'Project record' })), src: 'Extracted from your documents' };
  }
  const rows = ps.map(p => ({ p, s: shownVal(p, row) }));
  return { head: row[2], sub: rows.filter(x => x.s).length + ' of ' + ps.length + ' projects have this information. Name a project to see the source sentence.', items: rows.map(x => ({ pid: x.p.id, name: x.p.name, why: x.s ? x.s.head + (x.s.evs[0] ? ' · ' + evSrc(x.s.evs[0].ev) : '') : 'not found' })), src: 'Extracted from your documents' };
}
function ask(q) {
  const f = factAsk(q); if (f) return f;
  if (S.projects.length && !S.projects.some(isSc) && /risk|cod|miss|late|delay|slip|revenue|impact/i.test(q)) return { head: 'Not assessed yet', sub: 'Risk and revenue impact are only calculated where they can be explained with verified data. The imported projects do not have a schedule baseline yet, and BESSMIND does not estimate missing data.', items: S.projects.map(p => { const c = completeness(p); return { pid: p.id, name: p.name, why: c.have + ' of ' + c.total + ' key facts known' + (c.miss.length ? ' · missing: ' + c.miss.slice(0, 3).map(k => CATK[k].label).join(', ') : '') }; }), src: 'Project facts' };
  return ask0(q);
}

/* ---------- workspace views ---------- */
const emptyHtml = () => `<div class="empty"><p class="lbl">WORKSPACE · ${esc(SESS ? SESS.company : '')}</p><h2>Your portfolio is empty.</h2><p class="sub">Give BESSMIND your project emails and files, or just a project name. It builds the project from what it finds, files every fact in its standard section with its source, collects everything else under Others, and asks you to confirm before anything is applied.</p>
<div class="cards3"><button data-imp="import" type="button"><b>Import emails and files</b><span>Paste an email or upload PDF, DOCX, EML, TXT. Projects are detected and created automatically.</span></button><button data-imp="add" type="button"><b>Add a project by name</b><span>Name and address. BESSMIND searches everything already imported and fills in what it finds.</span></button><button data-sample-ws type="button"><b>Load sample portfolio</b><span>Fictional data to explore the product.</span></button></div>
<p class="note-b">Prototype: files are read inside your browser and are not uploaded anywhere. Only when you enter or import an address, street, postal code and city are sent to OpenStreetMap to find the map position (can be switched off under Sources).</p></div>`;
function vPortfolio() { return S.projects.length ? vPortfolio0() : emptyHtml(); }
function vRisk() { return S.projects.length ? vRisk0() : emptyHtml(); }
function timelineHtml(p) { return p.tl ? timelineHtml0(p) : msHtml(p); }
function ganttHtml(l) { const x = l.filter(p => p.t); return x.length ? ganttHtml0(x) : '<div class="pad na">No project has a schedule baseline yet. Open a project to see its dated milestones.</div>'; }
function vFilings() {
  if (!S.projects.length) return emptyHtml();
  if (!proj(S.sel)) S.sel = S.projects[0].id;
  const p = proj(S.sel), F = S.filings[p.id] || (S.filings[p.id] = {}), g = k => { const it = valOf(p, k)[0]; return it ? [it.v, evSrc(it.ev)] : ['', '']; }, cp = p.cp || F.cp || g('connpoint')[0];
  const cap = valOf(p, 'mw')[0], rows = [['Site / location', addrOf(p) || g('city')[0], g('city')[1]], ['Capacity', cap ? cap.v + (valOf(p, 'mwh')[0] ? ' / ' + valOf(p, 'mwh')[0].v : '') : '', cap ? evSrc(cap.ev) : ''], ['Connection voltage', ...g('kv')], ['Grid operator', ...g('operator')], ['Connection point', cp, cp ? (p.cp || F.cp ? 'Entered by you' : g('connpoint')[1]) : ''], ['Planned grid connection', ...g('grid_date')], ['Planned COD', ...g('cod')]];
  const miss = rows.filter(r => !r[1]).length;
  return `<div class="ph"><div><h2>Grid-connection filings</h2><small>E1 / E8 pre-filled from project sources. ${rows.length - miss} of ${rows.length} fields filled.</small></div><div class="ctl"><select id="fsel" aria-label="Project">${S.projects.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
  <div class="panel pad">${rows.map(r => r[1] ? `<div class="frow"><small>${r[0]}</small><b>${esc(r[1])}</b><span class="src">${esc(r[2])}</span></div>` : r[0] === 'Connection point' ? `<div class="miss"><b>${r[0]}: no source found</b><br><small>BESSMIND does not guess missing data.</small><div class="frow" style="border:0"><input class="f-in" id="cp-in" placeholder="Enter connection point"><button class="btn pri" id="cp-save" type="button">Save</button></div></div>` : `<div class="miss"><b>${r[0]}: no source found</b><br><small>BESSMIND does not guess missing data. Import a document that contains it.</small></div>`).join('')}
  ${!miss ? (F.done ? '<div class="banner">Confirmed. Ready to submit to the grid operator.</div>' : '<button class="btn pri wide" id="confirm" type="button">Review done: confirm filing</button>') : ''}</div>`;
}
function vSources() {
  const C = [['Email (paste or .eml file)', 1, 'Manual import'], ['Files: PDF, DOCX, TXT, CSV', 1, 'Manual upload'], ['Map positions (OpenStreetMap Nominatim)', !S.geoOff, S.geoOff ? 'Switched off' : 'Street, postal code and city are sent to openstreetmap.org'], ...(aiActive() || (window.CLOUD && BM_CFG.ai === true) ? [['Language-model reading (Anthropic API)', S.ai !== false, S.ai === false ? 'Switched off for this workspace' : 'Email and document text is sent to the model; the result is checked against the original']] : []), ['Outlook / Gmail', 0, 'Needs secure backend (OAuth)'], ['SharePoint / OneDrive', 0, 'Needs Microsoft Graph connection'], ['Microsoft Teams', 0, 'Needs Microsoft Graph connection'], ['ERP and grid operator portals', 0, 'Planned']];
  return `<div class="ph"><div><h2>Sources</h2><small>Where BESSMIND reads project information from</small></div><div class="ctl">${aiActive() ? `<button class="btn" data-ai type="button">${S.ai === false ? 'Switch on language-model reading' : 'Switch off language-model reading'}</button>` : ''}<button class="btn" data-geo type="button">${S.geoOff ? 'Switch on map lookup' : 'Switch off map lookup'}</button><button class="btn danger" data-wipe type="button">Delete all workspace data</button></div></div>
  <div class="two"><div class="panel"><div class="p-h"><h3>Connections</h3></div><div class="pad">${C.map(c => `<div class="frow" style="grid-template-columns:1fr auto"><b>${c[0]}</b><span class="${c[1] ? 'ok' : 'na'}">${c[1] ? 'Active · ' : 'Not connected · '}${c[2]}</span></div>`).join('')}<p class="note-b">Everything read in this prototype stays in your browser. Live connections run on the backend, which is the next build step.</p></div></div>
  <div class="panel"><div class="p-h"><h3>Import history</h3><small>${S.docs.length} documents · ${S.projects.length} projects</small></div><ul class="act">${S.log.slice(0, 12).map(l => `<li><time>${fmtT(l.t)}</time><div><b>${l.docs.length} item${l.docs.length === 1 ? '' : 's'} imported</b><small>${l.created.length ? 'Created: ' + esc(l.created.join(', ')) + '. ' : ''}${l.updated.length ? 'Updated: ' + esc(l.updated.join(', ')) + '.' : ''}</small></div></li>`).join('') || '<li><div>No imports yet.</div></li>'}</ul></div></div>`;
}

/* ---------- import and review ---------- */
let IMP = { mode: 'import', files: [], text: '', pr: null, done: null, busy: false, err: '', add: { name: '', street: '', postal: '', city: '', mw: '', cod: '' } };
function mvSelect(c, i, j) {
  const ask = c.k === 'other';
  return `<select class="mv${ask ? ' ask' : ''}" data-mv="${i}:${j}" aria-label="Which topic does this belong to?"><option value="">${ask ? 'Which topic does this belong to?' : 'Move to another topic…'}</option><option value="request">Task / request</option>${SECS.filter(s => s[0] !== 'oth').map(s => { const o = CAT.filter(x => x[1] === s[0] && x[0] !== 'other' && x[0] !== c.k && x[0] !== 'request'); return o.length ? `<optgroup label="${esc(s[1])}">${o.map(x => `<option value="${x[0]}">${esc(x[2])}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>`;
}
function chgRows(e, i, only) {
  return e.changes.map((c, j) => [c, j]).filter(x => only(x[0])).map(([c, j]) => `<div class="chgw"><label class="chg"><input type="checkbox" data-chg="${i}:${j}" ${c.on ? 'checked' : ''}><span><b>${esc(c.it && c.it.hint ? 'Other · possibly ' + c.it.hint + ' (value unclear)' : c.label)}</b> ${c.old ? '<s>' + esc(c.old) + '</s> → ' : ''}<b>${esc(c.new)}</b>${c.days ? ' <span class="warn">(' + (c.days > 0 ? '+' : '') + c.days + ' days)</span>' : ''}${c.note ? ' <em class="warn">(' + esc(c.note) + ')</em>' : ''}${c.moved ? ' <em class="mvd">(placed by you)</em>' : c.it && c.it.via ? ' <em class="mvd">(read by language model)</em>' : ''}${evq(c.ev)}</span></label>${c.sec === 'oth' || /^nt_/.test(c.k) ? mvSelect(c, i, j) : ''}</div>`).join('');
}
function mvChange(ij, target) {
  const [i, j] = ij.split(':').map(Number), e = IMP.pr.projects[i], c = e && e.changes[j]; if (!c || !CATK[target]) return;
  const items = refile(c, target, e.name), ex = e.existing ? proj(e.existing) : null, nc = diffItems(ex, finalizeItems(items));
  const fb = items.some(x => x.fb); nc.forEach(x => { x.moved = true; if (fb && x.sec === CATK[target].sec) x.note = 'no matching value found, kept as a note in this topic'; });
  if (/_cand$/.test(target)) { const names = items.filter(x => x.k === target && !x.fb).map(x => x.v); if (names.length) e.changes.forEach(x => { if (x.k === 'request' && x.it && x.it.sent) { const v = shortTask(x.it.sent, names); x.new = v; x.it = { ...x.it, v }; } }); }
  const keys = new Set(nc.filter(x => CATK[x.k].one).map(x => x.k));
  e.changes.splice(j, 1, ...nc); e.changes = e.changes.filter((x, n) => !(CATK[x.k].one && keys.has(x.k) && !nc.includes(x)));
  try { learnFrom((c.it && c.it.sent) || c.new, target, items, e.name); save(); } catch {}
  IMP.oth = true; renderImp();
}
function reviewHtml(pr) {
  const add = IMP.mode === 'add';
  let h = pr.errors.map(e => `<div class="err"><b>${esc(e.name)}</b>: ${esc(e.msg)}</div>`).join('');
  if (pr.ai) h += pr.ai.err ? `<p class="hint warn">The language model could not be reached (${esc(pr.ai.err)}). This result uses the rules only.</p>` : `<p class="hint">Read by the rules and the language model${pr.ai.added ? ': ' + pr.ai.added + ' fact' + (pr.ai.added === 1 ? '' : 's') + ' checked against the original text.' : '.'}</p>`;
  if (add && pr.hits) h += `<p class="hint">${pr.hits.length ? 'Searched your workspace: ' + pr.hits.length + ' document' + (pr.hits.length === 1 ? ' mentions' : 's mention') + ' this project.' : 'No imported document mentions this project yet. Only your own entries are used. Import emails or files later and BESSMIND fills in the rest.'}</p>`;
  if (!pr.projects.length) h += '<p class="hint">No project name was found in the imported material. Filed items can be assigned to a project below.</p>';
  h += pr.projects.map((e, i) => {
    const have = new Set(e.items.map(x => x.k)), ex = e.existing ? proj(e.existing) : null, miss = CORE.filter(k => !have.has(k) && !(ex && valOf(ex, k).length)).map(k => CATK[k].label);
    const groups = SECS.filter(s => s[0] !== 'oth' && e.changes.some(c => c.sec === s[0])).map(s => `<h4 class="sec-h">${esc(s[1])}</h4>${chgRows(e, i, c => c.sec === s[0])}`).join(''), oth = e.changes.filter(c => c.sec === 'oth').length;
    return `<div class="rv"><div class="rv-h"><label><input type="checkbox" data-inc="${i}" ${e.include ? 'checked' : ''}>${e.existing ? '<b>' + esc(e.name) + '</b>' : `<input class="nm" data-nm="${i}" value="${esc(e.name)}" aria-label="Project name">`}</label><span class="tg ${e.existing ? 'action' : e.low ? 'risk' : 'ok'}">${e.existing ? 'UPDATE' : e.low ? 'POSSIBLE PROJECT' : 'NEW PROJECT'}</span></div>
    ${e.low ? '<p class="hint warn">This name appears only briefly in the material. Confirm that it is a real project, then tick it.</p>' : ''}
    ${e.changes.length ? `<p class="topics">Topics recognised: ${esc([...new Set(e.changes.filter(c => c.sec !== 'oth').map(c => SECN[c.sec]))].join(' · ') || 'none')}</p>` : ''}
    ${groups || (e.existing ? '<p class="miss-l">No new standard facts. Documents are filed to this project.</p>' : '<p class="miss-l">No standard facts found yet.</p>')}
    ${oth ? `<details class="othd" open><summary>Others · ${oth} note${oth === 1 ? '' : 's'} that match no standard field. Choose the topic and BESSMIND reads it again there and remembers.</summary>${chgRows(e, i, c => c.sec === 'oth')}</details>` : ''}
    ${miss.length ? `<p class="miss-l">Not found: ${esc(miss.slice(0, 9).join(', '))}${miss.length > 9 ? ' and ' + (miss.length - 9) + ' more' : ''}.</p>` : ''}
    <small>${e.docs && e.docs.length ? e.docs.length + ' document' + (e.docs.length === 1 ? '' : 's') + ' mention this project.' : ''}</small></div>`;
  }).join('');
  if (pr.unassigned.length) h += `<h3 class="lb">Not matched to a project</h3>` + pr.unassigned.map((d, i) => `<div class="una"><span>${esc(d.name)}<small> · ${esc(d.kind)}</small></span><select data-una="${i}" aria-label="Assign"><option value="">Keep unassigned</option>${S.projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>`).join('');
  return h + `<div class="rv-btns"><button class="btn" data-imp-back type="button">Back</button><button class="btn pri" data-imp-apply type="button">Apply selected</button></div><p class="note-b">Nothing is changed until you apply. Missing facts stay empty; BESSMIND does not guess.</p>`;
}
function renderImp() {
  const box = $('#imp-body'), add = IMP.mode === 'add'; $('#imp-title').textContent = add ? 'Add a project' : 'Import data';
  if (IMP.done) { const s = IMP.done; box.innerHTML = `<div class="ok-b">Done. Your workspace is updated.</div><ul class="sumul">${s.created.length ? `<li><b>${s.created.length} project${s.created.length > 1 ? 's' : ''} created:</b> ${esc(s.created.join(', '))}</li>` : ''}${s.updated.length ? `<li><b>Updated:</b> ${esc(s.updated.join(', '))}</li>` : ''}<li><b>${s.facts}</b> fact${s.facts === 1 ? '' : 's'} filed in standard sections${s.others ? ' · <b>' + s.others + '</b> under Others' : ''}</li><li><b>${s.docs}</b> document${s.docs === 1 ? '' : 's'} stored</li></ul><div class="rv-btns"><button class="btn pri" data-imp-close type="button">Show portfolio</button><button class="btn" data-imp-again type="button">Import more</button></div>`; return; }
  if (IMP.busy) { box.innerHTML = '<p class="think">' + esc(IMP.busyMsg || 'Reading files and extracting facts') + '</p>'; return; }
  if (IMP.pr) { const a = $('#imp'), y = a ? a.scrollTop : 0; box.innerHTML = reviewHtml(IMP.pr); if (a) a.scrollTop = y; return; }
  const err = IMP.err ? `<div class="err">${esc(IMP.err)}</div>` : '';
  if (add) { const a = IMP.add; box.innerHTML = `<p class="hint">Enter the project name and, if you know it, the address. BESSMIND searches everything already imported and fills in what it finds, with sources. Your own entries are labelled as such.</p>${err}<label class="lb" for="a-name">Project name</label><input id="a-name" value="${esc(a.name)}" placeholder="e.g. BESS Heide" autocomplete="off">
    <div class="grid2"><div><label class="lb" for="a-street">Street and house number</label><input id="a-street" value="${esc(a.street)}" placeholder="e.g. Hauptstraße 12"></div><div><label class="lb" for="a-postal">Postal code</label><input id="a-postal" value="${esc(a.postal)}" placeholder="e.g. 25746" inputmode="numeric" maxlength="5"></div></div>
    <div class="grid2"><div><label class="lb" for="a-city">City</label><input id="a-city" value="${esc(a.city)}" placeholder="e.g. Heide"></div><div><label class="lb" for="a-mw">Capacity MW (optional)</label><input id="a-mw" type="number" min="0" value="${esc(a.mw)}"></div></div>
    <label class="lb" for="a-cod">Target COD (optional)</label><input id="a-cod" value="${esc(a.cod)}" placeholder="e.g. Q3 2027 or 30 June 2027"><button class="btn pri wide" data-add-go type="button">Find information and create</button>
    <p class="note-b">The map position is looked up at OpenStreetMap from street, postal code and city (switch off under Sources). Tip: import emails and files first, then add the project by name.</p>`; return; }
  box.innerHTML = `<p class="hint">Paste an email or upload files. BESSMIND detects the projects, files every fact in its standard section with the source, puts the rest under Others, and shows you everything before it is applied.</p>${err}<label class="lb" for="imp-text">Paste an email or note</label><textarea id="imp-text" rows="8" placeholder="Paste an email here">${esc(IMP.text)}</textarea><label class="lb">Or upload files</label><label class="drop" id="drop"><b>Drop files here or click to choose</b><span>PDF · DOCX · EML · TXT · MD · CSV</span><input id="imp-file" type="file" multiple accept=".pdf,.docx,.eml,.txt,.md,.csv,.html,.json" hidden></label><ul class="flist">${IMP.files.map((f, i) => `<li>${esc(f.name)}<small>${Math.round(f.size / 1024) || 1} KB</small><button data-rmf="${i}" type="button" aria-label="Remove">✕</button></li>`).join('')}</ul><button class="btn pri wide" data-imp-go type="button">Analyze</button><p class="note-b">Files are read inside your browser. Scanned PDFs without text are not supported in this prototype.</p>`;
}
function openImp(mode) { IMP = { ...IMP, mode, pr: null, done: null, busy: false, err: '' }; $('#drawer').hidden = true; $('#imp').hidden = false; renderImp(); }
async function runImport() {
  IMP.err = ''; IMP.busy = true; renderImp();
  try { const { docs, errors } = await readInputs(IMP.files, IMP.text); if (!docs.length && !errors.length) IMP.err = 'Nothing to import. Paste an email or choose files.'; else { IMP.pr = buildProposal(docs, errors); if (aiActive()) { IMP.busyMsg = 'Reading with the rules and the language model'; renderImp(); try { await aiEnrich(IMP.pr); } catch (e) { IMP.pr.ai = { added: 0, err: e.message || String(e) }; } } } } catch (e) { IMP.err = 'Import failed: ' + (e.message || e); }
  IMP.busy = false; IMP.busyMsg = ''; renderImp();
}
function runAdd() {
  const a = IMP.add, nm = a.name.trim();
  if (nm.length < 3) { IMP.err = 'Enter a project name (at least 3 characters).'; return renderImp(); }
  if (S.projects.some(p => p.name.toLowerCase() === nm.toLowerCase())) { IMP.err = 'A project with this name already exists.'; return renderImp(); }
  if (a.postal.trim() && !/^\d{5}$/.test(a.postal.trim())) { IMP.err = 'The postal code must have 5 digits.'; return renderImp(); }
  if (a.cod.trim() && !dates(a.cod).length) { IMP.err = 'Target COD must be a date like "Q3 2027" or "30 June 2027".'; return renderImp(); }
  IMP.err = ''; IMP.pr = proposeFromName(nm, a); renderImp();
}
function applyImp() {
  const pr = IMP.pr; if (!pr.projects.some(x => x.include) && !pr.docs.length && !pr.unassigned.some(d => d.assign)) { IMP.err = 'Nothing selected.'; return; }
  try { IMP.done = applyProposal(pr); IMP.pr = null; IMP.files = []; IMP.text = ''; IMP.add = { name: '', street: '', postal: '', city: '', mw: '', cod: '' }; if (IMP.done.created.length) { const p = S.projects[S.projects.length - 1]; if (p) S.sel = p.id; } view = view === 'project' ? 'project' : 'portfolio'; render(); } catch (e) { IMP.err = 'Could not apply: ' + (e.message || e); IMP.pr = null; }
  renderImp();
}
function addFiles(list) { [...list].forEach(f => IMP.files.push(f)); renderImp(); }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target, g = s => t.closest(s);
  if (g('[data-hist]')) { const key = PV.id + ':' + g('[data-hist]').dataset.hist; HOPEN.has(key) ? HOPEN.delete(key) : HOPEN.add(key); render(); return; }
  if (g('[data-page]')) { const b = g('[data-page]'); openPage(b.dataset.page, b.dataset.psec); return; }
  if (g('[data-psec]')) { PV.sec = g('[data-psec]').dataset.psec; render(); return; }
  if (g('[data-back]')) { view = 'portfolio'; render(); return; }
  if (g('[data-del]')) { deleteProject(g('[data-del]').dataset.del); return; }
  if (g('[data-imp]')) return openImp(g('[data-imp]').dataset.imp);
  if (g('[data-sample-ws]')) { S = seed(); S.projects.forEach(p => { p.mwh = p.mw * 2; }); S.sample = true; save(); view = 'portfolio'; render(); return; }
  if (g('[data-wipe]')) { if (confirm('Delete all projects, documents and history in this workspace?')) { S = emptyState(); save(); view = 'portfolio'; render(); } return; }
  if (g('[data-ai]')) { S.ai = S.ai === false; save(); render(); return; }
  if (g('[data-geo]')) { S.geoOff = !S.geoOff; save(); render(); return; }
  if (g('[data-imp-close]')) { $('#imp').hidden = true; return; }
  if (g('[data-imp-again]')) { IMP.done = null; renderImp(); return; }
  if (g('[data-imp-back]')) { IMP.pr = null; IMP.err = ''; renderImp(); return; }
  if (g('[data-imp-go]')) { IMP.text = ($('#imp-text') || { value: IMP.text }).value; runImport(); return; }
  if (g('[data-add-go]')) { runAdd(); return; }
  if (g('[data-imp-apply]')) { applyImp(); return; }
  if (g('[data-rmf]')) { IMP.files.splice(+g('[data-rmf]').dataset.rmf, 1); renderImp(); return; }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset || {};
  if (t.id === 'imp-file') { addFiles(t.files); return; }
  if (d.inc !== undefined) IMP.pr.projects[+d.inc].include = t.checked;
  if (d.chg) { const [i, j] = d.chg.split(':'); IMP.pr.projects[+i].changes[+j].on = t.checked; }
  if (d.una !== undefined) IMP.pr.unassigned[+d.una].assign = t.value || null;
  if (d.mv && t.value) { mvChange(d.mv, t.value); return; }
});
document.addEventListener('input', e => {
  const t = e.target, d = t.dataset || {};
  if (t.id === 'imp-text') IMP.text = t.value;
  if (d.nm !== undefined) { const x = IMP.pr.projects[+d.nm]; x.name = t.value; }
  if (t.id && t.id.startsWith('a-')) IMP.add[t.id.slice(2)] = t.value;
});
document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest('#drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('#drop'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => { const z = e.target.closest && e.target.closest('#drop'); if (z) { e.preventDefault(); z.classList.remove('over'); addFiles(e.dataTransfer.files); } });
$('#open-inbox').onclick = () => openImp('import');
$('#add-btn').onclick = () => openImp('add');
$('#signout').onclick = async () => { if (window.cloudSignOut) await cloudSignOut(); sessionStorage.removeItem('bm-session'); location.href = 'login.html'; };
if (SESS) $('#who').textContent = SESS.company + ' · ' + SESS.user;
if (self !== top) document.body.classList.add('embedded');
(async () => {
  $('#main').innerHTML = '<p class="think" style="padding:40px">Loading your workspace</p>';
  if (window.CLOUD) { try { await cloudLoad(); } catch (e) { if (!SESS) return; $('#sync').textContent = 'Offline: using the copy in this browser'; } }
  migrate();
  if (!S.geoOff) S.projects.forEach(p => { if (!p.demo && (getI(p, 'street') || getI(p, 'postal') || getI(p, 'city')) && (!p.geo || /approx|not found/.test(p.geo.prec))) geocodeProject(p).then(ch => { if (ch) { save(); render(); } }).catch(() => {}); });
  render();
})();
