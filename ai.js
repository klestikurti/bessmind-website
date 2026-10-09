/* BESSMIND language-model layer. Runs after the rule-based reader and adds what the model understood.
   Safety: every item the model returns is checked against the original text before it is accepted
   (the quote must exist verbatim, names and dates must appear in the text). Nothing is applied without your review. */
const aiActive = () => !!(window.CLOUD && window.BM_CFG && window.BM_CFG.ai === true && typeof S !== 'undefined' && S.ai !== false);
const aiNorm = s => String(s).toLowerCase().replace(/[\s ]+/g, ' ').replace(/[“”„"'`´’‘]/g, '').trim();
const aiFields = () => CAT.filter(([k]) => k !== 'org' && !/^nt_/.test(k)).map(([k, sec, label]) => ({ k, label, sec: (SECS.find(s => s[0] === sec) || [0, sec])[1] }));

function aiItem(doc, tn, r) {
  const k = r && r.field, d = CATK[k]; if (!d || k === 'org') return null;
  const q = String(r.quote || '').trim(), v0 = String(r.value || '').trim();
  if (q.length < 6 || !v0 || !tn.includes(aiNorm(q))) return null;           // the quote must really be in the document
  let v = v0, num, rk = 0, st;
  if (KEYDATE.has(k)) { v = dates(v0)[0]; if (!v || !(String(v).match(/\d{4}/) || [''])[0] || !aiNorm(q).includes((String(v).match(/\d{4}/) || ['@'])[0])) return null; }
  else if (KEYNUM.has(k)) { const m = v0.match(/(\d+(?:[.,]\d+)?)/); if (!m) return null; num = parseFloat(m[1].replace(',', '.')); if (!aiNorm(q).replace(/(\d),(\d)/g, '$1.$2').includes(String(m[1]).replace(',', '.'))) return null; v = num + ({ mw: ' MW', mwh: ' MWh', kv: ' kV', units: ' containers' }[k] || ''); }
  else if (k in KEYSTAT) { if (r.status === 'done') { rk = 3; st = 'ok'; } else { rk = 1; st = 'open'; } }
  else if (ENT_FAM[k] || k === 'connpoint' || k === 'city' || k === 'state') { const core = aiNorm(v0.replace(/^(?:substation|umspannwerk|uw)\s+/i, '')); if (core.length < 2 || !tn.includes(core)) return null; }
  let i = doc.text.indexOf(q); if (i < 0) i = doc.text.toLowerCase().indexOf(q.toLowerCase());
  return { k, v: snip(v, 220), num, w: 2, rk, st, via: 'ai', sent: q, ev: { doc: doc.name, docId: doc.id, pg: i >= 0 ? pageAt(doc, i) : null, date: doc.date, kind: doc.kind, s: snip(q, 240) } };
}

const aiShort = n => aiNorm(String(n).replace(/^bess\s+/i, ''));
function aiFind(pr, name) {
  const t = aiNorm(name), s = aiShort(name); if (!s) return null;
  return pr.projects.find(e => aiNorm(e.name) === t) || pr.projects.find(e => aiShort(e.name) === s) || null;
}

async function aiEnrich(pr) {
  const fields = aiFields(), known = {};
  Object.entries((S.learn && S.learn.ent) || {}).slice(0, 60).forEach(([n, e]) => { known[e.d || n] = e.k; });
  const names = [...new Set([...S.projects.map(p => p.name), ...pr.projects.map(e => e.name)])];
  const docs = pr.docs.filter(d => d.text && d.text.trim().length >= 10).sort((a, b) => a.date < b.date ? -1 : 1), res = new Map(); let err = null;
  const q = docs.slice();
  await Promise.all([0, 1].map(async () => { while (q.length) { const doc = q.shift(); try { res.set(doc, (await cloudAI({ text: doc.text, fields, projects: names, known, meta: { name: doc.name, kind: doc.kind, date: doc.date } })).items || []); } catch (e) { err = err || e.message || String(e); } } }));
  let added = 0; const touched = new Set();
  for (const doc of docs) {
    const raw = res.get(doc); if (!raw) continue; const tn = aiNorm(doc.text), byE = new Map();
    for (const r of raw) {
      const it = aiItem(doc, tn, r); if (!it) continue;
      let e = null;
      if (r.project) { e = aiFind(pr, r.project); if (!e) { const p = S.projects.find(p => aiNorm(p.name) === aiNorm(r.project) || aiShort(p.name) === aiShort(r.project)); if (p) { e = { key: p.id, name: p.name, existing: p.id, include: true, docs: [], Fs: [], w: 1 }; pr.projects.push(e); } } }
      if (!e && r.new_project && String(r.new_project).trim().length >= 3) { e = aiFind(pr, r.new_project); if (!e) { const nm = String(r.new_project).trim(); e = { key: 'new:' + nm.toLowerCase(), name: nm, existing: null, include: false, low: true, docs: [], Fs: [], w: 1 }; pr.projects.push(e); } }
      if (!e && doc.primary) e = pr.projects.find(x => x.key === doc.primary);
      if (!e && pr.projects.length === 1) e = pr.projects[0];
      if (!e) continue;
      (byE.get(e) || byE.set(e, []).get(e)).push(it);
    }
    byE.forEach((items, e) => {
      if (!e.docs.includes(doc.id)) e.docs.push(doc.id);
      if (!doc.primary || pr.unassigned.includes(doc)) { doc.primary = e.key; doc.single = true; pr.unassigned = pr.unassigned.filter(d => d !== doc); }
      const qs = items.map(i => aiNorm(i.ev.s)), hasReq = items.some(i => i.k === 'request'), ov = ev => { const s = aiNorm(ev.s || ''); return !!s && qs.some(x => x.includes(s) || s.includes(x)); };
      e.Fs.forEach(F => { F.items = F.items.filter(x => !(x.ev && x.ev.docId === doc.id && ((x.k === 'other' || /^nt_/.test(x.k)) && ov(x.ev) || (x.k === 'request' && hasReq && ov(x.ev))))); });
      e.Fs.push({ items, ph: { pl: 0, bu: 0, op: 0 } }); added += items.length; touched.add(e);
    });
  }
  touched.forEach(e => { const F = mergeF(e.Fs); e.items = finalizeItems(F.items); e.phase = e.phase || phaseOf(F.ph); e.changes = diffItems(e.existing ? proj(e.existing) : null, e.items); });
  pr.ai = { added, err };
  return pr;
}
