/* BESSMIND ingestion engine (prototype).
   Reads emails and files locally in the browser, extracts project facts WITH evidence,
   and proposes projects / updates. Rule-based; the full product replaces this with AI models.
   Principle: nothing is guessed. Missing facts stay empty and are reported as "not found". */
const emptyState = () => ({ projects: [], changes: [], tasks: [], docs: [], filings: {}, applied: {}, log: [], sel: null, rsel: null, nextId: 1, sample: false });
const pname = id => (proj(id) || { name: 'Unassigned' }).name;
const norm = s => s.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shortOf = n => n.replace(/^BESS[\s-]+/i, '');
const rxOf = n => new RegExp('\\b(?:' + reEsc(n) + (/^BESS/i.test(n) ? '|' + reEsc(shortOf(n)) : '') + ')\\b', 'i');
const srcOf = ev => ev ? ev.doc + (ev.pg ? ' · p. ' + ev.pg : '') : '';
const FL = ['Permits', 'Grid connection', 'Supplier contract', 'Financing'], FK = ['permits', 'grid', 'contract', 'financing'], FS = { none: 'no data', open: 'in progress', ok: 'complete' }, RK = { none: 0, open: 1, ok: 2 };
const DL = { cod: 'Target COD', energisation: 'Energisation', grid: 'Grid connection', permit: 'Permit' };

/* ---------- gazetteer (approximate coordinates, enough for map pins) ---------- */
const GAZ = {};
'Heide:54.20,9.09;Husum:54.48,9.05;Büsum:54.13,8.86;Brunsbüttel:53.89,9.13;Itzehoe:53.92,9.51;Flensburg:54.78,9.44;Kiel:54.32,10.14;Lübeck:53.87,10.69;Hamburg:53.55,9.99;Wilhelmshaven:53.53,8.11;Emden:53.37,7.21;Bremen:53.08,8.80;Oldenburg:53.14,8.21;Cuxhaven:53.86,8.69;Hannover:52.37,9.73;Braunschweig:52.27,10.52;Wolfsburg:52.42,10.79;Göttingen:51.53,9.93;Magdeburg:52.12,11.63;Rostock:54.09,12.10;Schwerin:53.63,11.41;Stralsund:54.31,13.09;Greifswald:54.09,13.38;Berlin:52.52,13.40;Potsdam:52.39,13.07;Cottbus:51.76,14.33;Leipzig:51.34,12.37;Dresden:51.05,13.74;Halle:51.48,11.97;Chemnitz:50.83,12.92;Erfurt:50.98,11.03;Jena:50.93,11.59;Kassel:51.31,9.48;Dortmund:51.51,7.47;Essen:51.46,7.01;Düsseldorf:51.23,6.77;Köln:50.94,6.96;Bonn:50.74,7.10;Aachen:50.78,6.08;Grevenbroich:51.09,6.59;Neuss:51.20,6.69;Duisburg:51.43,6.76;Münster:51.96,7.63;Bielefeld:52.02,8.53;Paderborn:51.72,8.75;Siegen:50.87,8.02;Koblenz:50.36,7.59;Mainz:50.00,8.27;Wiesbaden:50.08,8.24;Frankfurt:50.11,8.68;Darmstadt:49.87,8.65;Mannheim:49.49,8.47;Saarbrücken:49.24,6.99;Trier:49.76,6.64;Karlsruhe:49.01,8.40;Stuttgart:48.78,9.18;Heilbronn:49.14,9.22;Ulm:48.40,9.99;Freiburg:47.99,7.85;München:48.14,11.58;Freising:48.40,11.75;Ingolstadt:48.76,11.42;Augsburg:48.37,10.90;Regensburg:49.01,12.10;Nürnberg:49.45,11.08;Würzburg:49.79,9.95;Bamberg:49.89,10.89;Landshut:48.54,12.15;Rosenheim:47.86,12.12;Passau:48.57,13.43'.split(';').forEach(x => { const [n, c] = x.split(':'), [a, o] = c.split(','); GAZ[n] = [+a, +o, false]; });
'Schleswig-Holstein:54.2,9.8;Niedersachsen:52.8,9.4;Nordrhein-Westfalen:51.4,7.5;Bayern:48.9,11.5;Brandenburg:52.4,13.0;Sachsen:51.0,13.3;Sachsen-Anhalt:51.9,11.7;Thüringen:50.9,11.0;Hessen:50.6,9.0;Baden-Württemberg:48.6,9.0;Mecklenburg-Vorpommern:53.9,12.5;Rheinland-Pfalz:49.9,7.3;Saarland:49.4,6.9'.split(';').forEach(x => { const [n, c] = x.split(':'), [a, o] = c.split(','); GAZ[n] = [+a, +o, true]; });
const GAZ_RX = Object.keys(GAZ).map(k => [k, new RegExp('\\b' + reEsc(k) + '\\b', 'i')]);
const OPS = ['TenneT', 'Amprion', '50Hertz', 'TransnetBW', 'Netze BW', 'E.DIS', 'Westnetz', 'Avacon', 'SH Netz', 'EWE Netz', 'Bayernwerk', 'LEW Verteilnetz', 'Stromnetz Berlin', 'MITNETZ', 'Syna', 'Thüringer Energienetze'];
const OPS_RX = OPS.map(k => [k, new RegExp('\\b' + reEsc(k) + '\\b', 'i')]);

/* ---------- reading files (all local, nothing is uploaded) ---------- */
async function readFile(f) {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  let text = '', pages = null;
  if (ext === 'pdf') {
    if (typeof pdfjsLib === 'undefined') throw new Error('The PDF reader could not be loaded.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise; pages = [];
    for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); pages.push(norm(c.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join(''))); }
    text = pages.join('\n');
  } else if (ext === 'docx') {
    if (typeof JSZip === 'undefined') throw new Error('The DOCX reader could not be loaded.');
    const z = await JSZip.loadAsync(await f.arrayBuffer()), x = z.file('word/document.xml'); if (!x) throw new Error('Not a valid DOCX file.');
    text = norm((await x.async('string')).replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  } else if (['txt', 'md', 'csv', 'json', 'eml', 'html', 'htm', 'log'].includes(ext)) {
    text = await f.text(); if (ext === 'eml') text = parseEml(text); if (/^html?$/.test(ext)) text = text.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' '); text = norm(text);
  } else throw new Error('Unsupported file type .' + ext + '. Supported: PDF, DOCX, EML, TXT, MD, CSV.');
  return { name: f.name, ext, text, pages };
}
const qp = s => s.replace(/=\r?\n/g, '').replace(/(=[0-9A-F]{2})+/gi, m => { try { return decodeURIComponent(m.replace(/=/g, '%')); } catch { return m; } });
function parseEml(raw) {
  const [head, ...rest] = raw.replace(/\r/g, '').split(/\n\n/); let body = rest.join('\n\n');
  const h = head.replace(/\n[ \t]+/g, ' '), get = k => (h.match(new RegExp('^' + k + ':\\s*(.*)$', 'im')) || [])[1] || '', bm = h.match(/boundary="?([^";\n]+)"?/i);
  if (bm) { const parts = body.split('--' + bm[1]), tp = parts.find(p => /content-type:\s*text\/plain/i.test(p)) || parts.find(p => /content-type:\s*text\/html/i.test(p)) || parts[1] || ''; body = tp.split(/\n\n/).slice(1).join('\n\n'); if (/quoted-printable/i.test(tp)) body = qp(body); }
  else if (/quoted-printable/i.test(h)) body = qp(body);
  return ['Subject: ' + get('Subject'), 'From: ' + get('From'), 'Date: ' + get('Date'), '', body.replace(/<[^>]+>/g, ' ')].join('\n');
}
const KINDS = [['Grid connection', /grid connection|netzanschluss|connection agreement|network study|netzverträglichkeit|\bE1\b|\bE8\b/gi], ['Permit', /permit|genehmigung|bimschg|baugenehmigung|auflage/gi], ['Contract', /contract|vertrag|\bEPC\b|purchase order|long-stop/gi], ['Quote', /quote|offer|angebot/gi], ['Schedule', /schedule|zeitplan|gantt|milestone/gi], ['Financing', /financing|term sheet|loan|darlehen|finanzierung/gi]];
function kindOf(name, text, mail) {
  if (mail) return 'Email';
  let best = ['Document', 0]; const head = text.slice(0, 4000);
  KINDS.forEach(([k, rx]) => { const s = (rx.test(name) ? 3 : 0) + Math.min(5, (head.match(rx) || []).length); rx.lastIndex = 0; if (s > best[1]) best = [k, s]; });
  return best[1] >= 3 ? best[0] : 'Document';
}
function mkDoc(name, ext, text, pages, ts, size, pasted) {
  const mail = ext === 'eml' || !!pasted || /^(from|subject|von|betreff):/im.test(text.slice(0, 500));
  let date = new Date(ts).toISOString().slice(0, 10); const dh = text.match(/^Date:\s*(.+)$/im); if (dh && !isNaN(new Date(dh[1]))) date = new Date(dh[1]).toISOString().slice(0, 10);
  const ps = []; if (pages) { let o = 0; pages.forEach(p => { ps.push(o); o += p.length + 1; }); }
  return { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, ext, kind: kindOf(name, text, mail), isMail: mail, src: mail ? 'Email' : 'Files', date, text: text.slice(0, 100000), pageStarts: ps.length ? ps : null, size, cur: true, ver: (name.match(/\b(?:v|rev\.?\s?)\d+(?:\.\d+)?/i) || [''])[0], p: null, page: null };
}
async function readInputs(files, pasted) {
  const docs = [], errors = [];
  for (const f of files) { try { const r = await readFile(f); if (!r.text || r.text.length < 20) throw new Error('No readable text (scanned PDF or empty file). OCR is not part of this prototype.'); docs.push(mkDoc(r.name, r.ext, r.text, r.pages, f.lastModified, f.size, false)); } catch (e) { errors.push({ name: f.name, msg: e.message || String(e) }); } }
  if (pasted && pasted.trim().length > 20) docs.push(mkDoc('Pasted email ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), 'txt', norm(pasted), null, Date.now(), pasted.length, true));
  return { docs, errors };
}
const pageAt = (doc, i) => { if (!doc.pageStarts) return null; let pg = 1; doc.pageStarts.forEach((o, k) => { if (i >= o) pg = k + 1; }); return pg; };

/* ---------- project detection ---------- */
const NAME_STOP = new Set('Manager Plan Schedule Team Management Number Name Phase Development Finance Storage Project Market Pipeline Technology Systems System Data Site Capacity Report Review Status Update Overview Summary Meeting Agreement Contract Contact Information Details Description Scope Risk Costs Cost Budget Timeline Documents Document Lead Engineer Owner Sponsor Charter Start End Date Title Version Page Table Section Appendix Annex The This That And For With Batterie Speicher Projekt Planung Bau'.split(' '));
function detectNames(text, fname) {
  const out = {}, add = (n, w) => { out[n] = (out[n] || 0) + w; }, tc = c => c[0].toUpperCase() + c.slice(1).toLowerCase();
  const scan = (s, w) => {
    for (const m of s.matchAll(/\bBESS[\s-]+([A-ZÄÖÜ][\wäöüß]+(?:-[A-ZÄÖÜ][\wäöüß]+)?)/g)) { if (!NAME_STOP.has(m[1]) && m[1].length > 2) add('BESS ' + tc(m[1]), w); }
    for (const m of s.matchAll(/\b(?:Project|Projekt)\s+([A-ZÄÖÜ][\wäöüß-]+)/g)) { if (!NAME_STOP.has(m[1]) && m[1].length > 2) add('Project ' + tc(m[1]), w); }
  };
  scan(text, 1); scan(fname.replace(/[_.]/g, ' '), 3);
  return out;
}
function candidates(doc) {
  const out = new Map();
  S.projects.forEach(p => { const rx = rxOf(p.name), n = (doc.text.match(new RegExp(rx.source, 'gi')) || []).length + (rx.test(doc.name) ? 3 : 0); if (n) out.set(p.id, { key: p.id, name: p.name, existing: p.id, rx, w: n }); });
  Object.entries(detectNames(doc.text, doc.name)).forEach(([n, w]) => {
    if (S.projects.some(p => p.name.toLowerCase() === n.toLowerCase() || (/^BESS/i.test(p.name) && /^BESS/i.test(n) && shortOf(p.name).toLowerCase() === shortOf(n).toLowerCase()))) return;
    out.set('new:' + n.toLowerCase(), { key: 'new:' + n.toLowerCase(), name: n, existing: null, rx: rxOf(n), w });
  });
  return [...out.values()];
}

/* ---------- fact extraction (every fact keeps its source sentence) ---------- */
const CAP = /capacity|configuration|installed|nameplate|leistung|rated|import\/export|power|kapazität/i, TMP = /temporar|limit|reduc|derat|befristet/i, GRIDW = /connection|grid|substation|umspannwerk|netz|voltage|spannung/i;
const LOC = /site|location|located|standort|situated|substation|umspannwerk|near|gemeinde|address|plot|parcel|lease/i, NEG = /no longer|postpon|delay|verschob|verzög|previous|bisher|not achievable|unachievable/i;
const PHX = { pl: /permit|application|study|site selection|lease|feasibility|negotiat|draft|genehmigung|antrag/i, bu: /construction|\bEPC\b|delivery|\bFAT\b|\bSAT\b|procurement|installation|civil works|baubeginn|baustelle/i, op: /in operation|operational|operating since|performance monitoring|availability|warranty claim|im betrieb/i };
const ORG = /\b([A-ZÄÖÜ][\wÄÖÜäöüß&.\-]*(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß&.\-]*){0,3}\s+(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|SE|KG|UG|Ltd\.?|B\.V\.|S\.A\.))/g;
const dateRole = c => /\bCOD\b|commercial operation|inbetriebnahme|go-live|commissioning date/i.test(c) ? 'cod' : /energi[sz]ation|spannungsaufschaltung/i.test(c) ? 'energisation' : /connection|netzanschluss|anschluss/i.test(c) ? 'grid' : /permit|genehmigung|approval/i.test(c) ? 'permit' : null;
const newF = () => ({ mw: [], mwh: [], kv: [], loc: {}, op: {}, dates: [], parties: {}, ph: { pl: 0, bu: 0, op: 0 }, fx: { permits: null, grid: null, contract: null, financing: null } });
function factor(F, key, s, e, openRx, okRx, notRx) {
  if (notRx && notRx.test(s)) return;
  let st = null;
  if (okRx.test(s) && !/\b(not|no|nicht|kein|pending|awaiting|yet to|outstanding|expected|planned|targeted)\b/i.test(s)) st = 'ok'; else if (openRx.test(s)) st = 'open';
  if (st && (!F.fx[key] || RK[st] > RK[F.fx[key].st])) F.fx[key] = { st, ev: e };
}
function take(F, s, ev) {
  const e = { ...ev, s: s.slice(0, 220) };
  for (const m of s.matchAll(/(\d{1,4}(?:[.,]\d+)?)\s*(MWh|MW)\b/gi)) (m[2].toLowerCase() === 'mwh' ? F.mwh : F.mw).push({ v: parseFloat(m[1].replace(',', '.')), w: (CAP.test(s) ? 2 : 0) - (TMP.test(s) ? 3 : 0), ev: e });
  const kv = s.match(/(\d{2,3})\s*-?\s*kV\b/i); if (kv) F.kv.push({ v: +kv[1], w: GRIDW.test(s) ? 2 : 0, ev: e });
  GAZ_RX.forEach(([k, rx]) => { if (rx.test(s)) { const o = F.loc[k] || (F.loc[k] = { n: 0, ev: e }); o.n += LOC.test(s) ? 3 : 1; } });
  OPS_RX.forEach(([k, rx]) => { if (rx.test(s)) { const o = F.op[k] || (F.op[k] = { n: 0, ev: e }); o.n++; } });
  for (const m of s.matchAll(ORG)) { const o = F.parties[m[1]] || (F.parties[m[1]] = { n: 0, ev: e, kind: ev.kind }); o.n++; }
  if (!NEG.test(s) && !REQ.test(s)) s.split(/,|;|\bwith\b|\bwhile\b|\bwhereas\b/).forEach(c => { const ds = dates(c); if (!ds.length) return; const role = dateRole(c) || dateRole(s); if (role) F.dates.push({ role, date: ds[0], ev: e }); });
  Object.keys(PHX).forEach(k => { if (PHX[k].test(s)) F.ph[k]++; });
  factor(F, 'permits', s, e, /permit|genehmigung|bimschg|auflage/i, /permit[^.]{0,50}(granted|approved|issued|received)|genehmigung[^.]{0,40}(erteilt|liegt vor)|approved subject to|(approved|granted)[^.]{0,30}permit/i);
  factor(F, 'grid', s, e, /connection|netzanschluss|network study|\bE1\b|\bE8\b|grid application/i, /(connection|netzanschluss)[^.]{0,60}(signed|executed|concluded|granted|confirmed|unterzeichnet|zusage)|signed[^.]{0,40}connection/i);
  factor(F, 'contract', s, e, /draft|quote|offer|angebot|negotiat|\bEPC\b|contract|vertrag|supply agreement/i, /(contract|agreement|vertrag)[^.]{0,50}(signed|executed|concluded|unterzeichnet)|signed (contract|agreement)/i, /connection|netzanschluss/i);
  factor(F, 'financing', s, e, /financ|term sheet|loan|darlehen|equity|lender/i, /financ[^.]{0,50}(closed|secured|committed|signed|zugesagt)|term sheet[^.]{0,30}signed/i);
}
function extractFacts(doc, cands, strict) {
  const out = {}, dflt = cands.length === 1 && !strict ? cands[0] : null; let pos = 0;
  doc.text.split(/\n+/).forEach(line => {
    let cur = dflt;
    line.split(/(?<=[.!?])\s+/).forEach(raw => {
      const s = raw.trim(); if (!s) return;
      const m = cands.filter(c => c.rx.test(s)); if (m.length > 1) return; if (m.length === 1) cur = m[0]; if (!cur) return;
      const i = doc.text.indexOf(s, pos); if (i >= 0) pos = i;
      take(out[cur.key] || (out[cur.key] = newF()), s, { doc: doc.name, pg: i >= 0 ? pageAt(doc, i) : null, date: doc.date, kind: doc.kind });
    });
  });
  return out;
}
const addMap = (d, s) => { for (const k in s) { const o = d[k] || (d[k] = { n: 0, ev: s[k].ev, kind: s[k].kind }); o.n += s[k].n; } };
function mergeF(list) {
  const F = newF();
  list.forEach(x => { F.mw.push(...x.mw); F.mwh.push(...x.mwh); F.kv.push(...x.kv); F.dates.push(...x.dates); addMap(F.loc, x.loc); addMap(F.op, x.op); addMap(F.parties, x.parties); Object.keys(F.ph).forEach(k => F.ph[k] += x.ph[k]);
    Object.keys(x.fx).forEach(k => { const a = x.fx[k], b = F.fx[k]; if (a && (!b || RK[a.st] > RK[b.st] || (RK[a.st] === RK[b.st] && a.ev.date > b.ev.date))) F.fx[k] = a; }); });
  return F;
}
function best(arr) {
  if (!arr.length) return null; const c = {}; arr.forEach(x => { c[x.v] = (c[x.v] || 0) + 1 + x.w; });
  const v = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; return arr.filter(x => String(x.v) === v).sort((a, b) => a.ev.date < b.ev.date ? 1 : -1)[0];
}
function finalizeF(F) {
  const o = { dates: {} }, mw = best(F.mw.filter(x => x.w > -1)), mwh = best(F.mwh.filter(x => x.w > -1)), kv = best(F.kv.filter(x => x.w > -1));
  if (mw) o.mw = mw; if (mwh) o.mwh = mwh; if (kv) o.kv = kv;
  const loc = Object.entries(F.loc).map(([k, x]) => [k, x.n - (GAZ[k][2] ? 5 : 0), x.ev]).sort((a, b) => b[1] - a[1])[0]; if (loc) o.city = { v: loc[0], ev: loc[2] };
  const op = Object.entries(F.op).sort((a, b) => b[1].n - a[1].n)[0]; if (op) o.operator = { v: op[0], ev: op[1].ev };
  Object.keys(DL).forEach(r => { const a = F.dates.filter(d => d.role === r).sort((x, y) => x.ev.date < y.ev.date ? 1 : x.ev.date > y.ev.date ? -1 : 0); if (a.length) o.dates[r] = { date: a[0].date, ev: a[0].ev, alts: [...new Set(a.slice(1).map(x => x.date).filter(d => d !== a[0].date))] }; });
  o.parties = Object.entries(F.parties).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([n, x]) => ({ name: n, kind: x.kind, ev: x.ev }));
  const ph = F.ph; o.phase = ph.op >= 2 && ph.op >= ph.bu ? 'Operation' : ph.bu >= 2 && ph.bu >= ph.pl ? 'Building' : 'Planning';
  o.f = {}; FK.forEach(k => o.f[k] = F.fx[k] || { st: 'none', ev: null });
  return o;
}

/* ---------- proposal: what BESSMIND would add or change (nothing is applied yet) ---------- */
const ddiff = (a, b) => { const x = pd(a), y = pd(b); return x != null && y != null ? Math.round(x - y) : Math.round((dm(a) - dm(b)) * 30.4); };
function diffExisting(p, F) {
  const ch = [], add = (k, label, old, nu, ev, extra) => ch.push({ k, label, old, new: nu, ev, on: true, type: old ? 'changed' : 'new', ...extra });
  [['mw', 'Capacity', 'MW', p.mw], ['mwh', 'Storage', 'MWh', p.mwh], ['kv', 'Voltage', 'kV', p.kv]].forEach(([k, l, u, cur]) => { if (F[k] && F[k].v !== cur) add(k, l, cur ? cur + ' ' + u : '', F[k].v + ' ' + u, F[k].ev, { val: F[k].v }); });
  if (F.city && !(p.city || '').includes(F.city.v)) add('city', 'Location', p.city, F.city.v, F.city.ev, { val: F.city.v });
  if (F.operator && F.operator.v !== p.operator) add('operator', 'Grid operator', p.operator || '', F.operator.v, F.operator.ev, { val: F.operator.v });
  Object.keys(DL).forEach(r => { const d = F.dates[r]; if (!d) return; const old = p.dates && p.dates[r] ? p.dates[r].date : ''; if (!old || Math.abs(ddiff(d.date, old)) > 2) add('date:' + r, DL[r], old, d.date, d.ev, { role: r, val: d.date, days: old ? ddiff(d.date, old) : 0 }); });
  FK.forEach((k, i) => { const x = F.f[k]; if (RK[x.st] > RK[p.f[i]]) add('f:' + i, FL[i], FS[p.f[i]], FS[x.st], x.ev, { idx: i, st: x.st, type: 'upgrade' }); });
  return ch;
}
function buildProposal(docs, errors) {
  const P = new Map(), una = [];
  docs.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(doc => {
    const c = candidates(doc); if (!c.length) { una.push(doc); return; }
    const fx = extractFacts(doc, c, false); doc.single = c.length === 1; doc.primary = c.slice().sort((a, b) => b.w - a.w)[0].key;
    c.forEach(cd => { const e = P.get(cd.key) || { key: cd.key, name: cd.name, existing: cd.existing, include: true, docs: [], Fs: [] }; e.docs.push(doc.id); if (fx[cd.key]) e.Fs.push(fx[cd.key]); P.set(cd.key, e); });
  });
  const projects = [...P.values()]; projects.forEach(e => { e.F = finalizeF(mergeF(e.Fs)); e.changes = e.existing ? diffExisting(proj(e.existing), e.F) : null; });
  return { docs, projects, unassigned: una, errors: errors || [], hits: null };
}
function proposeFromName(name, extra) {
  const key = 'new:' + name.toLowerCase(), c = { key, name, existing: null, rx: rxOf(name), w: 5 }, hits = S.docs.filter(d => d.text && c.rx.test(d.text + ' ' + d.name)), Fs = [];
  hits.forEach(d => { const fx = extractFacts(d, [c], true); if (fx[key]) Fs.push(fx[key]); });
  const e = { key, name, existing: null, include: true, docs: [], Fs, found: hits.length }; e.F = finalizeF(mergeF(Fs)); e.changes = null;
  const me = { doc: 'Entered by you', pg: null, date: new Date().toISOString().slice(0, 10), s: '' };
  if (extra.mw && +extra.mw > 0) e.F.mw = { v: +extra.mw, ev: me };
  if (extra.city) { const k = Object.keys(GAZ).find(g => g.toLowerCase() === extra.city.trim().toLowerCase()); e.F.city = { v: k || extra.city.trim(), ev: me }; }
  if (extra.cod) { const d = dates(extra.cod)[0]; if (d) e.F.dates.cod = { date: d, ev: me, alts: [] }; }
  return { docs: [], projects: [e], unassigned: [], errors: [], hits };
}

/* ---------- applying: create / update projects, file documents, run the rule engine ---------- */
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function baseRtb(p) { const pts = { ok: 20, open: 8, none: 0 }; let v = 10 + p.f.reduce((a, x) => a + pts[x], 0); if (p.phase === 'Building') v += 8; if (p.phase === 'Operation') v += 15; return clampN(v, 5, 98); }
function doneOf(p) { if (p.phase === 'Operation') return 9; if (p.phase === 'Building') return p.f[2] === 'ok' ? 5 : 4; return (p.city ? 1 : 0) + (p.f[0] === 'ok' ? 1 : 0) + (p.f[1] === 'ok' ? 1 : 0) + (p.f[2] === 'ok' ? 1 : 0); }
const dEnd = s => { const q = s.match(/Q([1-4])\s+(\d{4})/i); return q ? (q[2] - 2025) * 12 + q[1] * 3 : dm(s); };
function ensureTl(p) {
  if (p.tl || p.phase === 'Operation') return;
  const d = p.dates || {}; let cod, gridEnd = null;
  if (d.cod) cod = dEnd(d.cod.date); else if (d.energisation) { gridEnd = dEnd(d.energisation.date); cod = gridEnd + 3; } else if (d.grid) { gridEnd = dEnd(d.grid.date); cod = gridEnd + 3; } else return;
  const R = [[cod - 36, cod - 20], [cod - 30, gridEnd != null ? gridEnd : cod - 3], [cod - 20, cod - 11], [cod - 12, cod - 2], [cod - 2, cod]];
  p.tl = R.map(([s, e]) => ({ s, e, s0: s, e0: e })); p.tlAssumed = true;
  p.t = { pl: [R[0][0], R[1][1]], bu: [R[2][0], cod], op: [cod, cod + 12] };
  if (!d.cod) { p.codEst = true; p.cod = qlab(cod) + ' (est.)'; } else p.cod = qlab(cod);
}
function setFs(p, key, label, value, ev) { (p.fs = p.fs || {})[key] = { label, value: String(value), src: srcOf(ev), ev: (ev && ev.s) || '' }; }
const uid = name => { let b = name.toLowerCase().replace(/[^a-z0-9äöü]+/g, '-').replace(/^-|-$/g, '') || 'project', id = b, n = 2; while (proj(id)) id = b + '-' + n++; return id; };
function createProject(e) {
  const F = e.F, p = { id: uid(e.name), name: e.name.trim(), phase: F.phase, f: FK.map(k => F.f[k].st), fsrc: FK.map(k => F.f[k].ev ? srcOf(F.f[k].ev) : null), mw: F.mw ? F.mw.v : null, mwh: F.mwh ? F.mwh.v : null, kv: F.kv ? F.kv.v : null, cp: null, operator: F.operator ? F.operator.v : null, city: F.city ? F.city.v : '', lat: null, lon: null, cod: '', dates: {}, fs: {}, milestones: [], trend: [], shifts: [], why: [], tl: null, t: null, done: 0, rtb: 0, created: Date.now() };
  [['mw', 'Capacity', 'MW'], ['mwh', 'Storage', 'MWh'], ['kv', 'Voltage', 'kV']].forEach(([k, l, u]) => { if (F[k]) setFs(p, k, l, F[k].v + ' ' + u, F[k].ev); });
  if (F.city) { setFs(p, 'city', 'Location', F.city.v, F.city.ev); const g = GAZ[F.city.v]; if (g) { p.lat = g[0]; p.lon = g[1]; } }
  if (F.operator) setFs(p, 'operator', 'Grid operator', F.operator.v, F.operator.ev);
  Object.entries(F.dates).forEach(([r, d]) => { p.dates[r] = { date: d.date, src: srcOf(d.ev) }; p.milestones.push({ label: DL[r], date: d.date }); setFs(p, r, DL[r], d.date, d.ev); });
  if (!p.lat) { const g = GAZ[shortOf(p.name)]; if (g) { p.lat = g[0]; p.lon = g[1]; if (!p.city) p.city = shortOf(p.name); } }
  p.done = doneOf(p); p.rtb = baseRtb(p); ensureTl(p);
  return p;
}
function applyChanges(p, e, sum) {
  const before = baseRtb(p); p.fs = p.fs || {};
  e.changes.filter(c => c.on).forEach(c => {
    if (['mw', 'mwh', 'kv'].includes(c.k)) { p[c.k] = c.val; setFs(p, c.k, c.label, c.new, c.ev); }
    else if (c.k === 'city') { p.city = c.val; const g = GAZ[c.val]; if (g) { p.lat = g[0]; p.lon = g[1]; } setFs(p, 'city', c.label, c.val, c.ev); }
    else if (c.k === 'operator') { p.operator = c.val; setFs(p, 'operator', c.label, c.val, c.ev); }
    else if (c.k.startsWith('date:')) {
      p.dates = p.dates || {}; p.dates[c.role] = { date: c.val, src: srcOf(c.ev) }; setFs(p, c.role, c.label, c.val, c.ev); (p.milestones = p.milestones || []).unshift({ label: c.label, date: c.val });
      if (p.tl && c.days) { shiftProject(p, c.role === 'cod' ? 'Construction' : 'Grid connection', c.days, c.label + ' changed in ' + c.ev.doc, c.ev.s);
        if (c.days > 0) { p.why.unshift({ cat: c.role === 'cod' ? 'Schedule' : 'Grid', pts: clampN(Math.round(c.days / 5), 5, 30), title: c.label + ' moved +' + c.days + ' days', ev: c.ev.s, t: Date.now() }); S.changes.unshift({ t: Date.now(), p: p.id, text: c.label + ' moved +' + c.days + ' days', src: c.ev.doc, ev: c.ev.s }); } }
      else if (!p.tl) ensureTl(p);
    } else if (c.k.startsWith('f:')) { p.f[c.idx] = c.st; (p.fsrc = p.fsrc || [])[c.idx] = srcOf(c.ev); }
  });
  p.rtb = clampN(p.rtb + baseRtb(p) - before, 3, 99);
  if (p.phase !== 'Operation' && p.done < doneOf(p)) p.done = doneOf(p);
}
function storeDoc(d, pid) {
  const key = d.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[\s_-]*(v|rev\.?|version)?\s*\d+(\.\d+)*\s*$/, '').trim();
  if (S.docs.some(x => x.name === d.name && x.date === d.date && x.size === d.size && x.p === pid)) return false;
  S.docs.forEach(x => { if (x.p === pid && x.kind === d.kind && x.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[\s_-]*(v|rev\.?|version)?\s*\d+(\.\d+)*\s*$/, '').trim() === key) x.cur = false; });
  S.docs.unshift({ id: d.id, p: pid, name: d.name, ver: d.ver, cur: true, src: d.src, date: d.date, page: null, text: d.text, pageStarts: d.pageStarts, kind: d.kind, size: d.size });
  return true;
}
function applyProposal(pr) {
  const sum = { t: Date.now(), created: [], updated: [], docs: 0, findings: [] }, idOf = {}, rtb0 = {};
  S.projects.forEach(p => rtb0[p.id] = p.rtb);
  pr.projects.filter(x => x.include).forEach(e => {
    const doc0 = pr.docs.find(d => d.id === e.docs[0]), srcL = doc0 ? doc0.src : 'Entered by you';
    if (e.existing) { const p = proj(e.existing); applyChanges(p, e, sum); idOf[e.key] = p.id; sum.updated.push(p.name); S.changes.unshift({ t: Date.now(), p: p.id, text: 'Project updated from imported data', src: srcL, ev: e.changes.filter(c => c.on).map(c => c.label).join(', ') || 'Documents filed' }); }
    else { const p = createProject(e); S.projects.push(p); idOf[e.key] = p.id; sum.created.push(p.name); S.changes.unshift({ t: Date.now(), p: p.id, text: 'Project created from imported data', src: srcL, ev: doc0 ? doc0.name : 'Entered by you' }); if (pr.hits) pr.hits.forEach(d => { if (!d.p) d.p = p.id; }); }
  });
  pr.docs.forEach(d => { const pid = idOf[d.primary] || null; d.p = pid; if (storeDoc(d, pid)) sum.docs++; });
  pr.unassigned.forEach(d => { if (storeDoc(d, d.assign || null)) sum.docs++; });
  pr.docs.concat(pr.unassigned).filter(d => d.isMail || d.kind === 'Document').forEach(d => { const pid = d.p || d.assign, forced = d.single && pid && proj(pid) ? pid : 'auto', r = analyze(d.text, forced); if (!r.error) sum.findings.push(...r.results); });
  S.projects.forEach(p => { if (rtb0[p.id] != null && rtb0[p.id] !== p.rtb) p.trend = [...(p.trend || []), rtb0[p.id]].slice(-5); });
  S.log.unshift({ t: sum.t, docs: pr.docs.concat(pr.unassigned).map(d => d.name), created: sum.created, updated: sum.updated });
  save(); return sum;
}
