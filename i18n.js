/* BESSMIND language layer: English (source) <-> German.
   The pages are written in English. When German is chosen, every visible text, placeholder and tooltip is
   looked up in BM_DE (i18n-de.js) and swapped in place; a MutationObserver translates whatever the app draws later.
   Keys may contain {0} {1} … placeholders for numbers and names. Facts, quotes and names from the user's own documents are never translated. */
(function () {
  'use strict';
  var KEY = 'bm-lang', D = window.BM_DE || {}, lang = 'en', E = Object.create(null), P = [], obs = null, booted = false;
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { lang = ''; }
  if (lang !== 'de' && lang !== 'en') lang = (navigator.language || '').toLowerCase().indexOf('de') === 0 ? 'de' : 'en';

  var norm = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  Object.keys(D).forEach(function (k) {
    var n = norm(k);
    if (/\{#?\d\}/.test(n)) {
      var toks = n.match(/\{#?\d\}/g), parts = n.split(/\{#?\d\}/), re = '^' + parts.map(function (p, i) { return esc(p) + (i < toks.length ? (toks[i].charAt(1) === '#' ? '(\\d[\\d.,]*)' : '(.+?)') : ''); }).join('') + '$';
      P.push({ re: new RegExp(re), v: D[k], len: n.replace(/\{#?\d\}/g, '').length });
    } else E[n] = D[k];
  });
  P.sort(function (a, b) { return b.len - a.len; });

  var MON = { Jan: 'Jan.', Feb: 'Feb.', Mar: 'März', Apr: 'Apr.', May: 'Mai', Jun: 'Juni', Jul: 'Juli', Aug: 'Aug.', Sep: 'Sept.', Sept: 'Sept.', Oct: 'Okt.', Nov: 'Nov.', Dec: 'Dez.' };
  var MONL = { January: 'Januar', February: 'Februar', March: 'März', April: 'April', May: 'Mai', June: 'Juni', July: 'Juli', August: 'August', September: 'September', October: 'Oktober', November: 'November', December: 'Dezember' };
  var WD = { Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa', Sun: 'So' };

  /* Built-in rules for dates and relative times that the app formats itself. */
  function rules(n) {
    var m;
    if ((m = n.match(/^€(\d+(?:\.\d+)?)M$/))) return numDe(m[1]) + ' Mio. €';
    if ((m = n.match(/^€(\d+(?:\.\d+)?)k$/))) return numDe(m[1]) + ' Tsd. €';
    if ((m = n.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec) (\d{4})$/))) return m[1] + '. ' + MON[m[2]] + ' ' + m[3];
    if ((m = n.match(/^(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/))) return m[1] + '. ' + MONL[m[2]] + ' ' + m[3];
    if ((m = n.match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/))) return MONL[m[1]] + ' ' + m[2];
    if ((m = n.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec) (\d{4})$/))) return MON[m[1]] + ' ' + m[2];
    if ((m = n.match(/^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)$/))) return m[1] + '. ' + MON[m[2]];
    if ((m = n.match(/^(\d+) ?(min|h|d) ago$/))) return 'vor ' + m[1] + ' ' + (m[2] === 'd' ? 'Tg.' : m[2] === 'h' ? 'Std.' : 'Min.');
    if ((m = n.match(/^(\d+) minutes? ago$/))) return 'vor ' + m[1] + ' Min.';
    if ((m = n.match(/^(\d+) hours? ago$/))) return 'vor ' + m[1] + ' Std.';
    if ((m = n.match(/^(\d+) days? ago$/))) return 'vor ' + m[1] + (m[1] === '1' ? ' Tag' : ' Tagen');
    if ((m = n.match(/^(\d+) weeks? ago$/))) return 'vor ' + m[1] + (m[1] === '1' ? ' Woche' : ' Wochen');
    if ((m = n.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/))) return WD[m[1]];
    return null;
  }

  function numDe(x) {                                                      // 1,300 -> 1.300   2.1 -> 2,1
    if (/^\d{1,3}(,\d{3})+$/.test(x)) return x.replace(/,/g, '.');
    if (/^\d+\.\d+$/.test(x)) return x.replace('.', ',');
    return x;
  }
  function lookup(n, depth) {
    if (E[n] !== undefined) return E[n];
    if (n.indexOf('&amp;') > -1) { var u = n.replace(/&amp;/g, '&'); if (E[u] !== undefined) return E[u]; }
    var r = rules(n); if (r) return r;
    for (var i = 0; i < P.length; i++) {
      var m = n.match(P[i].re);
      if (m) { var args = m.slice(1).map(function (x) { var t = depth < 3 ? lookup(x, depth + 1) : null; return t != null ? t : numDe(x); }); return P[i].v.replace(/\{(\d)\}/g, function (_, d) { return args[+d] !== undefined ? args[+d] : ''; }); }
    }
    /* lists such as "A · B · C" or "A, B, C": translate each item on its own */
    var seps = [' · ', ', '];
    for (var k = 0; k < seps.length; k++) {
      if (n.indexOf(seps[k]) < 0 || depth > 4 || n.length > 900 || /^[“"]/.test(n)) continue;
      var any = false, parts2 = n.split(seps[k]).map(function (x) { var t = lookup(x, depth + 2); if (t != null && t !== x) { any = true; return t; } return x; });
      if (any) return parts2.join(seps[k]);
    }
    return null;
  }
  /* Translate a string, keeping its outer whitespace. Returns null when nothing matches. */
  function tr(s) {
    if (typeof s !== 'string') return null;
    var n = norm(s); if (!n || !/[A-Za-z]/.test(n)) return null;
    var v = lookup(n, 0); if (v == null) return null;
    var lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0];
    return lead + v + trail;
  }
  window.bmT = function (s) { return lang === 'de' ? (tr(s) || s) : s; };
  window.bmLang = function () { return lang; };
  window.bmHas = function (s) { return tr(s) != null; };

  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, CODE: 0 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var INLINE = { B: 1, I: 1, EM: 1, STRONG: 1, A: 1, SPAN: 1, SMALL: 1, CODE: 1, BR: 1, MARK: 1, U: 1, SUB: 1, SUP: 1 };

  function textNode(n) {
    var cur = n.data;
    if (n.__bmt !== undefined && cur === n.__bmt) return;                // already translated by us
    var v = tr(cur);
    if (v != null && v !== cur) { n.__bmo = cur; n.__bmt = v; n.data = v; } else if (n.__bmt !== undefined) { n.__bmt = undefined; n.__bmo = undefined; }
  }
  function attrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i]; if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var cur = el.getAttribute(a), rec = el.__bma || (el.__bma = {});
      if (rec[a] && rec[a].t === cur) continue;
      var v = tr(cur); if (v != null && v !== cur) { rec[a] = { o: cur, t: v }; el.setAttribute(a, v); }
    }
  }
  function mixed(el) {                                                     // element with text AND inline children: try the whole innerHTML
    var hasText = false, ok = true, c;
    for (c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { if (c.data.trim()) hasText = true; } else if (c.nodeType === 1) { if (!INLINE[c.tagName] || c.querySelector('*:not(b):not(i):not(em):not(strong):not(span):not(small):not(code):not(br):not(mark):not(a)')) { ok = false; break; } } else if (c.nodeType !== 8) { ok = false; break; }
    }
    if (!hasText || !ok || !el.firstElementChild) return false;
    if (el.__bmh && el.innerHTML === el.__bmh.t) return true;
    var h = norm(el.innerHTML), v = E[h];
    if (v === undefined) { var m = lookup(h, 0); v = m == null ? undefined : m; }
    if (v === undefined) return false;
    el.__bmh = { o: el.innerHTML, t: v }; el.innerHTML = v; el.__bmh.t = el.innerHTML; return true;
  }
  function apply(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1) return;
    var stack = [root];
    while (stack.length) {
      var el = stack.pop();
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || (el.hasAttribute && el.hasAttribute('data-i18n-skip'))) continue;
      attrs(el);
      if (SKIP[el.tagName]) continue;
      if (mixed(el)) continue;
      for (var c = el.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) textNode(c); else if (c.nodeType === 1) stack.push(c); }
    }
  }
  function restore(root) {
    var els = [root].concat([].slice.call(root.querySelectorAll('*')));
    els.forEach(function (el) {
      if (el.__bmh) { if (el.innerHTML === el.__bmh.t) el.innerHTML = el.__bmh.o; el.__bmh = null; }
      if (el.__bma) { Object.keys(el.__bma).forEach(function (a) { if (el.getAttribute(a) === el.__bma[a].t) el.setAttribute(a, el.__bma[a].o); }); el.__bma = null; }
      for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && c.__bmt !== undefined) { if (c.data === c.__bmt) c.data = c.__bmo; c.__bmt = undefined; c.__bmo = undefined; }
    });
  }

  var head = { t: document.title, m: [] };
  function heads() {
    if (lang === 'de') {
      var v = tr(head.t); if (v) document.title = v;
      [].forEach.call(document.querySelectorAll('meta[name=description],meta[property="og:title"],meta[property="og:description"]'), function (m) { if (m.__o === undefined) m.__o = m.content; var x = tr(m.__o); if (x) m.content = x; });
    } else {
      document.title = head.t;
      [].forEach.call(document.querySelectorAll('meta[name=description],meta[property="og:title"],meta[property="og:description"]'), function (m) { if (m.__o !== undefined) m.content = m.__o; });
    }
  }

  function watch() {
    if (!obs) obs = new MutationObserver(function (list) {
      obs.disconnect();
      try {
        list.forEach(function (r) {
          if (r.type === 'childList') [].forEach.call(r.addedNodes, apply);
          else if (r.type === 'characterData') textNode(r.target);
          else if (r.type === 'attributes') attrs(r.target);
        });
      } finally { connect(); }
    });
    connect();
  }
  function connect() { if (lang === 'de' && document.body) obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); }

  function paint() {
    [].forEach.call(document.querySelectorAll('.bm-lang button'), function (b) { var on = b.getAttribute('data-lang') === lang; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  function setLang(l, fromStorage) {
    if (l !== 'de' && l !== 'en') return;
    if (!fromStorage) { try { localStorage.setItem(KEY, l); } catch (e) { } }
    var was = lang; lang = l; document.documentElement.lang = l;
    if (obs) obs.disconnect();
    if (l === 'de') { apply(document.body); heads(); watch(); } else { if (was === 'de' || booted) restore(document.body); heads(); }
    paint();
    try { window.dispatchEvent(new CustomEvent('bm-lang', { detail: l })); } catch (e) { }
  }
  window.bmSetLang = setLang;

  var CSS = '.bm-lang{display:inline-flex;border:1px solid rgba(160,175,190,.35);border-radius:8px;overflow:hidden;margin-right:10px;flex:none}' +
    '.bm-lang button{background:transparent;color:inherit;border:0;padding:6px 10px;font:600 12px/1 inherit;font-family:inherit;letter-spacing:.04em;cursor:pointer;opacity:.65}' +
    '.bm-lang button:hover{opacity:1}.bm-lang button.on{background:rgba(45,226,166,.18);opacity:1;color:#2de2a6}' +
    'html[lang="de"] .links{gap:20px;font-size:13px}.links a{white-space:nowrap}header.top .btn,.top-r>*,#nav button{white-space:nowrap}.top-r{gap:10px}@media(max-width:1500px){html[lang="de"] .top-r .mon{display:none}}' +
    'header.top .wrap>.bm-lang{margin:0 0 0 12px}@media(max-width:700px){header.top .wrap>a.btn{display:none}header.top .wrap>.bm-lang{margin-left:auto}}' +
    '.bm-lang.fixed{position:fixed;top:12px;right:14px;z-index:99;background:rgba(7,9,12,.7);color:#e8eef4;margin:0}';
  function inject() {
    if (document.querySelector('.bm-lang')) return;
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (window.self !== window.top) return;                                  // inside the demo frame the page's own switch controls it
    var box = document.createElement('div'); box.className = 'bm-lang'; box.setAttribute('data-i18n-skip', ''); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'Language / Sprache');
    box.innerHTML = '<button type="button" data-lang="en" title="English">EN</button><button type="button" data-lang="de" title="Deutsch">DE</button>';
    box.addEventListener('click', function (e) { var b = e.target.closest('button[data-lang]'); if (b) setLang(b.getAttribute('data-lang')); });
    var r = document.querySelector('.top-r'), w = document.querySelector('header.top .wrap');
    if (r) r.insertBefore(box, r.firstChild); else if (w) { w.appendChild(box); } else { box.className += ' fixed'; document.body.appendChild(box); }
  }
  function boot() {
    if (booted) return; booted = true; inject();
    document.documentElement.lang = lang; paint();
    if (lang === 'de') { apply(document.body); heads(); watch(); }
  }
  /* Browser dialogs go through the same dictionary. */
  ['alert', 'confirm', 'prompt'].forEach(function (f) { var o = window[f]; if (!o) return; window[f] = function (m, d) { return o.call(window, window.bmT(m), d); }; });
  window.addEventListener('storage', function (e) { if (e.key === KEY && (e.newValue === 'de' || e.newValue === 'en') && e.newValue !== lang) setLang(e.newValue, true); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
