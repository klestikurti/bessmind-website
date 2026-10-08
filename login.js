const $ = s => document.querySelector(s);
const UK = 'bessmind-users';
const users = () => { try { return JSON.parse(localStorage.getItem(UK)) || {}; } catch { return {}; } };
async function hashPw(pw, salt) {
  const data = new TextEncoder().encode(salt + ':' + pw);
  if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  let h = 5381; for (const c of data) h = ((h << 5) + h + c) >>> 0; return 'x' + h.toString(16);
}
const say = (t, bad) => { const m = $('#msg'); m.textContent = t; m.className = 'lmsg' + (bad ? ' bad' : ''); };
const enter = (user, company) => { sessionStorage.setItem('bm-session', JSON.stringify({ user, company, t: Date.now() })); location.href = 'portal.html'; };
function tab(up) { $('#f-in').hidden = up; $('#f-up').hidden = !up; $('#t-in').classList.toggle('on', !up); $('#t-up').classList.toggle('on', up); say(''); }
$('#t-in').onclick = () => tab(false); $('#t-up').onclick = () => tab(true);
$('#f-in').onsubmit = async e => {
  e.preventDefault(); const u = $('#u1').value.trim().toLowerCase(), all = users(), a = all[u];
  if (!a || a.hash !== await hashPw($('#p1').value, a.salt)) return say('Username or password is incorrect.', true);
  enter(u, a.company);
};
$('#f-up').onsubmit = async e => {
  e.preventDefault(); const c = $('#c2').value.trim(), u = $('#u2').value.trim().toLowerCase(), p = $('#p2').value, all = users();
  if (!/^[a-z0-9._-]{3,}$/.test(u)) return say('Username: at least 3 characters, only letters, numbers, . _ -', true);
  if (p.length < 8) return say('Password must have at least 8 characters.', true);
  if (all[u]) return say('This username is already taken in this browser.', true);
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  all[u] = { company: c, salt, hash: await hashPw(p, salt), created: Date.now() };
  try { localStorage.setItem(UK, JSON.stringify(all)); } catch { return say('Could not save the account (browser storage is blocked).', true); }
  enter(u, c);
};
if (sessionStorage.getItem('bm-session')) location.replace('portal.html');
