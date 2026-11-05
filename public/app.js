// FantaBuste — client. Interroga il server ogni ~1,5 s e disegna la schermata giusta.

const POLL_MS = 1500;
const app = document.getElementById('app');
const who = document.getElementById('who');
const seasonEl = document.getElementById('season');
const toastEl = document.getElementById('toast');

let S = null;          // ultimo stato ricevuto dal server
let offset = 0;        // differenza orologio server - client
let busy = false;
let lastKey = '';
let session = loadSession();

// ------------------------------------------------------------------ utilità

function loadSession() {
  try { return JSON.parse(localStorage.getItem('fantabuste') || 'null'); } catch { return null; }
}
function saveSession(s) {
  session = s;
  try { s ? localStorage.setItem('fantabuste', JSON.stringify(s)) : localStorage.removeItem('fantabuste'); } catch {}
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const team = (id) => S?.teams.find((t) => t.id === id) || { id, name: id, manager: '' };
const tname = (id) => esc(team(id).name);
const serverNow = () => Date.now() + offset;
const seasonLabel = (y) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
const lastYoung = (birthYear) => S.seasonStartYear + (birthYear - S.minBirthYear);

function youngInfo(birthYear) {
  const last = lastYoung(birthYear);
  const more = last - S.seasonStartYear;
  return more <= 0
    ? `giovane solo per il ${seasonLabel(S.seasonStartYear)}`
    : `giovane fino al ${seasonLabel(last)} (ancora ${more} rinnov${more === 1 ? 'o' : 'i'})`;
}

const HOW = {
  'prelazione': 'Confermato con prelazione',
  'buste': 'Aggiudicato con le buste',
  'nessuna-offerta': 'Nessuna offerta: resta al proprietario',
  'spareggio': 'Aggiudicato allo spareggio',
  'sorteggio': 'Parità anche allo spareggio: sorteggio',
};

function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.className = 'show' + (isError ? ' error' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (toastEl.className = ''), 3200);
}

async function api(path, body) {
  const headers = { 'content-type': 'application/json' };
  if (session) { headers['x-team'] = session.team; headers['x-pin'] = session.pin; }
  const r = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({ error: 'Risposta non valida dal server.' }));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Errore'), { status: r.status });
  return data;
}

async function act(path, body, okMsg) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    const st = await api(path, body);
    if (st.phase) setState(st);
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message, true);
    if (e.status === 401) { saveSession(null); }
  } finally {
    busy = false;
    render(true);
  }
}

// ------------------------------------------------------------------ polling

function setState(st) {
  S = st;
  offset = st.serverNow - Date.now();
  if (session && st.me !== session.team) {
    // PIN non più valido (es. reset senza mantenere i PIN)
    saveSession(null);
  }
}

async function poll() {
  try {
    setState(await api('state'));
    render();
  } catch (e) {
    if (!S) app.innerHTML = `<div class="card"><p>Impossibile contattare il server.</p><p class="muted small">${esc(e.message)}</p></div>`;
  } finally {
    setTimeout(poll, document.hidden ? POLL_MS * 3 : POLL_MS);
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) api('state').then((s) => { setState(s); render(); }).catch(() => {}); });

// ------------------------------------------------------------------ render

/** Ridisegna preservando quello che l'utente sta scrivendo. */
function render(force = false) {
  if (!S) return;
  seasonEl.textContent = `Giovani ${S.season}`;
  renderWho();
  const html = view();
  if (!force && html === lastKey) { tickTimers(); return; }
  lastKey = html;

  const saved = {};
  app.querySelectorAll('input[id], select[id]').forEach((el) => {
    saved[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  const active = document.activeElement?.id;
  app.innerHTML = html;
  for (const [id, v] of Object.entries(saved)) {
    const el = document.getElementById(id);
    if (!el || el.dataset.fresh !== undefined) continue;
    if (el.type === 'checkbox') el.checked = v; else el.value = v;
  }
  if (active) document.getElementById(active)?.focus();
  bind();
  tickTimers();
}

function renderWho() {
  if (session && S.me) {
    const t = team(S.me);
    who.innerHTML = `<span class="chip me">${esc(t.name)}</span><button class="btn link" id="logout">Esci</button>`;
    document.getElementById('logout').onclick = () => { saveSession(null); render(true); };
  } else {
    who.innerHTML = '';
  }
}

function view() {
  if (!session || !S.me) return viewLogin();
  if (S.phase === 'declaration') return viewDeclaration();
  if (S.phase === 'auction') return viewAuction();
  return viewDone();
}

function timerHtml(label, deadline, total) {
  return `<div class="timer" data-deadline="${deadline}" data-total="${total}">
      <span class="muted small">${label}</span><span class="t">--:--</span></div>
    <div class="bar"><div></div></div>`;
}

function tickTimers() {
  document.querySelectorAll('.timer[data-deadline]').forEach((el) => {
    const left = Math.max(0, Number(el.dataset.deadline) - serverNow());
    const s = Math.ceil(left / 1000);
    el.querySelector('.t').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', s <= 10);
    const bar = el.nextElementSibling?.firstElementChild;
    if (bar) bar.style.width = `${Math.min(100, (left / (Number(el.dataset.total) * 1000)) * 100)}%`;
  });
}
setInterval(tickTimers, 250);

// ---------------------------------------------------------------- schermate

function viewLogin() {
  const opts = S.teams.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}${t.manager ? ` — ${esc(t.manager)}` : ''}${t.hasPin ? '' : ' (primo accesso)'}</option>`).join('');
  return `
  <div class="card stack">
    <h2>Entra con la tua squadra</h2>
    <div>
      <label class="field" for="loginTeam">Squadra</label>
      <select id="loginTeam"><option value="">Scegli…</option>${opts}</select>
    </div>
    <div>
      <label class="field" for="loginPin">PIN (4–8 cifre)</label>
      <input id="loginPin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" maxlength="8">
      <p id="pinHint" class="muted small"></p>
    </div>
    <button class="btn primary wide" id="loginBtn">Entra</button>
  </div>
  <div class="card">
    <h3>Come funziona</h3>
    <ol class="small muted" style="padding-left:1.2em;margin:0">
      <li>Ogni squadra dichiara il giovane da confermare (oppure nessuno). I nomi restano segreti finché non hanno dichiarato tutti.</li>
      <li>I giocatori vengono estratti a sorte uno alla volta. Tutti tranne il proprietario consegnano la busta.</li>
      <li>Si apre l'offerta più alta: il proprietario può confermare a +1 oppure rinunciare.</li>
      <li>In caso di parità tra i migliori offerenti si fa un nuovo giro di buste tra loro.</li>
    </ol>
  </div>`;
}

function viewDeclaration() {
  const d = S.myDeclaration;
  const done = S.teams.filter((t) => t.declared).length;
  const mine = d
    ? d.none
      ? `<p class="notice">Hai dichiarato che <strong>non confermi nessun giovane</strong>.</p>`
      : `<p class="notice">Hai dichiarato <strong>${esc(d.player)}</strong> (${d.birthYear}) — ${youngInfo(d.birthYear)}.</p>`
    : '';
  return `
  <div class="card stack">
    <h2>La tua dichiarazione</h2>
    <p class="muted small">Per la stagione ${esc(S.season)} sono giovani i nati dal <strong>${S.minBirthYear}</strong> in poi. Puoi confermarne uno solo. Finché non dichiarano tutti puoi cambiare idea.</p>
    ${mine}
    <div>
      <label class="field" for="decPlayer">Giocatore della tua rosa</label>
      <select id="decPlayer">${rosterOptions()}</select>
    </div>
    <div>
      <label class="field" for="decYear">Anno di nascita</label>
      <input id="decYear" type="number" inputmode="numeric" min="${S.minBirthYear}" max="2030" placeholder="es. ${S.minBirthYear + 1}">
      <p id="decInfo" class="muted small"></p>
    </div>
    <button class="btn primary wide" id="decBtn">${d && !d.none ? 'Cambia dichiarazione' : 'Dichiara'}</button>
    <button class="btn wide" id="decNone">Non confermo nessun giovane</button>
  </div>
  <div class="card">
    <div class="row"><h2>Squadre</h2><span class="spacer"></span><span class="chip ${done === S.teams.length ? 'ok' : ''}">${done}/${S.teams.length}</span></div>
    <p class="muted small">L'asta parte da sola appena hanno dichiarato tutti.</p>
    <ul class="list">${S.teams.map((t) => `
      <li><span class="grow">${esc(t.name)} <span class="muted small">${esc(t.manager)}</span></span>
      ${t.declared ? '<span class="chip ok">✓ consegnato</span>' : '<span class="chip">in attesa</span>'}</li>`).join('')}
    </ul>
  </div>`;
}

function rosterOptions() {
  const r = S.myRoster || [];
  const young = r.filter((p) => p.birthYear && p.birthYear >= S.minBirthYear);
  const unknown = r.filter((p) => !p.birthYear);
  const opt = (p) => `<option value="${esc(p.name)}">${esc(p.name)}${p.role ? ` (${esc(p.role)})` : ''} · ${p.club ? `${esc(p.club)} · ` : ''}costo ${p.cost}${p.birthYear ? ` · ${p.birthYear}` : ''}</option>`;
  return `<option value="">Scegli…</option>`
    + (young.length ? `<optgroup label="Giovani">${young.map(opt).join('')}</optgroup>` : '')
    + (unknown.length ? `<optgroup label="Altri (anno da inserire)">${unknown.map(opt).join('')}</optgroup>` : '');
}

function lotHeader(lot) {
  return `
    <div class="player">${esc(lot.player)}</div>
    <div class="meta">
      ${lot.role ? `<span class="chip">${esc(lot.role)}</span>` : ''}
      ${lot.club ? `<span class="chip">${esc(lot.club)}</span>` : ''}
      <span class="chip">Nato nel ${lot.birthYear}</span>
      ${lot.cost != null ? `<span class="chip">Costo attuale ${lot.cost}</span>` : ''}
      <span class="chip ${lot.ownerId === S.me ? 'me' : ''}">Proprietario: ${tname(lot.ownerId)}</span>
    </div>
    <p class="muted small">${youngInfo(lot.birthYear)}</p>`;
}

function respondedChips(c) {
  return `<div class="meta">${c.eligible.map((id) => {
    const ok = c.responded.includes(id);
    return `<span class="chip ${ok ? 'ok' : ''} ${id === S.me ? 'me' : ''}">${ok ? '✓' : '…'} ${tname(id)}</span>`;
  }).join('')}</div>`;
}

function viewAuction() {
  const c = S.current;
  if (c.step === 'intro') {
    return `
    <div class="card hero">
      <h2>Giocatori alle buste</h2>
      <p class="muted small">Ordine di estrazione:</p>
      ${timerHtml('Si parte tra', c.deadline, S.timers.intro)}
      <ul class="list" style="margin-top:12px">${S.lots.map((l, i) => `
        <li><span class="num muted">${i + 1}</span><span class="grow"><strong>${esc(l.player)}</strong> <span class="muted small">(${[l.role, l.club, l.birthYear].filter(Boolean).map(esc).join(' · ')})</span><br><span class="small muted">${tname(l.ownerId)}</span></span></li>`).join('')}
      </ul>
      ${noneList()}
    </div>`;
  }
  const lot = S.lots[c.lotIndex];
  const isOwner = lot.ownerId === S.me;
  let body = '';

  if (c.step === 'bidding') {
    const can = c.eligible.includes(S.me);
    const sent = c.myBid !== undefined;
    body = `
      ${timerHtml('Tempo per la busta', c.deadline, S.timers.bidding)}
      ${respondedChips(c)}
      ${isOwner ? `<p class="notice">È il tuo giocatore: gli altri stanno scrivendo le buste. Poi vedrai l'offerta più alta e potrai decidere.</p>` : ''}
      ${can ? `
        ${sent ? `<p class="notice">${c.myBid === null ? 'Hai <strong>passato</strong>.' : `Busta consegnata: <strong>${c.myBid}</strong>.`} Puoi cambiarla finché il giro non si chiude.</p>` : ''}
        <label class="field" for="bidAmount">La tua offerta (minimo ${S.minBid})</label>
        <input id="bidAmount" class="big" type="number" inputmode="numeric" min="${S.minBid}" placeholder="0">
        <div class="grid2" style="margin-top:10px">
          <button class="btn primary" id="bidBtn">${sent ? 'Aggiorna busta' : 'Consegna busta'}</button>
          <button class="btn" id="passBtn">Passo</button>
        </div>
        <p class="muted small">Le buste sono segrete: nessuno vede le cifre finché non si aprono.</p>` : ''}`;
  } else if (c.step === 'decision') {
    body = `
      <div class="high"><div class="muted small">Offerta più alta</div><div class="n">${c.high}</div>
        ${c.tiedCount > 1 ? `<div class="small">${c.tiedCount} squadre a pari merito</div>` : ''}</div>
      ${timerHtml(isOwner ? 'Tempo per decidere' : `Decide ${tname(lot.ownerId)}`, c.deadline, S.timers.decision)}
      ${isOwner ? `
        <div class="stack">
          <button class="btn gold wide" id="confirmBtn">Confermo a ${c.high + 1}</button>
          <button class="btn wide" id="declineBtn">Rinuncio${c.tiedCount > 1 ? ' (si va allo spareggio)' : ''}</button>
          <p class="muted small">Se il tempo scade senza una scelta vale come rinuncia.</p>
        </div>` : `<p class="notice">In attesa della decisione del proprietario…</p>`}`;
  } else if (c.step === 'tiebreak') {
    const can = c.eligible.includes(S.me);
    const sent = c.myBid !== undefined;
    body = `
      <div class="high"><div class="muted small">Spareggio${c.round > 1 ? ` · giro ${c.round}` : ''} — parità a</div><div class="n">${c.floor}</div></div>
      ${timerHtml('Tempo per lo spareggio', c.deadline, S.timers.tiebreak)}
      ${respondedChips(c)}
      ${can ? `
        ${sent ? `<p class="notice">${c.myBid === null ? `Resti a <strong>${c.floor}</strong>.` : `Rilancio consegnato: <strong>${c.myBid}</strong>.`} Puoi cambiarlo finché il giro non si chiude.</p>` : ''}
        <label class="field" for="bidAmount">Nuova offerta segreta (più di ${c.floor})</label>
        <input id="bidAmount" class="big" type="number" inputmode="numeric" min="${c.floor + 1}" placeholder="${c.floor + 1}">
        <div class="grid2" style="margin-top:10px">
          <button class="btn primary" id="bidBtn">Rilancia</button>
          <button class="btn" id="passBtn">Resto a ${c.floor}</button>
        </div>
        <p class="muted small">Vince chi rilancia di più. Se nessuno rilancia, si sorteggia.</p>`
        : `<p class="notice">Spareggio in corso tra le squadre a pari merito.</p>`}`;
  } else if (c.step === 'result') {
    body = resultBlock(lot, true) + timerHtml('Prossimo giocatore tra', c.deadline, S.timers.result);
  }

  return `
    <div class="card hero">
      <div class="row"><span class="chip">Giocatore ${c.lotIndex + 1} di ${S.lots.length}</span></div>
      <div style="margin-top:8px">${lotHeader(lot)}</div>
      ${body}
    </div>
    ${scaletta()}`;
}

function bidsLine(round) {
  const parts = Object.entries(round.bids).map(([id, v]) =>
    `${tname(id)}: ${v === null ? (round.type === 'spareggio' ? `resta a ${round.floor}` : 'passa') : `<strong>${v}</strong>`}`);
  return `<div class="bids">${round.type === 'spareggio' ? 'Spareggio' : 'Buste'} — ${parts.join(' · ')}</div>`;
}

/** Crediti rimasti alla squadra vincitrice dopo questo giocatore (budget meno quanto speso fin qui). */
function creditsAfter(lot) {
  const winner = lot.result.winnerId;
  let spent = 0;
  for (const l of S.lots) {
    if (l.status === 'done' && l.result.winnerId === winner) spent += l.result.price;
    if (l === lot) break;
  }
  return S.budget - spent;
}

function awardText(lot) {
  return `${team(lot.result.winnerId).name} si aggiudica ${lot.player} per ${lot.result.price} crediti. I crediti attualmente disponibili sono ${creditsAfter(lot)}.`;
}

function awardHtml(lot) {
  return `<strong>${tname(lot.result.winnerId)}</strong> si aggiudica <strong>${esc(lot.player)}</strong> per <strong>${lot.result.price}</strong> crediti. I crediti attualmente disponibili sono <strong>${creditsAfter(lot)}</strong>.`;
}

function resultBlock(lot, big = false) {
  const r = lot.result;
  const kept = r.winnerId === lot.ownerId;
  const nextYear = lastYoung(lot.birthYear) > S.seasonStartYear;
  return `
    <div class="${big ? 'high' : ''}" style="${big ? '' : 'margin-top:4px'}">
      ${big ? `<div class="muted small">${HOW[r.how]}</div><div class="n">${r.price}</div><div><strong>${tname(r.winnerId)}</strong>${kept ? ' (resta al proprietario)' : ''}</div>` :
        `<div>${awardHtml(lot)} <span class="result-how">· ${HOW[r.how]}</span></div>`}
    </div>
    ${big ? `<p class="notice">${awardHtml(lot)}</p>` : ''}
    ${(lot.rounds || []).map(bidsLine).join('')}
    <p class="muted small">${nextYear ? `L'anno prossimo ${tname(r.winnerId)} potrà rinnovarlo.` : 'Non sarà più giovane l\'anno prossimo.'}</p>`;
}

function noneList() {
  const none = S.teams.filter((t) => t.declaredNone);
  return none.length ? `<p class="muted small">Nessun giovane confermato: ${none.map((t) => esc(t.name)).join(', ')}.</p>` : '';
}

function scaletta() {
  return `
  <div class="card">
    <h2>Scaletta</h2>
    <ul class="list">${S.lots.map((l, i) => `
      <li class="${l.status === 'live' ? 'live' : ''}">
        <span class="num muted">${i + 1}</span>
        <span class="grow">${esc(l.player)} <span class="muted small">· ${tname(l.ownerId)}</span>
          ${l.status === 'done' ? `<br><span class="small">${awardHtml(l)} <span class="muted">(${HOW[l.result.how]})</span></span>` : ''}
        </span>
        ${l.status === 'live' ? '<span class="chip gold">in corso</span>' : l.status === 'done' ? '<span class="chip ok">✓</span>' : '<span class="chip">attesa</span>'}
      </li>`).join('')}
    </ul>
  </div>`;
}

function viewDone() {
  if (!S.lots.length) {
    return `<div class="card"><h2>Nessun giovane da mettere alle buste</h2><p class="muted">Nessuna squadra ha confermato un giovane quest'anno.</p></div>`;
  }
  return `
  <div class="card hero">
    <h2>Asta conclusa 🎉</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Giocatore</th><th>Da</th><th>A</th><th>Prezzo</th></tr></thead>
      <tbody>${S.lots.map((l) => `
        <tr><td><strong>${esc(l.player)}</strong><br><span class="muted small">${[l.role, l.club, l.birthYear].filter(Boolean).map(esc).join(' · ')}<br>${HOW[l.result.how]}</span></td>
        <td>${tname(l.ownerId)}</td><td><strong>${tname(l.result.winnerId)}</strong></td><td class="num">${l.result.price}</td></tr>`).join('')}
      </tbody>
    </table></div>
    <button class="btn wide" id="copyBtn" style="margin-top:12px">Copia riepilogo</button>
  </div>
  <div class="card">
    <h2>Dettaglio buste</h2>
    ${S.lots.map((l) => `<div style="margin-bottom:12px"><strong>${esc(l.player)}</strong>${resultBlock(l)}</div>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------- eventi

function on(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }

function bind() {
  const sel = document.getElementById('loginTeam');
  if (sel) {
    const hint = () => {
      const t = S.teams.find((x) => x.id === sel.value);
      document.getElementById('pinHint').textContent = t && !t.hasPin
        ? 'Primo accesso: il PIN che scegli adesso diventa il PIN della tua squadra. Non dirlo a nessuno!'
        : '';
    };
    sel.onchange = hint; hint();
  }
  on('loginBtn', async () => {
    const teamId = document.getElementById('loginTeam').value;
    const pin = document.getElementById('loginPin').value.trim();
    if (!teamId) return toast('Scegli la squadra.', true);
    try {
      const r = await api('login', { team: teamId, pin });
      saveSession({ team: teamId, pin });
      toast(r.created ? 'PIN creato. Benvenuto!' : 'Bentornato!');
      setState(await api('state'));
      render(true);
    } catch (e) { toast(e.message, true); }
  });
  document.getElementById('loginPin')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });

  const decSel = document.getElementById('decPlayer');
  if (decSel) {
    const yr = document.getElementById('decYear');
    const sync = () => {
      const p = (S.myRoster || []).find((x) => x.name === decSel.value);
      if (p && p.birthYear) { yr.value = p.birthYear; yr.disabled = true; }
      else if (yr.disabled) { yr.value = ''; yr.disabled = false; }
      const y = Number(yr.value);
      document.getElementById('decInfo').textContent = !decSel.value || !y ? ''
        : y < S.minBirthYear ? `Non è un giovane per il ${S.season}.` : youngInfo(y);
    };
    decSel.onchange = sync; yr.oninput = sync; sync();
  }
  on('decBtn', () => act('declare', {
    player: document.getElementById('decPlayer').value,
    birthYear: Number(document.getElementById('decYear').value),
  }, 'Dichiarazione consegnata.'));
  on('decNone', () => act('declare', { none: true }, 'Dichiarazione consegnata.'));

  const amount = document.getElementById('bidAmount');
  on('bidBtn', () => {
    const v = amount.value.trim();
    if (!v) return toast('Scrivi la cifra.', true);
    act('bid', { amount: Number(v) }, 'Busta consegnata.');
  });
  amount?.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('bidBtn').click(); });
  on('passBtn', () => act('bid', { amount: null }, 'Fatto.'));

  on('confirmBtn', () => { if (confirm(`Confermi il giocatore a ${S.current.high + 1}?`)) act('decide', { choice: 'confirm' }); });
  on('declineBtn', () => { if (confirm('Sicuro di voler rinunciare?')) act('decide', { choice: 'decline' }); });

  on('copyBtn', async () => {
    const lines = S.lots.map((l) => `${awardText(l)} (${HOW[l.result.how]})`);
    const txt = `FantaBuste — Giovani ${S.season}\n` + lines.join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Riepilogo copiato.'); } catch { prompt('Copia il riepilogo:', txt); }
  });
}

document.getElementById('resetForm').onsubmit = async (e) => {
  e.preventDefault();
  if (!confirm('Azzerare l\'asta? Dichiarazioni e risultati attuali verranno archiviati e cancellati.')) return;
  try {
    await api('reset', { key: document.getElementById('resetKey').value, keepPins: document.getElementById('keepPins').checked });
    toast('Asta azzerata.');
    document.getElementById('resetKey').value = '';
  } catch (err) { toast(err.message, true); }
};

poll();
