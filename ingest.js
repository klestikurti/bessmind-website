/* BESSMIND ingestion engine (prototype).
   Reads emails and files locally in the browser, extracts project facts WITH evidence,
   and proposes projects / updates. Rule-based; the full product replaces this with AI models.
   Principle: nothing is guessed. Missing facts stay empty and are reported as "not found". */
const emptyState = () => ({ projects: [], changes: [], tasks: [], docs: [], filings: {}, applied: {}, log: [], sel: null, rsel: null, nextId: 1, sample: false, learn: { ent: {}, kw: {} } });
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
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); let date = iso(new Date(ts)); const dh = text.match(/^Date:\s*(.+)$/im); if (dh && !isNaN(new Date(dh[1]))) date = iso(new Date(dh[1]));
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


/* ---------- standardized information catalog ----------
   Every fact BESSMIND looks for is listed here: key, section, label, unit, single-valued (1) or list (0).
   Anything found about a project that matches none of these goes to "Others" (key "other"). */
const SECS = [['ov', 'Overview & technical'], ['site', 'Site & location'], ['perm', 'Permits & approvals'], ['grid', 'Grid connection'], ['contr', 'Contracts & suppliers'], ['proc', 'Procurement & delivery'], ['fin', 'Financing'], ['cons', 'Construction & commissioning'], ['ops', 'Operation & maintenance'], ['ctc', 'Contacts & parties'], ['docs', 'Documentation'], ['act', 'Tasks & requests'], ['oth', 'Others']];
const SECN = Object.fromEntries(SECS);
const CAT = [
  ['mw', 'ov', 'Capacity', 'MW', 1], ['mwh', 'ov', 'Storage capacity', 'MWh', 1], ['kv', 'ov', 'Connection voltage', 'kV', 1], ['tech', 'ov', 'Battery technology', '', 1], ['units', 'ov', 'Number of containers', '', 1],
  ['street', 'site', 'Street and house number', '', 1], ['postal', 'site', 'Postal code', '', 1], ['city', 'site', 'City / municipality', '', 1], ['state', 'site', 'Federal state', '', 1], ['parcel', 'site', 'Parcel (Flurstück)', '', 0], ['lease', 'site', 'Lease and land rights', '', 0],
  ['permit_status', 'perm', 'Permit status', '', 1], ['permit_auth', 'perm', 'Permitting authority', '', 1], ['permit_ref', 'perm', 'Permit reference number', '', 1], ['permit_date', 'perm', 'Permit date', '', 1], ['permit_cond', 'perm', 'Permit conditions', '', 0],
  ['operator', 'grid', 'Grid operator', '', 1], ['connpoint', 'grid', 'Connection point / substation', '', 1], ['grid_status', 'grid', 'Connection agreement status', '', 1], ['grid_date', 'grid', 'Grid connection date', '', 1], ['energisation', 'grid', 'Energisation date', '', 1], ['grid_note', 'grid', 'Grid studies and constraints', '', 0],
  ['supplier', 'contr', 'Supplier / manufacturer', '', 1], ['supplier_cand', 'contr', 'Supplier candidates', '', 0], ['epc_cand', 'contr', 'EPC candidates', '', 0], ['epc', 'contr', 'EPC contractor', '', 1], ['contract_status', 'contr', 'Contract status', '', 1], ['longstop', 'contr', 'Long-stop date', '', 1],
  ['quote', 'proc', 'Quote reference', '', 1], ['price', 'proc', 'Price / value', '', 0], ['price_chg', 'proc', 'Price change', '', 0], ['delivery', 'proc', 'Delivery', '', 0], ['quote_valid', 'proc', 'Quote valid until', '', 1],
  ['fin_status', 'fin', 'Financing status', '', 1], ['fin_amount', 'fin', 'Financing amount', '', 0], ['lender', 'fin', 'Lender / investor', '', 0],
  ['con_start', 'cons', 'Construction start', '', 1], ['commissioning', 'cons', 'Commissioning', '', 1], ['cod', 'cons', 'Target COD', '', 1],
  ['warranty', 'ops', 'Warranty and maintenance', '', 0],
  ['contact', 'ctc', 'Contact', '', 0], ['org', 'ctc', 'Organisations mentioned', '', 0],
  ['request', 'act', 'Open request', '', 0],
  ['nt_ov', 'ov', 'Notes and updates', '', 0], ['nt_site', 'site', 'Notes and updates', '', 0], ['nt_perm', 'perm', 'Notes and updates', '', 0], ['nt_grid', 'grid', 'Notes and updates', '', 0], ['nt_contr', 'contr', 'Notes and updates', '', 0], ['nt_proc', 'proc', 'Notes and updates', '', 0], ['nt_fin', 'fin', 'Notes and updates', '', 0], ['nt_cons', 'cons', 'Notes and updates', '', 0], ['nt_ops', 'ops', 'Notes and updates', '', 0],
  ['other', 'oth', 'Other information', '', 0]];
const CATK = {}; CAT.forEach(([k, sec, label, unit, one]) => { CATK[k] = { k, sec, label, unit, one: !!one }; });
const KEYSTAT = { permit_status: 0, grid_status: 1, contract_status: 2, fin_status: 3 };
const KEYDATE = new Set(['grid_date', 'energisation', 'cod', 'con_start', 'commissioning', 'permit_date', 'quote_valid', 'longstop']);
const KEYNUM = new Set(['mw', 'mwh', 'kv', 'units']);
const ROLEK = { cod: 'cod', energisation: 'energisation', grid: 'grid_date', con_start: 'con_start' };

/* ---------- project detection (strict: nothing is invented from a single word) ---------- */
const NAME_STOP = new Set('Manager Plan Schedule Team Management Number Name Phase Development Finance Storage Project Projects Market Markets Pipeline Technology Systems System Data Site Capacity Report Review Status Update Overview Summary Meeting Agreement Contract Contact Information Details Description Scope Risk Costs Cost Budget Timeline Documents Document Lead Engineer Owner Sponsor Charter Start End Date Title Version Page Table Section Appendix Annex The This That And For With Batterie Speicher Projekt Planung Bau Value Test Portfolio Business Developer Developers Operator Operators Solutions Sector Industry Installation Installations Unit Units Container Containers Battery Application Applications Case Cases Service Services Energy Power Revenue Sizing Strategy Study Studies Standard Standards Pilot Example Template Sample Demo'.split(' '));
const NAME_BAD = /^[A-ZÄÖÜ]{2,6}(?:-[A-ZÄÖÜ]{2,6})*$/;
function detectNames(text, fname) {
  const out = {}, add = (n, w) => { out[n] = (out[n] || 0) + w; }, ok = t => t.length > 2 && !NAME_STOP.has(t) && !NAME_BAD.test(t) && !/^\d/.test(t);
  const scan = (s, w) => {
    for (const m of s.matchAll(/\bBESS[\s-]+([A-ZÄÖÜ][\wäöüß]+(?:-[A-ZÄÖÜ][\wäöüß]+)?)/g)) if (ok(m[1])) add('BESS ' + m[1], w);
    for (const m of s.matchAll(/\b(?:Project|Projekt)(?:\s?name|name)?\s*[:–-]\s*([A-ZÄÖÜ][\wäöüß]+(?:[ -][A-ZÄÖÜ][\wäöüß]+)?)/g)) if (ok(m[1].split(/[ -]/)[0])) add(m[1].trim(), w + 2);
  };
  scan(text, 1); scan(text.slice(0, 200), 2); scan(fname.replace(/[_.]/g, ' '), 3);
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

/* ---------- extraction: one sentence in, standardized items out ---------- */
const CAP = /capacity|configuration|installed|nameplate|leistung|rated|import\/export|power|kapazität/i, TMP = /temporar|limit|reduc|derat|befristet/i, GRIDW = /connection|grid|substation|umspannwerk|netz|voltage|spannung/i;
const LOC = /\b(?:site|location|located|standort|situated|substation|umspannwerk|near|gemeinde|address|adresse|plot|parcel|lease)\b/i, NEG = /no longer|postpon|delay|verschob|verzög|previous|bisher|not achievable|unachievable/i;
const NEGST = /\b(not|no|nicht|kein|pending|awaiting|yet to|outstanding|expected|planned|targeted|ausstehend)\b/i;
const PHX = { pl: /permit|application|study|site selection|lease|feasibility|negotiat|draft|genehmigung|antrag/i, bu: /construction|\bEPC\b|delivery|\bFAT\b|\bSAT\b|procurement|installation|civil works|baubeginn|baustelle/i, op: /in operation|operational|operating since|performance monitoring|availability|warranty claim|im betrieb/i };
const ORG2 = /\b([A-ZÄÖÜ][\wÄÖÜäöüß&.\-]*(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß&.\-]*){0,3}\s+(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|SE|KG|UG|Ltd\.?|B\.V\.|S\.A\.|Systems|Solutions|Technologies|Energy|Power|Engineering|Netze|Netz|Storage))\b/g;
const dateRole = c => /construction (?:start|begin)|start of construction|baubeginn|spatenstich|groundbreaking/i.test(c) ? 'con_start' : /\bCOD\b|commercial operation|inbetriebnahme|go-live|commissioning date/i.test(c) ? 'cod' : /energi[sz]ation|spannungsaufschaltung/i.test(c) ? 'energisation' : /connection|netzanschluss|anschluss/i.test(c) ? 'grid' : null;
const STREET_RX = /\b([A-ZÄÖÜ][\wäöüß.\-]*(?:\s[A-ZÄÖÜ][\wäöüß.\-]*)?\s?(?:[Ss]tra(?:ß|ss)e|[Ss]tr\.|[Ww]eg|[Aa]llee|[Pp]latz|[Rr]ing|[Dd]amm|[Cc]haussee|[Gg]asse|[Uu]fer|[Pp]fad)|(?:Am|An der|An den|Auf dem|Im|In der|Zum|Zur)\s[A-ZÄÖÜ][\wäöüß\-]+)\s+(\d{1,4}\s?[a-z]?)\b(?!\s*(?:MW|kV|%|€|GWh|MWh))/;
const POSTAL_RX = /\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß\-]+(?:\s(?:am|an der|im|bei|ob der)\s[A-ZÄÖÜ][\wäöüß\-]+)?)/;
const NOTCITY = new Set('Euro EUR Euros MW MWh kV Mio Mrd Prozent Jahre Jahr Tage Stunden Wochen Monate Units Unit years days weeks months hours Stück'.split(' '));
const AMT_RX = /(?:€|EUR)\s?(\d[\d.,]*)\s?(k|m|mio\.?|million|mn|mrd|bn)?(?![\w])|(\d[\d.,]*)\s?(k|m|mio\.?|million|mn|mrd|bn)?\s?(?:€|EUR|Euro)\b/i;
const TECH = [[/LFP|iron[- ]phosphate/i, 'LFP (lithium iron phosphate)'], [/\bNMC\b/i, 'NMC'], [/sodium[- ]ion/i, 'Sodium-ion'], [/vanadium|flow battery/i, 'Flow battery'], [/lithium[- ]ion|li-?ion/i, 'Lithium-ion']];
const GAZ_P = GAZ_RX.map(([k, rx]) => [k, rx, new RegExp('\\b(?:in|at|near|bei|nahe|nördlich von|südlich von|östlich von|westlich von)\\s+' + reEsc(k) + '\\b', 'i')]);
const SKIP_OTHER = /^(?:dear|hi\b|hello|best regards|kind regards|regards|sincerely|thanks|thank you|many thanks|sehr geehrte|mit freundlichen|viele grüße|freundliche grüße|von:|from:|to:|cc:|subject:|date:|betreff:|an:|gesendet)/i;
const isOp = o => OPS.some(x => o.toLowerCase().includes(x.toLowerCase()));
const snip = (s, n) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const splitSent = line => line.split(/(?<=[.!?])(?<!\b(?:[Ss]tr|Nr|Dr|ca|No|rev|approx|bzw|Tel|etc|vs|e\.g|i\.e|z\.B|d\.h|u\.a|\d{1,2})\.)\s+(?=[A-Za-zÄÖÜäöü0-9"'(])/);


/* ---------- cue + slot reading: understands "the connection point is going to be at substation Seffent" ----------
   A cue phrase (EN/DE, synonyms, small typos, any capitalisation) is located, filler words are skipped
   and the entity that follows is read. Lowercase entities are only accepted directly after the cue. */
const STOPW = new Set('the a an and und but which that for with near is are will was be to at in on by from because so as where der die das ein eine aber bei am im an zum zur going planned confirmed set now then also new neu located of or oder not no nicht'.split(' '));
const NOTENT = new Set('capacity voltage upgrade work works project connection grid study studies data plan design status date point operator owner equipment area site building extension expansion bay transformer requires needs schedule contract agreement price quote offer progress development planning operation construction phase question issue issues problem problems news update updates information details documents document team everyone'.split(' '));
const FILL = /^(?:[\s:=\-–—,]|(?:is|are|was|will|be|going|to|shall|ist|wird|sein|liegt|befindet|sich|located|planned|confirmed|set|now|then|also|new|neu|at|in|on|bei|am|im|an|the|der|die|das|a|ein|eine|called|named|namens)\b)*/i;
function slotAfter(s, cueRx, o) {
  o = o || {}; const m = cueRx.exec(s); if (!m) return null;
  const r0 = s.slice(m.index + m[0].length).replace(/^\s+/, ''), r1 = r0.replace(FILL, ''), filled = r1.length !== r0.length, toks = []; let rest = r1;
  while (toks.length < (o.max || 3)) {
    const t = /^([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß\-&]*)([.,;:!?]*)\s*/.exec(rest); if (!t) break;
    const w = t[1], lw = w.toLowerCase();
    if (STOPW.has(lw) || NOTENT.has(lw)) break;
    if (!toks.length && (filled || o.cap) && !/^[A-ZÄÖÜ]/.test(w)) break;
    if (toks.length && !/^[A-ZÄÖÜ0-9]/.test(w) && !o.low) break;
    toks.push(w[0].toUpperCase() + w.slice(1)); rest = rest.slice(t[0].length); if (t[2]) break;
  }
  return toks.length ? { v: toks.join(' '), cue: m[0], filled } : null;
}
const SUBST = /\b(?:sub-?sta\w{1,3}on|umspannwerk|UW)\b/i;
const CUE_HINTS = [[/connection point|substation|umspannwerk|netzverknüpfung/i, 'connpoint'], [/operator|netzbetreiber/i, 'operator'], [/supplier|manufacturer|vendor|lieferant/i, 'supplier'], [/permit|genehmigung/i, 'permit_status'], [/price|quote|cost|angebot/i, 'price'], [/deliver|lieferung/i, 'delivery'], [/financ|loan|darlehen/i, 'fin_status'], [/capacity|\bMW\b|leistung/i, 'mw'], [/address|street|adresse|straße/i, 'street']];
const GAZ_L = {}; Object.keys(GAZ).forEach(k => { GAZ_L[k.toLowerCase()] = k; });


/* ---------- topic understanding: which part of the project is this sentence about? ---------- */
const TOPIC = {
  perm: /\b(?:landratsamt\w*|bauamt\w*|bauaufsicht\w*|landesamt\w*|permit\w*|permis\w*|licen[cs]e\w*|approv\w*|authorit\w+|condition\w*|noise|emission\w*|environment\w*|eia|umwelt\w*|genehmig\w*|bimschg|auflage\w*|bescheid\w*|behörde\w*|lärm\w*|immission\w*|zoning|bebauungsplan)\b/gi,
  grid: /\b(?:grid|connection|substation|sub-?sta\w+|umspannwerk\w*|netz\w*|operator\w*|dso|tso|energi[sz]ation|e1|e8|n-1|short-circuit|reinforcement|protection|schutzkonzept|voltage|spannung|feeder|busbar|anschluss\w*|tennet|amprion|50hertz|transnetbw|westnetz|kv)\b/gi,
  proc: /\b(?:suppl\w*|candidate\w*|bidder\w*|tender\w*|kandidat\w*|bieter\w*|anbieter\w*|quote\w*|offer\w*|price\w*|pricing|cost\w*|order\w*|deliver\w*|shipping|lead-?time|slot|containers?|cells?|pcs|inverter\w*|invoice\w*|angebot\w*|preis\w*|bestell\w*|lieferung\w*|lieferzeit\w*|kosten)\b/gi,
  contr: /\b(?:contract\w*|agreement\w*|epc|supplier\w*|vendor\w*|manufacturer\w*|signed|signature\w*|long-?stop|penalt\w+|liquidated|vertrag\w*|lieferant\w*|hersteller\w*|unterschrift\w*|unterzeichn\w*)\b/gi,
  fin: /\b(?:financ\w+|loan\w*|lender\w*|bank\w*|equity|debt|term-?sheet|funding|investor\w*|irr|darlehen\w*|kredit\w*|finanzier\w*|förder\w*|subsid\w*)\b/gi,
  cons: /\b(?:construction|build|building|civil|foundation\w*|commissioning|cod|go-?live|schedule\w*|milestone\w*|fat|sat|installation|baubeginn|bau\w*|inbetrieb\w*|zeitplan\w*|termin\w*|groundbreaking|spatenstich)\b/gi,
  ops: /\b(?:operation\w*|operating|maintenance|service\w*|availability|warrant\w+|monitoring|performance|degradation|wartung\w*|betrieb\w*|garantie\w*)\b/gi,
  site: /\b(?:site|plot|parcel\w*|land|landowner\w*|land rights|lease\w*|address|street|location|located|flurst\w*|pacht\w*|grundst\w*|standort\w*|gemeinde|municipal\w*|adresse)\b/gi,
  ov: /\b(?:capacity|mwh?|battery|batteries|lfp|technology|duration|kapazität|leistung|speicher\w*|technologie|megawatt\w*)\b/gi };
const TOPIC_ORDER = ['perm', 'grid', 'proc', 'contr', 'fin', 'cons', 'ops', 'site', 'ov'];
function topicOf(s) { let best = null, bs = 0; for (const t of TOPIC_ORDER) { const m = s.match(TOPIC[t]), n = m ? new Set(m.map(x => x.toLowerCase())).size : 0; if (n > bs) { bs = n; best = t; } } return best || learnedTopic(s); }
const OKW = /\b(?:granted|approved|signed|executed|secured|confirmed|received|completed|finished|issued|erteilt|unterzeichnet|bestätigt|zugesagt|abgeschlossen|liegt vor|done)\b/i;
const OPENW = /\b(?:pending|awaiting|submitted|applied|in review|under review|negotiat\w*|draft|expected|planned|requested|outstanding|delayed|postponed|beantragt|eingereicht|ausstehend|verzögert|verschoben|geplant|erwartet|in prüfung|in arbeit)\b|not (?:yet )?(?:granted|signed|approved|received|confirmed)|noch nicht/i;
const STAT2 = { perm: ['permit_status', 'Granted', 'Pending'], grid: ['grid_status', 'Confirmed', 'In progress'], contr: ['contract_status', 'Signed', 'In progress'], fin: ['fin_status', 'Secured / committed', 'In progress'] };
/* "Label: value" lines, e.g. "Netzbetreiber: Westnetz" or "Capacity: 20 MW" */
const LABELS = [[/^(?:capacity|leistung|nennleistung|power|size|installed (?:power|capacity))$/i, 'mw', 'unit'], [/^(?:storage(?: capacity)?|energy(?: capacity)?|speicher(?:kapazität)?|kapazität)$/i, 'mwh', 'unit'], [/^(?:voltage|spannung|connection voltage|netzspannung)$/i, 'kv', 'unit'], [/^(?:technology|technologie|battery type|chemistry)$/i, 'tech', 'text'],
  [/^(?:street|straße|strasse|address|adresse|site address|standort|location)$/i, 'addr', 'addr'], [/^(?:city|stadt|ort|municipality|gemeinde)$/i, 'city', 'ent'], [/^(?:postal code|plz|zip(?: code)?|postleitzahl)$/i, 'postal', 'ent'], [/^(?:state|bundesland|federal state)$/i, 'state', 'ent'],
  [/^(?:grid operator|network operator|operator|netzbetreiber|dso|tso|verteilnetzbetreiber)$/i, 'operator', 'ent'], [/^(?:connection point|substation|umspannwerk|anschlusspunkt|nvp|netzverknüpfungspunkt|point of connection)$/i, 'connpoint', 'ent'],
  [/^(?:supplier|lieferant|hersteller|manufacturer|vendor)$/i, 'supplier', 'ent'], [/^(?:epc|epc contractor|general contractor|generalunternehmer)$/i, 'epc', 'ent'], [/^(?:lender|bank|kreditgeber)$/i, 'lender', 'ent'], [/^(?:authority|permitting authority|behörde|genehmigungsbehörde)$/i, 'permit_auth', 'ent'],
  [/^(?:permit number|aktenzeichen|az|permit reference|file number)$/i, 'permit_ref', 'ent'], [/^(?:permit(?: status)?|genehmigung(?:sstatus)?|baugenehmigung)$/i, 'permit_status', 'status'], [/^(?:contract(?: status)?|vertrag(?:sstatus)?)$/i, 'contract_status', 'status'], [/^(?:financing(?: status)?|finanzierung)$/i, 'fin_status', 'status'], [/^(?:connection agreement|netzanschlussvertrag|grid connection status)$/i, 'grid_status', 'status'],
  [/^(?:cod|target cod|commercial operation(?: date)?|inbetriebnahme|go-?live)$/i, 'cod', 'date'], [/^(?:energi[sz]ation(?: date)?|spannungsaufschaltung)$/i, 'energisation', 'date'], [/^(?:grid connection(?: date)?|connection date|netzanschluss(?:datum|termin)?)$/i, 'grid_date', 'date'], [/^(?:construction start|start of construction|baubeginn|spatenstich)$/i, 'con_start', 'date'], [/^(?:commissioning|inbetriebsetzung)$/i, 'commissioning', 'date'],
  [/^(?:long-?stop(?: date)?)$/i, 'longstop', 'date'], [/^(?:valid until|gültig bis|quote valid until)$/i, 'quote_valid', 'date'], [/^(?:quote|offer|angebot|quote reference)$/i, 'quote', 'ent'], [/^(?:price|preis|kosten|cost|total price)$/i, 'price', 'amt'], [/^(?:delivery|lieferung|lieferzeit|delivery time|lead time)$/i, 'delivery', 'text'],
  [/^(?:warranty|garantie|maintenance|wartung)$/i, 'warranty', 'text'], [/^(?:lease|pacht|land rights)$/i, 'lease', 'text'], [/^(?:parcel|flurstück)$/i, 'parcel', 'text'], [/^(?:contact|ansprechpartner)$/i, 'contact', 'ent']];
function labelPair(s0, add) {
  const lp = s0.match(/^\s*(?:[-•*]\s*)?([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß \/().-]{1,44}):\s*(.{1,200})$/); if (!lp || /^(?:subject|from|von|date|to|cc|betreff|an|re|aw|gesendet)$/i.test(lp[1].trim())) return false;
  const L = LABELS.find(x => x[0].test(lp[1].trim())); if (!L) return false;
  const val = lp[2].trim().replace(/[.;]+$/, ''), [, key, type] = L; let m;
  if (type === 'unit') { if ((m = val.match(/(\d{1,4}(?:[.,]\d+)?)\s*(MWh|MW|kV)/i))) { const u = m[2].toLowerCase(), k = u === 'mwh' ? 'mwh' : u === 'kv' ? 'kv' : 'mw', n = parseFloat(m[1].replace(',', '.')); add(k, n + ' ' + (k === 'kv' ? 'kV' : k === 'mwh' ? 'MWh' : 'MW'), { num: n, w: 3 }); return true; } return false; }
  if (type === 'addr') { const st = val.match(STREET_RX), po = val.match(POSTAL_RX); if (st) add('street', st[1].trim() + ' ' + st[2].replace(/\s+/g, ''), { w: 4 }); if (po) { add('postal', po[1], { w: 4 }); add('city', po[2], { w: 7 }); } if (!st && !po) add('city', snip(val, 60), { w: 2 }); return true; }
  if (type === 'date') { const d = dates(val)[0]; if (d) { add(key, d, { w: 3 }); return true; } return false; }
  if (type === 'status') { const ok = OKW.test(val) && !NEGST.test(val); add(key, snip(val, 60), { rk: ok ? 3 : 1, st: ok ? 'ok' : 'open', w: 3 }); return true; }
  if (type === 'amt') { const a = val.match(AMT_RX); if (a) { add(key, a[0].trim(), { w: 3 }); return true; } return false; }
  add(key, snip(val, type === 'text' ? 170 : 80), { w: 3 }); return true;
}
/* entity BEFORE the role: "Westnetz is the grid operator", "CellForm will supply the batteries" */
const ENTB = '((?:[A-ZÄÖÜ][\\wÄÖÜäöüß&\\-]*)(?:\\s+[A-ZÄÖÜ0-9][\\wÄÖÜäöüß&\\-]*){0,2})';
function slotBefore(s, roleSrc, verbs) {
  const rx = verbs ? new RegExp('\\s+(?:will\\s+|is going to\\s+|wird\\s+|shall\\s+)?(?:' + roleSrc + ')\\b', 'i') : new RegExp('\\s+(?:is|are|will be|was|ist|wird|sind)\\s+(?:now\\s+|also\\s+|going to be\\s+)?(?:the|our|der|die|das|unser\\w*|a|ein\\w*)?\\s*(?:' + roleSrc + ')\\b', 'i');
  const m = rx.exec(s); if (!m) return null;
  const e = /((?:[A-ZÄÖÜ][\wÄÖÜäöüß&\-]*)(?:\s+[A-ZÄÖÜ0-9][\wÄÖÜäöüß&\-]*){0,2})\s*$/.exec(s.slice(0, m.index)); if (!e) return null;
  const w = e[1].split(/\s+/)[0].toLowerCase();
  return STOPW.has(w) || /^(?:it|this|that|they|we|he|she|who|es|dies|sie|wir)$/.test(w) || NOTENT.has(w) ? null : e[1];
}



/* ---------- tolerance for typos, learned vocabulary, short task titles ---------- */
const VOCAB = 'supplier manufacturer connection substation operator financing contract contractor delivery candidates candidate shortlist quotation approval application agreement commissioning construction battery authority lieferant hersteller genehmigung netzanschluss umspannwerk netzbetreiber finanzierung lieferung baugenehmigung kandidaten anbieter angebot vertrag speicher inbetriebnahme'.split(' ');
const VOCAB_OK = new Set('contact contacts content compact connect connected connects deliver delivers delivered delivering operate operates operated operating operation operational approved approver approvals supplied supplies supplying manufactured manufacturing financed finances finance financial contracted contracts contracting commissioned constructed constructing construct batteries applied applying applies agreed agree agrees authorities authorise authorize quotations battery candidate shortlisted'.split(' '));
function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  } return d[a.length][b.length];
}
const TYPO_MEMO = {};
function fixWord(w) {
  if (w in TYPO_MEMO) return TYPO_MEMO[w];
  let r = w; const max = w.length >= 10 ? 2 : 1;
  if (!VOCAB_OK.has(w) && !VOCAB.some(v => w === v || w.startsWith(v))) {
    let best = null, bd = 9, tie = false;
    for (const v of VOCAB) { if (Math.abs(v.length - w.length) > max) continue; const d = osa(w, v); if (d <= max) { if (d < bd) { bd = d; best = v; tie = false; } else if (d === bd) tie = true; } }
    if (best && !tie) r = best;
  } return (TYPO_MEMO[w] = r);
}
const fixTypos = s => s.replace(/(?<![\wÄÖÜäöüß])[a-zäöüß]{6,}(?![\wÄÖÜäöüß])/g, fixWord);

function learnedTopic(s) {
  const K = typeof S !== 'undefined' && S && S.learn && S.learn.kw; if (!K) return null;
  const sc = {}; (s.toLowerCase().match(/[a-zäöüß]{5,}/g) || []).forEach(w => { const e = Object.prototype.hasOwnProperty.call(K, w) ? K[w] : null; if (e) sc[e.sec] = (sc[e.sec] || 0) + e.n; });
  let b = null, n = 0; for (const k in sc) if (sc[k] > n) { n = sc[k]; b = k; } return n >= 2 ? b : null;
}
function learnedEntities(s) {
  const L = typeof S !== 'undefined' && S && S.learn && S.learn.ent; if (!L) return [];
  const fam = {};
  for (const [nm, e] of Object.entries(L)) if (nm.length >= 3 && new RegExp('(?<![\\wÄÖÜäöüß])' + reEsc(nm) + '(?![\\wÄÖÜäöüß])', 'i').test(s)) (fam[e.k] = fam[e.k] || []).push(e.d || nm);
  return Object.entries(fam);
}
/* "one is voltfang and the other is eco stor", "between X and Y": names written without capital letters */
function lowerNames(s) {
  const cut = t => t.split(/\s+(?:for|as|regarding|on|from|to|in|because|since|but|so|which|that)\b/i)[0].trim().replace(/^(?:the|der|die|das)\s+/i, '');
  const cap = t => t.split(/\s+/).slice(0, 3).map(w => w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  let m = /\bone is ([^.,;]+?)(?:\s+and|,|;)\s+(?:the )?other(?: one)?(?: is)?\s+([^.,;]+)/i.exec(s) || /\b(?:between|compare|comparing|compared|versus|vs\.?|zwischen|vergleich\w*)\s+([^.,;]+?)\s+(?:and|und|or|oder|vs\.?|versus)\s+([^.,;]+)/i.exec(s);
  if (!m) return [];
  return [m[1], m[2]].map(cut).filter(t => t.length >= 3 && t.split(/\s+/).length <= 4 && !/^(?:it|this|that|they|we|them|each other)$/i.test(t)).map(cap);
}
function subjectName(s) {
  const m = /^\s*(?:(?:hi|hello|hallo|hey|dear)\b[^,]{0,30},\s*)?(?:(?:in|for|at|regarding|about|re|zu|für|bei)\s+[\wÄÖÜäöüß]+[,:]?\s+|[\wÄÖÜäöüß ]{1,25}:\s*)?([A-Za-zÄÖÜäöü][\wÄÖÜäöüß&\-]*(?:\s+[\wÄÖÜäöüß&\-]+){0,2}?)\s+(?:just|also|now|has|have|had|will|would|can|could|said|says|informed|told|confirmed|sent|wrote|offered|offers|proposed|submitted|is|are|was|wants?|möchte|kann|hat|teilt|bietet|informiert)\b/.exec(s);
  if (!m) return [];
  const w = m[1].trim(); if (w.length < 3 || ENT_SKIP.has(w.toLowerCase()) || STOPW.has(w.toLowerCase()) || NOTENT.has(w.toLowerCase()) || /^(?:they|them|he|she|it|we|you|this|that|there|here|who|which|our|your|their|his|her|its|the|a|an|one|some|all|both|each|everyone|nobody|someone|das|die|der|es|sie|wir|man|jemand)(?:\s|$)/i.test(w)) return [];
  return [w.split(/\s+/).map(x => x === x.toLowerCase() ? x[0].toUpperCase() + x.slice(1) : x).join(' ')];
}
function shortTask(s0, names) {
  let t = s0.replace(/\s+/g, ' ').trim().replace(/[.!…]+$/, '');
  const URG = /[,;]?\s*\b(?:as soon as possible|asap|urgent(?:ly)?|immediately|right away|dringend|sofort|so schnell wie möglich|umgehend)\b/ig, urgent = URG.test(t);
  t = t.replace(URG, '').trim();
  const LEAD = /^(?:(?:hi|hello|dear|hallo|hey)\b[^,]{0,30},\s*|(?:and|so|also|now|but|und|aber)\s+|(?:we|you|i|wir|ihr)\s+(?:(?:really|also|still|now|only|dringend)\s+)?(?:need|have|has|must|should|want|would like|require|müssen|sollten|brauchen|benötigen)(?:\s+to)?\s+|(?:could|can|would|könnt|könnten|kannst|könntest)\s+(?:you|ihr)(?:\s+please)?\s+|(?:please|pls|kindly|bitte)\b,?\s*|let'?s\s+)/i;
  for (let i = 0; i < 3 && LEAD.test(t); i++) t = t.replace(LEAD, '');
  if (names && names.length) {
    const de = /\b(?:die|der|das|wir|ihre|deren|bitte|angebote?)\b/i.test(t), list = names.length > 1 ? names.slice(0, -1).join(', ') + (de ? ' und ' : ' and ') + names[names.length - 1] : names[0];
    const before = t;
    t = t.replace(/\b(?:their|there|the|these|those)\s+(offers?|quotes?|bids?|proposals?|quotations?)\b/i, (m, w) => 'the ' + w + ' from ' + list).replace(/\b(?:ihre|deren|die)\s+(Angebote?|Offerten?)\b/, (m, w) => 'die ' + w + ' von ' + list);
    if (t !== before) t = t.replace(/\s+(?:regarding|concerning|about|bezüglich|zu)\s+(?:the|die|den)\s+\w+(?:\s+\w+)?$/i, '');
  }
  t = t.trim(); if (t.length < 6 || t.split(/\s+/).length < 3) t = s0.trim().replace(/[.!…]+$/, '');
  t = t[0].toUpperCase() + t.slice(1); return snip(t, 140) + (urgent ? ' – urgent' : '');
}
let CTXNAMES = [];

const ENT_SKIP = new Set('dear team hello hi best regards thanks thank good morning afternoon have nice day great we you they it this that there here one two three bess all everyone mr mrs ms dr sehr geehrte liebe hallo viele grüße gruß kandidat kandidaten lieferung lieferant lieferanten hersteller anbieter bieter angebot angebote speicher batterie zusammen shortlist shortlists candidates candidate bidders tender offers offer quote quotes the other'.split(' '));
const isMonth = w => Object.prototype.hasOwnProperty.call(MI, w);
function entities(s) {
  const out = []; for (const m of s.matchAll(/\b[A-ZÄÖÜ][\wÄÖÜäöüß&\-]*(?:\s+[A-ZÄÖÜ][\wÄÖÜäöüß&\-]*){0,2}\b/g)) {
    if (/\b(?:die|der|das|des|den|dem|ein|eine|einen|einer|eines|zwei|drei|vier|beide|alle|unsere|unser|ihre|ihr|diese|dieser|dieses)\s+$/i.test(s.slice(Math.max(0, m.index - 14), m.index))) continue;
    let e = m[0].trim(); const w = e.split(/\s+/); while (w.length && (ENT_SKIP.has(w[0].toLowerCase()) || STOPW.has(w[0].toLowerCase()) || isMonth(w[0].toLowerCase()))) w.shift(); e = w.join(' ');
    if (e.length < 3 || NOTENT.has(e.toLowerCase()) || ENT_SKIP.has(e.toLowerCase()) || GAZ[e] || /^(?:Q[1-4]|MW|MWh|kV|EPC|PCS|COD)$/.test(e) || /^\d/.test(e)) continue; if (!out.includes(e)) out.push(e);
  } return out;
}

function extractSentence(s0, cur, ctxTp, ctxCand, force) {
  let s = s0; if (cur && cur.name) { cur._strip = cur._strip || new RegExp('\\b' + reEsc(cur.name) + '\\b', 'gi'); s = s0.replace(cur._strip, ' ').replace(/\s+/g, ' '); }
  s = fixTypos(s);
  const out = [], add = (k, v, o) => out.push({ k, v: String(v).trim(), w: 0, rk: 0, ...(o || {}) });
  let m;
  const own = force || topicOf(s), labelled = labelPair(s0, add);
  if (labelled) { out.own = own; return out; }
  /* technical */
  for (m of s.matchAll(/(\d{1,4}(?:[.,]\d+)?)\s*(MWh|MW|Megawattstunden|Megawatt)\b/gi)) { const wh = /^MWh|stunden/i.test(m[2]), n = parseFloat(m[1].replace(',', '.')); add(wh ? 'mwh' : 'mw', n + (wh ? ' MWh' : ' MW'), { num: n, w: (CAP.test(s) ? 2 : 0) - (TMP.test(s) ? 3 : 0) }); }
  if ((m = s.match(/(\d{2,3})\s*-?\s*kV\b/i))) add('kv', m[1] + ' kV', { num: +m[1], w: GRIDW.test(s) ? 2 : 0 });
  for (const [rx, name] of TECH) if (rx.test(s)) { add('tech', name); break; }
  if ((m = s.match(/\b(\d{1,3})\s+(?:battery\s+|storage\s+|BESS\s+)?(containers?|Batteriecontainer|Speichercontainer|Container)\b/i))) add('units', m[1] + ' containers', { num: +m[1] });
  /* address */
  if ((m = s.match(STREET_RX))) add('street', m[1].trim() + ' ' + m[2].replace(/\s+/g, ''), { w: 3 });
  if ((m = s.match(POSTAL_RX)) && +m[1] >= 1067 && !NOTCITY.has(m[2].split(' ')[0]) && !NAME_STOP.has(m[2])) { add('postal', m[1], { w: 3 }); add('city', m[2], { w: 6 }); }
  if ((m = s.match(/(?:[Gg]emeinde|[Ss]tadt|municipality of|town of|city of)\s+([A-ZÄÖÜ][\wäöüß\-]+)/)) && !NAME_STOP.has(m[1])) add('city', m[1], { w: 4 });
  GAZ_P.forEach(([k, rx, prep]) => { if (!rx.test(s)) return; if (GAZ[k][2]) add('state', k, { w: LOC.test(s) ? 2 : 1 }); else if (LOC.test(s) || prep.test(s)) add('city', k, { w: LOC.test(s) ? 3 : 1 }); });
  if ((m = s.match(/\b(?:Flurst(?:ück)?\.?|parcel|plot)\s*(?:no\.?|nr\.?|number)?\s*(\d+(?:\/\d+)?)/i))) { const g = s.match(/Gemarkung\s+([A-ZÄÖÜ][\wäöüß\-]+)/); add('parcel', (g ? 'Gemarkung ' + g[1] + ', ' : '') + 'Flurstück ' + m[1]); }
  if (/\blease\b|pacht|nutzungsvertrag|land rights|dienstbarkeit/i.test(s)) add('lease', snip(s0, 180));
  /* permits */
  if (/permit|genehmigung|bimschg|bescheid|baugenehmigung/i.test(s)) {
    if (/(granted|approved|issued|received|erteilt|liegt vor)/i.test(s) && !NEGST.test(s)) add('permit_status', 'Granted', { rk: 3, st: 'ok' });
    else if (/(application|applied|submitted|filed|beantragt|eingereicht)/i.test(s) && !/condition|noise|revised/i.test(s)) add('permit_status', 'Applied for', { rk: 2, st: 'open' });
    else if (/pending|awaiting|in review|ausstehend/i.test(s)) add('permit_status', 'Pending', { rk: 1, st: 'open' });
    if ((m = s.match(/(?:Aktenzeichen|\bAz\.?|file (?:no\.?|number|reference)|reference(?: number)?|permit (?:no\.?|number))\s*[:#]?\s*([A-Z0-9][\w\/.\-]*\d[\w\/.\-]*)/i)) && m[1].length > 3) add('permit_ref', m[1].replace(/[.,]$/, ''));
    if (/(granted|issued|erteilt|dated|vom|approved)/i.test(s) && !NEG.test(s)) { const d = dates(s)[0]; if (d) add('permit_date', d); }
  }
  if ((m = s.match(/\b((?:Landesamt|Landkreis|Kreis|Landratsamt|Bauamt|Regierungspräsidium|Bezirksregierung|Umweltamt|Bauaufsicht)(?:\s+(?:für|der|des))?\s+[A-ZÄÖÜ][\wäöüß\-]+(?:\s+[A-ZÄÖÜ][\wäöüß\-]+)?)/))) add('permit_auth', m[1]);
  if ((/permit|genehmigung|condition|auflage/i.test(s)) && /condition\s*\d+|auflage|noise|sound|lärm|emission|annex\s*\d|subject to/i.test(s)) add('permit_cond', snip(s0, 200));
  /* grid */
  OPS_RX.forEach(([k, rx]) => { if (rx.test(s)) add('operator', k, { w: 1 }); });
  { const sub = slotAfter(s, SUBST), gen = sub ? null : slotAfter(s, /\b(?:grid )?connection point\b|\bpoint of connection\b|netzverknüpfungspunkt|\bNVP\b|anschlusspunkt/i, { cap: true });
    if (sub) add('connpoint', (/^sub/i.test(sub.cue) ? 'Substation ' : /^umspann/i.test(sub.cue) ? 'Umspannwerk ' : 'UW ') + sub.v, { w: 2 });
    else if (gen) add('connpoint', gen.v, { w: 1 }); }
  { const o = slotAfter(s, /\b(?:grid|network|distribution(?: system)?|transmission(?: system)?) operator\b|\b(?:DSO|TSO)\b|netzbetreiber|verteilnetzbetreiber|übertragungsnetzbetreiber/i, { cap: true }); if (o) add('operator', o.v, { w: 2 }); }
  { const o = slotAfter(s, /\b(?:supplier|manufacturer|vendor|lieferant|hersteller|supplied by|delivered by|bought from|ordered from)\b/i, { cap: true }); if (o) add('supplier', o.v, { w: 1 }); }
  { const o = /\b(?:shortlist\w*|candidates?|bidders?|kandidat\w*|bieter\w*)\b/i.test(s) ? null : slotAfter(s, /\b(?:EPC(?: contractor)?|general contractor|generalunternehmer|bauunternehmen)\b/i, { cap: true }); if (o) add('epc', o.v, { w: 1 }); }
  { const o = slotAfter(s, /\b(?:lender|financed by|kreditgeber|darlehensgeber)\b/i, { cap: true }); if (o) add('lender', o.v, { w: 1 }); }
  { const o = slotAfter(s, /\b(?:permitting authority|permit authority|approval authority|genehmigungsbehörde|zuständige behörde)\b/i, { cap: true }); if (o) add('permit_auth', o.v, { w: 1 }); }
  { const o = slotAfter(s, /\b(?:located|situated) (?:in|at)\b|\b(?:project|site|plant) (?:is )?(?:in|near|at)\b|\bstandort(?: ist)?\b|\bin der stadt\b/i, { max: 2, low: false }); if (o) { const g = GAZ_L[o.v.toLowerCase()]; if (g ? !GAZ[g][2] : o.cue && /^[A-ZÄÖÜ]/.test(o.v) && !o.v.includes(' ')) add('city', g || o.v, { w: 3 }); } }
  if (!out.some(x => x.k === 'street') && (m = s.match(/\b([a-zäöüß]{3,}(?:straße|strasse|str\.|weg|allee|platz))\s+(\d{1,4}\s?[a-z]?)\b(?!\s*(?:MW|kV|%|€))/i))) add('street', m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[2].replace(/\s+/g, ''), { w: 2 });
  if (!out.some(x => x.k === 'postal') && (m = s.match(/\b(\d{5})\s+([a-zäöüß][\wäöüß\-]+)/i)) && GAZ_L[m[2].toLowerCase()] && +m[1] >= 1067) { add('postal', m[1], { w: 3 }); add('city', GAZ_L[m[2].toLowerCase()], { w: 6 }); }
  if (/connection|netzanschluss/i.test(s) && !/supplier|lease|pacht/i.test(s)) {
    if (/(connection|netzanschluss)[^.]{0,60}(signed|executed|concluded|granted|confirmed|unterzeichnet|zusage)|signed[^.]{0,40}connection/i.test(s) && !NEGST.test(s)) add('grid_status', 'Signed / confirmed', { rk: 3, st: 'ok' });
    else if (/expect|erwart/i.test(s) && /agreement|vertrag/i.test(s)) add('grid_status', 'Agreement expected', { rk: 2, st: 'open' });
    else if (/application|applied|requested|network study|\bE1\b|\bE8\b|submitted|beantragt|study|assessment|awaiting|pending/i.test(s)) add('grid_status', 'Application / study in progress', { rk: 1, st: 'open' });
  }
  if (/constraint|\bN-1\b|overload|congestion|bottleneck|engpass|network study|netzverträglichkeit|short-circuit|reinforcement|verstärkung|protection concept|schutzkonzept/i.test(s)) add('grid_note', snip(s0, 200));
  { const b = (src, k, f, o) => { const v = slotBefore(s, src, o); if (v && !out.some(x => x.k === k && x.v === v)) add(k, f ? f(v) : v, { w: 2 }); };
    b('sub-?sta\\w{1,3}on|umspannwerk|connection point|grid connection point', 'connpoint', v => 'Substation ' + v); b('grid operator|network operator|dso|tso|netzbetreiber', 'operator'); b('supplier|manufacturer|vendor|lieferant|hersteller', 'supplier'); b('epc(?: contractor)?|general contractor|generalunternehmer', 'epc'); b('lender|bank|financing partner|kreditgeber', 'lender'); b('permitting authority|permit authority|authority|behörde', 'permit_auth');
    b('supply|deliver|provide|manufacture|liefert|liefern|stellt', 'supplier', null, true); b('build|construct|install|baut|errichtet', 'epc', null, true); b('finance|fund|finanziert', 'lender', null, true); }
  if (own === 'perm' || ctxTp === 'perm') { const o = slotAfter(s, /\b(?:granted|issued|approved|erteilt) by\b/i, { cap: true }); if (o) add('permit_auth', o.v, { w: 1 }); }
  /* dates */
  if (!NEG.test(s) && !REQ.test(s)) s.split(/,|;|\bwith\b|\bwhile\b|\bwhereas\b/).forEach(c => { const ds = dates(c); if (!ds.length) return; const role = dateRole(c) || dateRole(s); if (role) add(ROLEK[role], ds[0]); });
  if (/commissioning|inbetriebsetzung|\bSAT\b|\bFAT\b/i.test(s) && !/\bCOD\b|commissioning date/i.test(s) && !NEG.test(s) && !REQ.test(s)) { const c = s.split(/,|;|\bwith\b|\bwhile\b/).find(c => /commissioning|inbetriebsetzung|\bSAT\b|\bFAT\b/i.test(c) && dates(c).length); if (c) add('commissioning', dates(c)[0]); }
  /* parties, contracts, quotes */
  const orgs = [...s.matchAll(ORG2)].map(x => x[1]).filter(o => !/^(?:The|Our|This|Your|Dear|Best|Kind)\b/.test(o)), orgsDone = new Set();
  orgs.forEach(o => {
    add('org', o);
    if (/lender|\bbank\b|\bloans?\b|darlehen|investor/i.test(s)) add('lender', o);
    else if (isOp(o) || (/grid operator|netzbetreiber/i.test(s) && /(?:Netz|Netze|Grid)$/i.test(o))) add('operator', o);
    else if (/\bEPC\b|general contractor|generalunternehmer|contractor|bauunternehmen/i.test(s)) add('epc', o);
    else if (/supplier|manufactur|quote|offer|angebot|lieferant|hersteller|delivered by|supplied by/i.test(s)) add('supplier', o);
  });
  if (/contract|agreement|vertrag|\bEPC\b|purchase order/i.test(s) && !/connection|netzanschluss|lease|pacht/i.test(s)) {
    if (/(contract|agreement|vertrag)[^.]{0,50}(signed|executed|concluded|unterzeichnet)|signed (contract|agreement)/i.test(s) && !NEGST.test(s)) add('contract_status', 'Signed', { rk: 3, st: 'ok' });
    else if (/draft|entwurf|negotiat|verhandl/i.test(s)) add('contract_status', 'Draft / in negotiation', { rk: 2, st: 'open' });
  }
  if (/quote|offer|angebot/i.test(s) && !/connection|netzanschluss/i.test(s)) add('contract_status', 'Quote received', { rk: 1, st: 'open' });
  if (/long-?stop/i.test(s)) { const d = dates(s)[0]; if (d) add('longstop', d); }
  if ((m = s.match(/\b(?:quote|offer|angebot|order|PO)\s*(?:no\.?|number|nr\.?|ref\.?)?\s*#?\s*([A-Z]{1,5}-\d{2,}[\w-]*)/))) { const r = s.match(/\brev(?:ision|\.)?\s?(\d+)/i); add('quote', m[1] + (r ? ' rev. ' + r[1] : '')); }
  if (/quote|price|cost|preis|angebot|budget|capex|invoice|order value|kaufpreis|offer/i.test(s) && !/financ|loan|lender|darlehen/i.test(s)) {
    const a = s.match(AMT_RX); if (a) add('price', a[0].trim());
    const pc = s.match(/([+\-−]\s?\d+(?:[.,]\d+)?\s?%)/) || s.match(/(?:increase|rise|higher|erhöhung|steigerung)[^.%]{0,20}?(\d+(?:[.,]\d+)?)\s?%/i);
    if (pc) add('price_chg', pc[1].includes('%') ? pc[1].replace('−', '-') : '+' + pc[1] + '%');
  }
  if (/deliver|lieferzeit|lieferung|lead time|shipping|\bslot\b/i.test(s) && (/\d+\s*(?:week|month|day|woche|monat|tag)/i.test(s) || dates(s).length)) add('delivery', snip((s0.split(/[,;:]/).find(c => /deliver|lieferzeit|lieferung|lead time|shipping|\bslot\b/i.test(c) && /\d/.test(c)) || s0).trim(), 170));
  const vi = s.search(/valid (?:until|through|till)|gültig bis/i); if (vi >= 0) { const d = dates(s.slice(vi))[0]; if (d) add('quote_valid', d); }
  /* financing */
  if (/financing|financed|finanzier|term sheet|\bloans?\b|darlehen|equity|lender|kredit/i.test(s)) {
    if (/(closed|secured|committed|signed|zugesagt)/i.test(s) && !NEGST.test(s)) add('fin_status', 'Secured / committed', { rk: 3, st: 'ok' });
    else add('fin_status', 'In progress', { rk: 1, st: 'open' });
    const a = s.match(AMT_RX); if (a) add('fin_amount', a[0].trim());
  }
  /* operation, contacts, requests */
  if (/warrant|garantie|gewährleistung|availability guarantee|maintenance|wartung|service agreement/i.test(s)) add('warranty', snip(s0, 180));
  for (const e of s.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) add('contact', e[0]);
  if (REQ.test(s)) add('request', shortTask(s0, CTXNAMES), { sent: s0 });
  /* candidates and decisions: "there are 2 candidates for the supply ... one is Voltfang and the other is ECO Stor" */
  { let ck = null;
    const candW = /\b(?:candidates?|bidders?|shortlist\w*|options?|alternatives?|tenders?|compar\w+|evaluat\w+|vergleich\w*|kandidat\w*|bieter\w*|anbieter\w*|zur auswahl)\b/i.test(s), g0c = s0.replace(/^(?:hi|hello|hallo|hey|dear|good (?:morning|afternoon))\b[^,]{0,30},\s*/i, '');
    if (candW) ck = /\bEPC\b|contractor|generalunternehmer|construction|bauunternehmen/i.test(s) ? 'epc_cand' : /suppl|vendor|manufactur|battery|batteries|bess|system|lieferung|lieferant|hersteller|speicher/i.test(s) ? 'supplier_cand' : null;
    else if ((/\b(?:bid|bids|bidding|interested|interest|wants?|wanted|apply|applied|participate|propos\w+|available|bewerben|interessiert|möchte)\b/i.test(s) || (/\b(?:can|could|will|would|able|kann|könnte)\b/i.test(s) && /\b(?:also|alternatively|as well|too|instead|ebenfalls|auch|alternativ|informed|told|said|confirmed|let us know|teilt mit|informiert)\b/i.test(s))) && !/\b(?:signed|executed|price|quote|invoice|awarded)\b|€|\bEUR\b/i.test(s)) ck = /\bEPC\b|general contractor|generalunternehmer|bauunternehmen/i.test(s) ? 'epc_cand' : /\bsuppl\w*|manufactur\w*|lieferant\w*|hersteller/i.test(s) ? 'supplier_cand' : null;
    const listy = /^\s*(?:one|the other|another|first|second|either|both|eine[rs]?|der andere)\b|\bone is\b|\bthe other\b|\bbetween\b|\b(?:and|or|und|oder)\b/i.test(s);
    const kk = ck || (ctxCand && listy ? ctxCand : null);
    if (kk) { let es = entities(s).filter(e => !orgsDone.has(e) && !(cur && cur.name && cur.name.toLowerCase().includes(e.toLowerCase()))); if (!es.length) es = lowerNames(s); if (!es.length && ck) es = subjectName(g0c).filter(e => !(cur && cur.name && cur.name.toLowerCase().includes(e.toLowerCase()))); if (es.length >= (ck ? 1 : 2)) es.forEach(e => add(kk, e, { w: 1 })); else if (ck && s0.split(/\s+/).length >= 5) add('nt_contr', snip(g0c, 220), { sent: g0c }); if (ck) out.cand = ck; else if (kk) out.cand = kk; }
    const dec = /\b(?:chose|chosen|selected|awarded|decided on|decision for|went with|entschieden|gewählt|vergeben an|zuschlag)\b/i.exec(s);
    if (dec && /suppl|vendor|manufactur|battery|bess|lieferung|lieferant|hersteller/i.test(s)) { const e = entities(s.slice(dec.index + dec[0].length))[0]; if (e) add('supplier', e, { w: 3 }); } }
  learnedEntities(s).forEach(([k, arr]) => { const kk = arr.length > 1 && CATK[k + '_cand'] ? k + '_cand' : k; arr.forEach(nm => { if (!out.some(x => x.k.startsWith(k) && x.v.toLowerCase() === nm.toLowerCase())) add(kk, nm, { w: 2 }); }); });
  /* topic-based fallbacks: the sentence is about a known topic, so read what that topic needs */
  const cont = /^(?:it|this|that|they|these|those|its|their|one|the other|another|both|each|es|das|dies|sie|er|eine[rs]?)\b/i.test(s0.trim()), tp = own || (cont || dates(s).length || AMT_RX.test(s) ? ctxTp : null), has = k => out.some(x => x.k === k);
  if (tp && !REQ.test(s) && !labelled) {
    if (STAT2[tp] && !has(STAT2[tp][0])) { const [k, okL, opL] = STAT2[tp]; if (OKW.test(s) && !NEGST.test(s) && !OPENW.test(s)) add(k, okL, { rk: 3, st: 'ok' }); else if (OPENW.test(s)) add(k, opL, { rk: 1, st: 'open' }); }
    if (!NEG.test(s) && !out.some(x => KEYDATE.has(x.k)) && dates(s).length) { const d = dates(s)[0];
      if (tp === 'grid') add('grid_date', d); else if (tp === 'cons') add(/start|begin|baubeginn|spatenstich/i.test(s) ? 'con_start' : /commission|inbetrieb|test/i.test(s) ? 'commissioning' : 'cod', d); else if (tp === 'perm' && OKW.test(s)) add('permit_date', d); }
    if (!has('price') && !has('fin_amount') && (m = s.match(AMT_RX))) { if (tp === 'proc' || tp === 'contr') add('price', m[0].trim()); else if (tp === 'fin') add('fin_amount', m[0].trim()); }
    if (tp === 'proc' && !has('delivery') && /\d+\s*(?:weeks?|months?|days?|wochen|monate|tage)/i.test(s)) add('delivery', snip((s0.split(/[,;:]/).find(c => /\d+\s*(?:weeks?|months?|days?|wochen|monate|tage)/i.test(c)) || s0).trim(), 170));
  }
  /* nothing matched: file it as a note in its topic section, or under Others when no topic is clear */
  const strong = out.filter(x => x.k !== 'org' && x.k !== 'contact').length, g0 = s0.replace(/^(?:hi|hello|hallo|hey|dear|good (?:morning|afternoon))\b[^,]{0,30},\s*/i, '');
  const core = out.filter(x => !['org', 'contact', 'city', 'state', 'contract_status', 'permit_status', 'grid_status', 'fin_status'].includes(x.k)).length;
  if ((!strong || (!core && g0.split(/\s+/).length >= 10 && !/^(?:we|i)\s+(?:got|have|received|heard)\s+(?:the |some |a |an )?(?:news|update|information|message)/i.test(g0))) && !out.cand && g0.length >= 25 && g0.split(/\s+/).length >= 5 && !SKIP_OTHER.test(g0.trim())) {
    if (tp && CATK['nt_' + tp]) add('nt_' + tp, snip(g0, 220), { sent: g0 }); else { const h = CUE_HINTS.find(x => x[0].test(g0)); add('other', snip(g0, 220), h ? { hint: CATK[h[1]].label, sent: g0 } : { sent: g0 }); }
  }
  if (strong && tp && CATK['nt_' + tp] && dates(s).length && !out.some(x => KEYDATE.has(x.k)) && s0.split(/\s+/).length >= 5) add('nt_' + tp, snip(s0, 220), { sent: s0 });
  out.own = own;
  return out;
}

const newF = () => ({ items: [], ph: { pl: 0, bu: 0, op: 0 } });
function extractFacts(doc, cands, strict) {
  const out = {}, dflt = cands.length === 1 && !strict ? cands[0] : null; let pos = 0, cur = dflt, ctp = null, ccand = null;
  doc.text.split(/\n+/).forEach(line => {
    if (line.length >= 70) cur = dflt;
    if ((line.length <= 70 && /:\s*$/.test(line)) || /^(?:subject|betreff|re|aw)\s*:/i.test(line)) { const t = topicOf(line); if (t) ctp = t; }
    splitSent(line).forEach(raw => {
      const s = raw.trim(); if (!s) return;
      const m = cands.filter(c => c.rx.test(s)); if (m.length > 1) return; if (m.length === 1) { if (cur && m[0] !== cur) { ctp = null; ccand = null; } cur = m[0]; } if (!cur) return;
      const i = doc.text.indexOf(s, pos); if (i >= 0) pos = i;
      const ev = { doc: doc.name, docId: doc.id, pg: i >= 0 ? pageAt(doc, i) : null, date: doc.date, kind: doc.kind, s: s.slice(0, 240) };
      const F = out[cur.key] || (out[cur.key] = newF());
      CTXNAMES = ccand && ccand.left > 0 ? ccand.names : []; const res = extractSentence(s, cur, ctp, ccand && ccand.left > 0 ? ccand.k : null); if (res.own) ctp = res.own; if (res.cand) ccand = { k: res.cand, left: 2, names: [...new Set([...(ccand && ccand.k === res.cand ? ccand.names : []), ...res.filter(x => x.k === res.cand).map(x => x.v)])] }; else if (ccand) ccand.left--; res.forEach(x => F.items.push({ ...x, ev }));
      Object.keys(PHX).forEach(k => { if (PHX[k].test(s)) F.ph[k]++; });
    });
  });
  return out;
}
function mergeF(list) { const F = newF(); list.forEach(x => { F.items.push(...x.items); Object.keys(F.ph).forEach(k => F.ph[k] += x.ph[k]); }); return F; }
const phaseOf = ph => ph.op >= 2 && ph.op >= ph.bu ? 'Operation' : ph.bu >= 2 && ph.bu >= ph.pl ? 'Building' : 'Planning';

/* ---------- choosing the final value per catalog field ---------- */
const dkey = x => x.k === 'contact' ? ((x.v.match(/[\w.+-]+@[\w.-]+/) || [x.v])[0]).toLowerCase() : norm(x.v).toLowerCase();
const byDate = (a, b) => a.ev.date < b.ev.date ? 1 : a.ev.date > b.ev.date ? -1 : 0;
function pickOne(k, arr) {
  arr = arr.filter(x => x.w > -1); if (!arr.length) return null;
  const man = arr.find(x => x.man); if (man) return { ...man, alts: [] };
  let sorted;
  if (k in KEYSTAT) sorted = arr.slice().sort((a, b) => b.rk - a.rk || byDate(a, b));
  else if (KEYDATE.has(k)) sorted = arr.slice().sort(byDate);
  else { const sc = {}; arr.forEach(x => { sc[dkey(x)] = (sc[dkey(x)] || 0) + 1 + x.w; }); sorted = arr.slice().sort((a, b) => sc[dkey(b)] - sc[dkey(a)] || byDate(a, b)); }
  const top = sorted[0]; return { ...top, alts: [...new Set(sorted.filter(x => dkey(x) !== dkey(top)).map(x => x.v))].slice(0, 4) };
}
function finalizeItems(list) {
  const by = {}; list.forEach(x => { if (CATK[x.k]) (by[x.k] = by[x.k] || []).push(x); });
  const out = [];
  CAT.forEach(([k]) => {
    const arr = by[k]; if (!arr) return;
    if (CATK[k].one) { const b = pickOne(k, arr); if (b) out.push(b); return; }
    const seen = new Set();
    arr.slice().sort((a, b) => b.v.length - a.v.length).filter(x => { const d = dkey(x); if (seen.has(d)) return false; seen.add(d); return true; }).sort(byDate).slice(0, k === 'other' ? 60 : 12).forEach(x => out.push(x));
  });
  return out;
}

/* ---------- proposal: what BESSMIND would add or change (nothing is applied yet) ---------- */
const ddiff = (a, b) => { const x = pd(a), y = pd(b); return x != null && y != null ? Math.round(x - y) : Math.round((dm(a) - dm(b)) * 30.4); };
const LEGK = { mw: ['mw', v => v + ' MW'], mwh: ['mwh', v => v + ' MWh'], kv: ['kv', v => v + ' kV'], operator: ['operator', v => v], cod: ['cod', v => v] };
function curItem(p, k) {
  const a = (p.items || []).find(x => x.k === k); if (a) return a;
  const l = LEGK[k]; if (l && p[l[0]] != null && p[l[0]] !== '') return { k, v: l[1](p[l[0]]), num: p[l[0]], rk: 0, ev: { doc: 'Project record', date: '0000-00-00', s: '' } };
  return null;
}
function diffItems(p, items) {
  const cur = (p && p.items) || [], ch = [];
  items.forEach(it => {
    const c = CATK[it.k], base = { k: it.k, sec: c.sec, label: c.label, new: it.v, it, ev: it.ev, on: true };
    if (c.one) {
      const o = p ? curItem(p, it.k) : null;
      if (!o) ch.push({ ...base, old: '', type: 'new' });
      else if (dkey(o) !== dkey(it)) {
        const older = o.ev && it.ev && it.ev.date < o.ev.date, lower = it.k in KEYSTAT && it.rk < (o.rk || 0);
        const d = KEYDATE.has(it.k) && dates(o.v).length && dates(it.v).length ? ddiff(it.v, o.v) : 0;
        ch.push({ ...base, old: o.v, type: 'changed', on: !(older || lower), days: d, note: older ? 'older than the value on file' : lower ? 'less advanced than the status on file' : '' });
      }
    } else if (!cur.some(x => x.k === it.k && dkey(x) === dkey(it))) ch.push({ ...base, old: '', type: 'added' });
  });
  return ch;
}
function buildProposal(docs, errors) {
  const P = new Map(), una = [];
  docs.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(doc => {
    const c = candidates(doc); if (!c.length) { una.push(doc); return; }
    const fx = extractFacts(doc, c, false), prim = c.slice().sort((a, b) => b.w - a.w)[0];
    doc.single = c.length === 1; doc.primary = prim.key;
    const fm = doc.text.match(/^(?:From|Von):\s*(.+)$/im); if (fm && fx[prim.key]) fx[prim.key].items.push({ k: 'contact', v: snip(fm[1], 100), w: 0, rk: 0, ev: { doc: doc.name, docId: doc.id, pg: null, date: doc.date, kind: doc.kind, s: snip(fm[0], 160) } });
    const sg = doc.text.match(/(?:regards|grüße|gruß|cheers|sincerely|viele grüße)[,\s]*\n\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s[A-ZÄÖÜ][a-zäöüß\-]+){0,2})[.!\s]*$/im); if (sg && fx[prim.key]) fx[prim.key].items.push({ k: 'contact', v: sg[1], w: 0, rk: 0, ev: { doc: doc.name, docId: doc.id, pg: null, date: doc.date, kind: doc.kind, s: 'Signed: ' + sg[1] } });
    c.forEach(cd => { const e = P.get(cd.key) || { key: cd.key, name: cd.name, existing: cd.existing, include: true, docs: [], Fs: [], w: 0 }; e.docs.push(doc.id); e.w += cd.w; if (fx[cd.key]) e.Fs.push(fx[cd.key]); P.set(cd.key, e); });
  });
  const projects = [...P.values()];
  projects.forEach(e => {
    const F = mergeF(e.Fs); e.items = finalizeItems(F.items); e.phase = phaseOf(F.ph);
    e.changes = diffItems(e.existing ? proj(e.existing) : null, e.items);
    if (!e.existing) { e.low = e.w < 3 && !e.changes.some(c => !['other', 'org', 'contact', 'request'].includes(c.k)); e.include = !e.low; }
  });
  return { docs, projects, unassigned: una, errors: errors || [], hits: null };
}
function proposeFromName(name, x) {
  const key = 'new:' + name.toLowerCase(), c = { key, name, existing: null, rx: rxOf(name), w: 5 }, hits = S.docs.filter(d => d.text && (c.rx.test(d.text) || c.rx.test(d.name))), Fs = [];
  hits.forEach(d => { const fx = extractFacts(d, [c], true); if (fx[key]) Fs.push(fx[key]); });
  const me = { doc: 'Manual entry', docId: null, pg: null, date: new Date().toISOString().slice(0, 10), kind: 'Manual', s: '' }, man = [];
  const addM = (k, v, num) => { if (v && String(v).trim()) man.push({ k, v: String(v).trim(), num, w: 9, rk: 9, man: true, ev: me }); };
  addM('street', x.street); addM('postal', x.postal); addM('city', x.city);
  if (x.mw && +x.mw > 0) addM('mw', +x.mw + ' MW', +x.mw);
  if (x.cod) addM('cod', dates(x.cod)[0] || x.cod);
  Fs.push({ items: man, ph: { pl: 0, bu: 0, op: 0 } });
  const F = mergeF(Fs), e = { key, name, existing: null, include: true, docs: [], Fs, found: hits.length, manual: true, items: finalizeItems(F.items), phase: phaseOf(F.ph) };
  e.changes = diffItems(null, e.items);
  return { docs: [], projects: [e], unassigned: [], errors: [], hits };
}

/* ---------- applying: create / update projects, file documents ---------- */
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const blankProject = name => ({ id: uid(name), name: name.trim(), phase: 'Planning', f: ['none', 'none', 'none', 'none'], fsrc: [null, null, null, null], mw: null, mwh: null, kv: null, cp: null, operator: null, city: '', lat: null, lon: null, cod: '', dates: {}, milestones: [], trend: [], shifts: [], why: [], tl: null, t: null, done: 0, rtb: null, items: [], hist: [], created: Date.now() });
const uid = name => { let b = name.toLowerCase().replace(/[^a-z0-9äöü]+/g, '-').replace(/^-|-$/g, '') || 'project', id = b, n = 2; while (proj(id)) id = b + '-' + n++; return id; };
const getI = (p, k) => (p.items || []).find(x => x.k === k);
function setItem(p, c) {
  const it = c.it, k = it.k; p.items = p.items || [];
  const rec = { id: 'i' + (S.nextId++), k, v: it.v, num: it.num, rk: it.rk, st: it.st, alts: it.alts || [], hint: it.hint, ev: it.ev, t: Date.now() };
  if (CATK[k].one) {
    const i = p.items.findIndex(x => x.k === k);
    if (i >= 0) { if (c.type === 'changed') (p.hist = p.hist || []).unshift({ k, sec: CATK[k].sec, label: CATK[k].label, old: p.items[i].v, new: it.v, ev: it.ev, t: Date.now(), days: c.days || 0 }); p.items[i] = rec; }
    else { if (c.old && c.type === 'changed') (p.hist = p.hist || []).unshift({ k, sec: CATK[k].sec, label: CATK[k].label, old: c.old, new: it.v, ev: it.ev, t: Date.now(), days: c.days || 0 }); p.items.push(rec); }
  } else p.items.push(rec);
}
function syncDerived(p) {
  const g = k => getI(p, k);
  ['mw', 'mwh', 'kv'].forEach(k => { const i = g(k); if (i && i.num != null) p[k] = i.num; });
  const op = g('operator'); if (op) p.operator = op.v;
  const city = g('city'), state = g('state'); if (city) p.city = city.v + (state ? ', ' + state.v : '');
  const cod = g('cod'); if (cod) p.cod = cod.v; else if (!p.demo) p.cod = '';
  Object.keys(KEYSTAT).forEach(k => { const i = g(k); if (i) { p.f[KEYSTAT[k]] = i.st || 'open'; p.fsrc[KEYSTAT[k]] = srcOf(i.ev); } });
  p.dates = {}; [['cod', 'cod'], ['energisation', 'energisation'], ['grid_date', 'grid'], ['permit_date', 'permit']].forEach(([k, r]) => { const i = g(k); if (i) p.dates[r] = { date: i.v, src: srcOf(i.ev) }; });
  if (city && GAZ[city.v] && !GAZ[city.v][2] && (!p.geo || /approx|not found/.test(p.geo.prec))) { p.lat = GAZ[city.v][0]; p.lon = GAZ[city.v][1]; p.geo = { key: '', prec: 'city (approximate)', src: 'built-in place list' }; }
}
function applyChanges(p, changes) {
  const done = changes.filter(c => c.on);
  done.forEach(c => {
    setItem(p, c);
    if (p.tl && c.days && (c.k === 'cod' || c.k === 'grid_date')) {
      shiftProject(p, c.k === 'cod' ? 'Construction' : 'Grid connection', c.days, c.label + ' changed in ' + c.ev.doc, c.ev.s);
      if (c.days > 0) { p.why.unshift({ cat: c.k === 'cod' ? 'Schedule' : 'Grid', pts: clampN(Math.round(c.days / 5), 5, 30), title: c.label + ' moved +' + c.days + ' days', ev: c.ev.s, t: Date.now() }); }
    }
  });
  syncDerived(p); return done;
}
function storeDoc(d, pid) {
  const key = d.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[\s_-]*(v|rev\.?|version)?\s*\d+(\.\d+)*\s*$/, '').trim();
  if (S.docs.some(x => x.name === d.name && x.date === d.date && x.size === d.size && x.p === pid)) return false;
  S.docs.forEach(x => { if (x.p === pid && x.kind === d.kind && x.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[\s_-]*(v|rev\.?|version)?\s*\d+(\.\d+)*\s*$/, '').trim() === key) x.cur = false; });
  S.docs.unshift({ id: d.id, p: pid, name: d.name, ver: d.ver, cur: true, src: d.src, date: d.date, page: null, text: d.text, pageStarts: d.pageStarts, kind: d.kind, size: d.size });
  return true;
}
function applyProposal(pr) {
  const sum = { t: Date.now(), created: [], updated: [], docs: 0, findings: [], facts: 0, others: 0 }, idOf = {}, touched = [];
  pr.projects.filter(x => x.include).forEach(e => {
    const doc0 = pr.docs.find(d => d.id === e.docs[0]), srcL = doc0 ? doc0.name : 'Manual entry';
    let p = e.existing ? proj(e.existing) : null; const isNew = !p;
    if (isNew) { p = blankProject(e.name); p.phase = e.phase || 'Planning'; S.projects.push(p); }
    const done = applyChanges(p, e.changes), main = done.filter(c => c.k !== 'other'), nOther = done.length - main.length;
    idOf[e.key] = p.id; touched.push(p); sum.facts += main.length; sum.others += nOther;
    const t = Date.now();
    if (isNew) { sum.created.push(p.name); S.changes.unshift({ t, p: p.id, text: 'Project created', src: srcL, ev: main.slice(0, 4).map(c => c.label + ': ' + c.new).join(' · ') || 'No facts found yet', sec: 'ov' }); }
    else {
      sum.updated.push(p.name);
      main.slice(0, 8).forEach(c => S.changes.unshift({ t, p: p.id, text: c.label + ': ' + (c.old ? c.old + ' → ' : '') + c.new, src: c.ev.doc, ev: c.ev.s, sec: c.sec }));
      if (main.length > 8) S.changes.unshift({ t, p: p.id, text: (main.length - 8) + ' more facts added', src: srcL, ev: '', sec: 'ov' });
    }
    if (nOther) S.changes.unshift({ t, p: p.id, text: nOther + ' other note' + (nOther === 1 ? '' : 's') + ' filed under Others', src: srcL, ev: '', sec: 'oth' });
  });
  pr.docs.forEach(d => { const pid = idOf[d.primary] || null; d.p = pid; if (storeDoc(d, pid)) sum.docs++; });
  pr.unassigned.forEach(d => { if (storeDoc(d, d.assign || null)) sum.docs++; });
  if (pr.hits) pr.hits.forEach(d => { if (!d.p && touched[0]) d.p = touched[0].id; });
  pr.docs.concat(pr.unassigned).filter(d => d.isMail || d.kind === 'Document').forEach(d => { const pid = d.p || d.assign, forced = d.single && pid && proj(pid) ? pid : 'auto', r = analyze(d.text, forced); if (!r.error) sum.findings.push(...r.results); });
  S.log.unshift({ t: sum.t, docs: pr.docs.concat(pr.unassigned).map(d => d.name), created: sum.created, updated: sum.updated });
  save();
  if (!S.geoOff) touched.forEach(p => geocodeProject(p).then(ch => { if (ch) { save(); if (typeof render === 'function') render(); } }).catch(() => {}));
  return sum;
}

/* ---------- map position: OpenStreetMap Nominatim (street, postal code and city are sent), 1 request per second ---------- */
const GEO = { q: Promise.resolve() };
function geoQueue(fn) { const r = GEO.q.then(fn); GEO.q = r.catch(() => {}).then(() => sleep(1100)); return r; }
async function nominatim(params) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ format: 'json', addressdetails: '1', limit: '1', countrycodes: 'de', ...params }), { signal: ctl ? ctl.signal : undefined, headers: { 'Accept-Language': 'en' } });
    if (!r.ok) return null; const j = await r.json(); return j[0] || null;
  } catch { return null; } finally { if (t) clearTimeout(t); }
}
async function geocodeProject(p) {
  const v = k => (getI(p, k) || {}).v || '', a = { street: v('street'), postal: v('postal'), city: v('city') };
  if (!a.street && !a.postal && !a.city) return false;
  const key = [a.street, a.postal, a.city].join('|'); if (p.geo && p.geo.key === key) return false;
  let res = null, prec = '';
  if (a.street) { const m = a.street.match(/^(.*?)\s+(\d+\s?[a-z]?)$/), street = m ? m[2] + ' ' + m[1] : a.street; res = await geoQueue(() => nominatim({ street, ...(a.city ? { city: a.city } : {}), ...(a.postal ? { postalcode: a.postal } : {}) })); if (res) prec = res.address && res.address.house_number ? 'address' : 'street'; }
  if (!res && a.postal) { res = await geoQueue(() => nominatim({ postalcode: a.postal, ...(a.city ? { city: a.city } : {}) })); if (res) prec = 'postal code'; }
  if (!res && a.city) { res = await geoQueue(() => nominatim({ city: a.city })); if (res) prec = 'city'; }
  if (!res) { const g = GAZ[a.city]; if (g && !g[2]) { p.lat = g[0]; p.lon = g[1]; p.geo = { key: '', prec: 'city (approximate)', src: 'built-in place list' }; return true; } p.geo = { key, prec: 'not found' }; return false; }
  p.lat = +res.lat; p.lon = +res.lon; p.geo = { key, prec, src: 'OpenStreetMap Nominatim', label: res.display_name }; return true;
}

/* ---------- "where does this belong?": the user names the topic, BESSMIND reads the sentence again inside it ---------- */
const SEC_TOPIC = { ov: 'ov', site: 'site', perm: 'perm', grid: 'grid', contr: 'contr', proc: 'proc', fin: 'fin', cons: 'cons', ops: 'ops' };
const ENT_FAM = { supplier: 'supplier', supplier_cand: 'supplier', epc: 'epc', epc_cand: 'epc', lender: 'lender', operator: 'operator', permit_auth: 'permit_auth' };
function narrow(k, s, pname) {
  const nk = e => !(pname && pname.toLowerCase().includes(e.toLowerCase())), t = fixTypos(s);
  let es = entities(t).filter(nk); if (!es.length && ENT_FAM[k]) es = lowerNames(t).filter(nk);
  if (k === 'supplier_cand' || k === 'epc_cand') return es.map(e => ({ k, v: e }));
  if (ENT_FAM[k] || k === 'connpoint' || k === 'city' || k === 'state') {
    if (k === 'operator') { const o = OPS_RX.find(([, rx]) => rx.test(t)); if (o) return [{ k, v: o[0] }]; }
    return es.length ? [{ k, v: es[0] }] : [];
  }
  if (KEYDATE.has(k)) { const d = dates(t)[0]; return d ? [{ k, v: d }] : []; }
  if (k === 'price' || k === 'fin_amount') { const a = t.match(AMT_RX); return a ? [{ k, v: a[0].trim() }] : []; }
  if (k === 'mw' || k === 'mwh' || k === 'kv') { const m = k === 'kv' ? t.match(/(\d{2,3})\s*-?\s*kV\b/i) : t.match(k === 'mw' ? /(\d{1,4}(?:[.,]\d+)?)\s*MW\b/i : /(\d{1,4}(?:[.,]\d+)?)\s*MWh\b/i); if (!m) return []; const n = parseFloat(m[1].replace(',', '.')); return [{ k, v: n + ' ' + (k === 'kv' ? 'kV' : k === 'mw' ? 'MW' : 'MWh'), num: n }]; }
  if (k in KEYSTAT) { const st = Object.values(STAT2).find(x => x[0] === k); if (OKW.test(t) && !NEGST.test(t) && !OPENW.test(t)) return [{ k, v: st ? st[1] : 'Confirmed', rk: 3, st: 'ok' }]; if (OPENW.test(t)) return [{ k, v: st ? st[2] : 'In progress', rk: 1, st: 'open' }]; return []; }
  if (k === 'request') return [{ k, v: shortTask(s, []) }];
  return [{ k, v: snip(s, 220) }];
}
function refile(c, target, pname) {
  const def = CATK[target]; if (!def) return [];
  const sent = (c.it && c.it.sent) || c.new, ev = c.ev, sec = def.sec, tp = SEC_TOPIC[sec] || null, note = CATK['nt_' + sec] ? 'nt_' + sec : 'other';
  const res = tp ? extractSentence(sent, pname ? { name: pname } : null, tp, null, tp).filter(x => CATK[x.k] && CATK[x.k].sec === sec && x.k !== 'other' && !/^nt_/.test(x.k)) : [];
  let out;
  if (/^nt_/.test(target)) out = [{ k: target, v: snip(sent, 220) }];
  else {
    const hit = res.filter(x => x.k === target); out = hit.length ? hit.slice() : narrow(target, sent, pname);
    if (!out.length) out = [{ k: note, v: snip(sent, 220), fb: true }];
    else res.filter(x => x.k !== target).slice(0, 6).forEach(x => out.push(x));
  }
  return out.map(x => ({ w: 3, rk: 0, ...x, ev, sent }));
}
const GENERIC_W = new Set('regarding project there their which would could should about these those please thanks regards thing things stuff update updates news information email message today tomorrow yesterday really maybe still going being having after before again other another found latest short quick'.split(' '));
function learnFrom(sent, target, items, pname) {
  S.learn = S.learn || { ent: {}, kw: {} }; const L = S.learn; L.ent = L.ent || {}; L.kw = L.kw || {};
  const fam = ENT_FAM[target]; if (fam) items.forEach(x => { if (ENT_FAM[x.k] === fam && !x.fb) L.ent[x.v.toLowerCase()] = { k: fam, d: x.v }; });
  const sec = CATK[target] && CATK[target].sec; if (!sec || !TOPIC[sec]) return;
  const skip = new Set(items.map(x => String(x.v).toLowerCase()).concat((pname || '').toLowerCase()).join(' ').split(/\s+/));
  const ws = [...new Set((sent.match(/(?<![\wÄÖÜäöüß])[a-zäöüß]{5,}(?![\wÄÖÜäöüß])/g) || []))].filter(w => !STOPW.has(w) && !GENERIC_W.has(w) && !skip.has(w) && !Object.keys(TOPIC).some(t => w.match(TOPIC[t])) && !isMonth(w)).slice(0, 6);
  ws.forEach(w => { const e = Object.prototype.hasOwnProperty.call(L.kw, w) ? L.kw[w] : null; L.kw[w] = { sec, n: e && e.sec === sec ? Math.min(e.n + 1, 5) : 1 }; });
  const keys = Object.keys(L.kw); if (keys.length > 600) keys.slice(0, keys.length - 600).forEach(k => delete L.kw[k]);
}
