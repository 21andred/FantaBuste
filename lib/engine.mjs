// Motore dell'asta a buste chiuse per la conferma dei giovani.
// Funzioni pure: ricevono lo stato, lo modificano e non fanno I/O.
// Tutte le transizioni a tempo avvengono in tick(), chiamata a ogni richiesta.

export class GameError extends Error {}

const S = 1000;

export function newState(cfg, now) {
  return {
    v: 1,
    season: cfg.season,
    createdAt: now,
    phase: 'declaration', // declaration | auction | done
    pins: {},
    declarations: {},
    lots: [],
    current: null,
    results: [],
  };
}

export function teamIds(cfg) {
  return cfg.teams.map((t) => t.id);
}

/** Ultimo anno di inizio stagione in cui il giocatore è ancora "giovane". */
export function lastYoungStartYear(cfg, birthYear) {
  return cfg.seasonStartYear + (birthYear - cfg.minBirthYear);
}

export function seasonLabel(startYear) {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- dichiarazioni

export function declare(state, cfg, teamId, input, now, rng = Math.random) {
  if (state.phase !== 'declaration') throw new GameError('Le dichiarazioni sono chiuse.');
  if (input && input.none) {
    state.declarations[teamId] = { none: true, at: now };
  } else {
    const player = String(input?.player ?? '').trim().replace(/\s+/g, ' ');
    let birthYear = Number(input?.birthYear);
    let cost = null;
    if (player.length < 2 || player.length > 60) throw new GameError('Inserisci il nome del giocatore.');
    const roster = cfg.teams.find((t) => t.id === teamId)?.players;
    if (roster) {
      const p = roster.find((x) => x.name === player);
      if (!p) throw new GameError('Il giocatore non è nella tua rosa.');
      cost = p.cost;
      if (cfg.birthYears?.[p.name]) birthYear = cfg.birthYears[p.name];
    }
    if (!Number.isInteger(birthYear) || birthYear < 1950 || birthYear > 2030)
      throw new GameError('Anno di nascita non valido.');
    if (birthYear < cfg.minBirthYear)
      throw new GameError(`Non è un giovane: per la stagione ${cfg.season} servono i nati dal ${cfg.minBirthYear} in poi.`);
    const dup = Object.entries(state.declarations).find(
      ([id, d]) => id !== teamId && !d.none && d.player.toLowerCase() === player.toLowerCase(),
    );
    if (dup) throw new GameError('Questo giocatore è già stato dichiarato da un\'altra squadra.');
    state.declarations[teamId] = { player, birthYear, cost, at: now };
  }
  const allDeclared = teamIds(cfg).every((id) => state.declarations[id]);
  if (allDeclared) startAuction(state, cfg, now, rng);
}

export function startAuction(state, cfg, now, rng = Math.random) {
  const lots = teamIds(cfg)
    .filter((id) => !state.declarations[id].none)
    .map((id) => ({
      id: id,
      ownerId: id,
      player: state.declarations[id].player,
      birthYear: state.declarations[id].birthYear,
      cost: state.declarations[id].cost ?? null,
      status: 'pending',
      rounds: [],
      result: null,
    }));
  // estrazione casuale dell'ordine (Fisher–Yates)
  for (let i = lots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lots[i], lots[j]] = [lots[j], lots[i]];
  }
  state.lots = lots;
  if (lots.length === 0) {
    state.phase = 'done';
    state.current = null;
    return;
  }
  state.phase = 'auction';
  state.current = { lotIndex: -1, step: 'intro', deadline: now + cfg.timers.intro * S };
}

// ---------------------------------------------------------------- asta

function startLot(state, cfg, index, now) {
  const lot = state.lots[index];
  lot.status = 'live';
  state.current = {
    lotIndex: index,
    step: 'bidding',
    round: 0,
    eligible: teamIds(cfg).filter((id) => id !== lot.ownerId),
    bids: {},
    floor: 0,
    high: null,
    top: [],
    deadline: now + cfg.timers.bidding * S,
  };
}

export function currentLot(state) {
  const c = state.current;
  return c && c.lotIndex >= 0 ? state.lots[c.lotIndex] : null;
}

/** amount = numero intero, oppure null per "passo" / "resto alla cifra attuale". */
export function bid(state, cfg, teamId, amount, now, rng = Math.random) {
  const c = state.current;
  if (state.phase !== 'auction' || !c || (c.step !== 'bidding' && c.step !== 'tiebreak'))
    throw new GameError('In questo momento non si possono consegnare buste.');
  if (!c.eligible.includes(teamId)) {
    const lot = currentLot(state);
    if (lot.ownerId === teamId) throw new GameError('Sei il proprietario: non puoi fare offerte sul tuo giocatore.');
    throw new GameError('Non partecipi a questo giro di buste.');
  }
  if (amount === null || amount === undefined || amount === '') {
    c.bids[teamId] = null;
  } else {
    const n = Number(amount);
    if (!Number.isInteger(n)) throw new GameError('L\'offerta deve essere un numero intero.');
    if (c.step === 'bidding' && n < cfg.minBid) throw new GameError(`L'offerta minima è ${cfg.minBid}.`);
    if (c.step === 'tiebreak' && n <= c.floor)
      throw new GameError(`Nello spareggio devi offrire più di ${c.floor} (oppure restare a ${c.floor}).`);
    if (n > 100000) throw new GameError('Offerta troppo alta.');
    c.bids[teamId] = n;
  }
  if (c.eligible.every((id) => id in c.bids)) {
    if (c.step === 'bidding') closeBidding(state, cfg, now);
    else closeTiebreak(state, cfg, now, rng);
  }
}

function closeBidding(state, cfg, now) {
  const c = state.current;
  const lot = currentLot(state);
  const bids = Object.fromEntries(c.eligible.map((id) => [id, c.bids[id] ?? null]));
  lot.rounds.push({ type: 'buste', bids });
  const offers = Object.entries(bids).filter(([, v]) => v !== null);
  if (offers.length === 0) {
    finishLot(state, cfg, lot.ownerId, cfg.priceIfNoBids, 'nessuna-offerta', now);
    return;
  }
  const high = Math.max(...offers.map(([, v]) => v));
  Object.assign(c, {
    step: 'decision',
    high,
    top: offers.filter(([, v]) => v === high).map(([id]) => id),
    bids: {},
    eligible: [],
    deadline: now + cfg.timers.decision * S,
  });
}

export function decide(state, cfg, teamId, choice, now, rng = Math.random) {
  const c = state.current;
  const lot = currentLot(state);
  if (state.phase !== 'auction' || !c || c.step !== 'decision') throw new GameError('Non c\'è nessuna prelazione da decidere.');
  if (lot.ownerId !== teamId) throw new GameError('Solo il proprietario può esercitare la prelazione.');
  if (choice === 'confirm') {
    finishLot(state, cfg, lot.ownerId, c.high + 1, 'prelazione', now);
  } else if (choice === 'decline') {
    resolveTop(state, cfg, now, rng);
  } else {
    throw new GameError('Scelta non valida.');
  }
}

function resolveTop(state, cfg, now) {
  const c = state.current;
  if (c.top.length === 1) {
    finishLot(state, cfg, c.top[0], c.high, 'buste', now);
    return;
  }
  Object.assign(c, {
    step: 'tiebreak',
    round: c.round + 1,
    eligible: [...c.top],
    floor: c.high,
    bids: {},
    deadline: now + cfg.timers.tiebreak * S,
  });
}

function closeTiebreak(state, cfg, now, rng) {
  const c = state.current;
  const lot = currentLot(state);
  const bids = Object.fromEntries(c.eligible.map((id) => [id, c.bids[id] ?? null]));
  lot.rounds.push({ type: 'spareggio', floor: c.floor, bids });
  const raised = Object.entries(bids).filter(([, v]) => v !== null && v > c.floor);
  if (raised.length === 0) {
    const winner = c.eligible[Math.floor(rng() * c.eligible.length)];
    finishLot(state, cfg, winner, c.floor, 'sorteggio', now);
    return;
  }
  const high = Math.max(...raised.map(([, v]) => v));
  const top = raised.filter(([, v]) => v === high).map(([id]) => id);
  if (top.length === 1) {
    finishLot(state, cfg, top[0], high, 'spareggio', now);
    return;
  }
  Object.assign(c, {
    round: c.round + 1,
    eligible: top,
    top,
    floor: high,
    high,
    bids: {},
    deadline: now + cfg.timers.tiebreak * S,
  });
}

function finishLot(state, cfg, winnerId, price, how, now) {
  const lot = currentLot(state);
  lot.status = 'done';
  lot.result = { winnerId, price, how, at: now };
  state.results.push({
    player: lot.player,
    birthYear: lot.birthYear,
    previousCost: lot.cost ?? null,
    ownerId: lot.ownerId,
    winnerId,
    price,
    how,
  });
  state.current = {
    lotIndex: state.current.lotIndex,
    step: 'result',
    deadline: now + cfg.timers.result * S,
  };
}

function nextLot(state, cfg, now) {
  const next = state.current.lotIndex + 1;
  if (next >= state.lots.length) {
    state.phase = 'done';
    state.current = null;
  } else {
    startLot(state, cfg, next, now);
  }
}

/** Applica tutte le transizioni a tempo scadute. Restituisce true se lo stato è cambiato. */
export function tick(state, cfg, now, rng = Math.random) {
  let changed = false;
  for (let guard = 0; guard < 1000; guard++) {
    const c = state.current;
    if (state.phase !== 'auction' || !c || now < c.deadline) break;
    const t = c.deadline; // le transizioni a catena partono dalla scadenza precedente
    switch (c.step) {
      case 'intro':
      case 'result':
        nextLot(state, cfg, t);
        break;
      case 'bidding':
        closeBidding(state, cfg, t);
        break;
      case 'decision':
        resolveTop(state, cfg, t); // tempo scaduto = rinuncia
        break;
      case 'tiebreak':
        closeTiebreak(state, cfg, t, rng);
        break;
      default:
        return changed;
    }
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- vista per il client

/** Quello che un client può vedere. Le buste in corso NON vengono mai inviate (tranne la propria). */
export function view(state, cfg, me, now) {
  const c = state.current;
  const declarationsOpen = state.phase === 'declaration';
  const out = {
    serverNow: now,
    season: cfg.season,
    seasonStartYear: cfg.seasonStartYear,
    minBirthYear: cfg.minBirthYear,
    minBid: cfg.minBid,
    priceIfNoBids: cfg.priceIfNoBids,
    timers: cfg.timers,
    me: me || null,
    phase: state.phase,
    teams: cfg.teams.map((t) => ({
      id: t.id,
      name: t.name,
      manager: t.manager,
      hasPin: Boolean(state.pins[t.id]),
      declared: Boolean(state.declarations[t.id]),
      declaredNone: !declarationsOpen && Boolean(state.declarations[t.id]?.none),
    })),
    myDeclaration: me ? state.declarations[me] || null : null,
    myRoster: me && declarationsOpen
      ? (cfg.teams.find((t) => t.id === me).players || []).map((p) => ({ ...p, birthYear: cfg.birthYears?.[p.name] ?? null }))
      : null,
    lots: declarationsOpen
      ? []
      : state.lots.map((l) => ({
          id: l.id,
          ownerId: l.ownerId,
          player: l.player,
          birthYear: l.birthYear,
          cost: l.cost,
          status: l.status,
          result: l.result,
          rounds: l.status === 'done' ? l.rounds : [],
        })),
    current: null,
    results: state.results,
  };
  if (c) {
    const cur = { lotIndex: c.lotIndex, step: c.step, deadline: c.deadline };
    if (c.step === 'bidding' || c.step === 'tiebreak') {
      cur.round = c.round;
      cur.eligible = c.eligible;
      cur.responded = c.eligible.filter((id) => id in c.bids);
      cur.floor = c.floor;
      if (me && me in c.bids) cur.myBid = c.bids[me];
    }
    if (c.step === 'decision' || c.step === 'tiebreak') {
      cur.high = c.high;
      cur.tiedCount = c.top.length;
    }
    out.current = cur;
  }
  return out;
}
