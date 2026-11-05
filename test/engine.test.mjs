import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, declare, bid, decide, ready, tick, view, GameError, lastYoungStartYear } from '../lib/engine.mjs';
import { createApi } from '../lib/server.mjs';

const cfg = {
  season: '2026/27',
  seasonStartYear: 2026,
  minBirthYear: 2005,
  teams: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), manager: id })),
  minBid: 1,
  priceIfNoBids: 1,
  timers: { bidding: 90, decision: 120, tiebreak: 60, result: 10 },
};
const noShuffle = () => 0.999999; // Fisher–Yates con j=i -> ordine invariato

function setup(decls) {
  const s = newState(cfg, 0);
  for (const [team, d] of Object.entries(decls)) declare(s, cfg, team, d, 0, noShuffle);
  return s;
}
function toFirstLot(s) {
  for (const t of ['a', 'b', 'c', 'd']) ready(s, cfg, t, 0);
  return s;
}

test('rifiuta chi non è giovane', () => {
  const s = newState(cfg, 0);
  assert.throws(() => declare(s, cfg, 'a', { player: 'Vecchio', birthYear: 2004 }, 0), GameError);
});

test('durata: nato 2005 giovane solo nel 2026/27, nato 2007 fino al 2028/29', () => {
  assert.equal(lastYoungStartYear(cfg, 2005), 2026);
  assert.equal(lastYoungStartYear(cfg, 2007), 2028);
});

test('le dichiarazioni restano segrete finché non dichiarano tutti', () => {
  const s = newState(cfg, 0);
  declare(s, cfg, 'a', { player: 'Rossi', birthYear: 2006 }, 0);
  const v = view(s, cfg, 'b', 0);
  assert.equal(v.lots.length, 0);
  assert.equal(JSON.stringify(v).includes('Rossi'), false);
  assert.equal(v.phase, 'declaration');
});

test('esempio del regolamento: prelazione a 25+1', () => {
  const s = toFirstLot(setup({ a: { player: 'Rossi', birthYear: 2006 }, b: { none: true }, c: { none: true }, d: { none: true } }));
  assert.equal(s.current.step, 'bidding');
  assert.throws(() => bid(s, cfg, 'a', 10, 1), /proprietario/);
  bid(s, cfg, 'b', 25, 1);
  // le buste altrui non sono visibili
  assert.equal(view(s, cfg, 'c', 1).current.myBid, undefined);
  assert.equal(JSON.stringify(view(s, cfg, 'c', 1)).includes('25'), false);
  bid(s, cfg, 'c', 20, 2);
  bid(s, cfg, 'd', null, 3);
  assert.equal(s.current.step, 'decision');
  assert.equal(view(s, cfg, 'a', 3).current.high, 25);
  decide(s, cfg, 'a', 'confirm', 4);
  assert.deepEqual(s.results[0], { player: 'Rossi', birthYear: 2006, previousCost: null, role: '', club: '', ownerId: 'a', winnerId: 'a', price: 26, how: 'prelazione' });
});

test('rinuncia: va al miglior offerente', () => {
  const s = toFirstLot(setup({ a: { player: 'Rossi', birthYear: 2006 }, b: { none: true }, c: { none: true }, d: { none: true } }));
  bid(s, cfg, 'b', 25, 1); bid(s, cfg, 'c', 20, 1); bid(s, cfg, 'd', 3, 1);
  decide(s, cfg, 'a', 'decline', 2);
  assert.equal(s.results[0].winnerId, 'b');
  assert.equal(s.results[0].price, 25);
});

test('nessuna offerta: resta al proprietario a 1', () => {
  const s = toFirstLot(setup({ a: { player: 'Rossi', birthYear: 2006 }, b: { none: true }, c: { none: true }, d: { none: true } }));
  tick(s, cfg, s.current.deadline); // tempo scaduto, nessuno ha offerto
  assert.equal(s.results[0].winnerId, 'a');
  assert.equal(s.results[0].price, 1);
  assert.equal(s.results[0].how, 'nessuna-offerta');
});

test('timeout del proprietario = rinuncia', () => {
  const s = toFirstLot(setup({ a: { player: 'Rossi', birthYear: 2006 }, b: { none: true }, c: { none: true }, d: { none: true } }));
  bid(s, cfg, 'b', 7, 1);
  tick(s, cfg, s.current.deadline); // chiude buste (c, d passano)
  assert.equal(s.current.step, 'decision');
  tick(s, cfg, s.current.deadline);
  assert.equal(s.results[0].winnerId, 'b');
});

test('parità: spareggio a buste, poi vince chi rilancia di più', () => {
  const s = toFirstLot(setup({ a: { player: 'Rossi', birthYear: 2006 }, b: { none: true }, c: { none: true }, d: { none: true } }));
  bid(s, cfg, 'b', 25, 1); bid(s, cfg, 'c', 25, 1); bid(s, cfg, 'd', 10, 1);
  assert.equal(view(s, cfg, 'd', 1).current.tiedCount, 2);
  decide(s, cfg, 'a', 'decline', 2);
  assert.equal(s.current.step, 'tiebreak');
  assert.deepEqual(s.current.eligible, ['b', 'c']);
  assert.throws(() => bid(s, cfg, 'd', 30, 3), GameError);
  assert.throws(() => bid(s, cfg, 'b', 25, 3), /più di 25/);
  bid(s, cfg, 'b', 30, 3);
  bid(s, cfg, 'c', 31, 3);
  assert.equal(s.results[0].winnerId, 'c');
  assert.equal(s.results[0].price, 31);
  assert.equal(s.results[0].how, 'spareggio');
});

test('parità ripetuta e poi nessun rilancio: sorteggio', () => {
  const s = toFirstLot(setup({ a: { player: 'Rossi', birthYear: 2006 }, b: { none: true }, c: { none: true }, d: { none: true } }));
  bid(s, cfg, 'b', 25, 1); bid(s, cfg, 'c', 25, 1); bid(s, cfg, 'd', 25, 1);
  decide(s, cfg, 'a', 'decline', 2);
  bid(s, cfg, 'b', 30, 3); bid(s, cfg, 'c', 30, 3); bid(s, cfg, 'd', null, 3);
  assert.equal(s.current.step, 'tiebreak');
  assert.deepEqual(s.current.eligible, ['b', 'c']);
  bid(s, cfg, 'b', null, 4); bid(s, cfg, 'c', null, 4);
  assert.equal(s.results[0].how, 'sorteggio');
  assert.equal(s.results[0].price, 30);
  assert.ok(['b', 'c'].includes(s.results[0].winnerId));
});

test('asta completa con più giocatori arriva a "done"', () => {
  const s = setup({
    a: { player: 'Rossi', birthYear: 2006 },
    b: { player: 'Bianchi', birthYear: 2005 },
    c: { none: true },
    d: { player: 'Verdi', birthYear: 2008 },
  });
  assert.equal(s.phase, 'auction');
  assert.equal(s.lots.length, 3);
  toFirstLot(s);
  tick(s, cfg, 10 ** 9); // tutto scade: nessuno offre
  assert.equal(s.phase, 'done');
  assert.equal(s.results.length, 3);
  assert.ok(s.results.every((r) => r.winnerId === r.ownerId && r.price === 1));
});

// ------------------------------------------------------------- API end-to-end

function memStore() {
  let data = null, etag = 0;
  return {
    async read() { return data ? { data: structuredClone(data), etag: String(etag) } : null; },
    async write(d, tag) {
      if ((tag === null && data) || (tag !== null && tag !== String(etag))) return false;
      data = structuredClone(d); etag++; return true;
    },
  };
}

test('API: PIN, dichiarazioni concorrenti, buste', async () => {
  let now = 1000;
  const api = createApi({ store: memStore(), config: cfg, clock: () => now, rng: noShuffle });
  const call = async (method, path, team, pin, body) => {
    const r = await api.handle(new Request(`http://x/api/${path}`, {
      method,
      headers: { 'x-team': team || '', 'x-pin': pin || '', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }));
    return { status: r.status, body: await r.json() };
  };
  for (const t of ['a', 'b', 'c', 'd']) {
    const r = await call('POST', 'login', null, null, { team: t, pin: '1234' });
    assert.equal(r.body.created, true);
  }
  assert.equal((await call('POST', 'login', null, null, { team: 'a', pin: '9999' })).status, 401);
  assert.equal((await call('POST', 'declare', 'a', '0000', { none: true })).status, 401);

  // tutti dichiarano contemporaneamente
  const rs = await Promise.all([
    call('POST', 'declare', 'a', '1234', { player: 'Rossi', birthYear: 2006 }),
    call('POST', 'declare', 'b', '1234', { none: true }),
    call('POST', 'declare', 'c', '1234', { none: true }),
    call('POST', 'declare', 'd', '1234', { none: true }),
  ]);
  assert.ok(rs.every((r) => r.status === 200));
  let st = await call('GET', 'state', 'b', '1234');
  assert.equal(st.body.phase, 'auction');
  assert.equal(st.body.current.step, 'intro');

  now += 10 ** 7; // il tempo passa ma senza "pronto" non si parte
  st = await call('GET', 'state', 'b', '1234');
  assert.equal(st.body.current.step, 'intro');
  await Promise.all(['a', 'b', 'c'].map((t) => call('POST', 'ready', t, '1234', {})));
  st = await call('GET', 'state', 'b', '1234');
  assert.equal(st.body.current.step, 'intro');
  assert.deepEqual(st.body.current.ready.sort(), ['a', 'b', 'c']);
  await call('POST', 'ready', 'd', '1234', {});
  st = await call('GET', 'state', 'b', '1234');
  assert.equal(st.body.current.step, 'bidding');

  await Promise.all([
    call('POST', 'bid', 'b', '1234', { amount: 25 }),
    call('POST', 'bid', 'c', '1234', { amount: 12 }),
    call('POST', 'bid', 'd', '1234', { amount: null }),
  ]);
  st = await call('GET', 'state', 'a', '1234');
  assert.equal(st.body.current.step, 'decision');
  assert.equal(st.body.current.high, 25);
  const r = await call('POST', 'decide', 'a', '1234', { choice: 'confirm' });
  assert.equal(r.status, 200);
  assert.equal(r.body.results[0].price, 26);
  now += 10_000;
  st = await call('GET', 'state', null, null);
  assert.equal(st.body.phase, 'done');
});

test('con le rose: solo giocatori della propria rosa, anno noto precompilato', () => {
  const rc = {
    ...cfg,
    teams: [
      { id: 'a', name: 'A', players: [{ name: 'Yildiz', cost: 70, role: 'W T', club: 'Juventus' }, { name: 'Nuovo', cost: 3 }] },
      { id: 'b', name: 'B', players: [{ name: 'Maignan', cost: 51 }] },
    ],
    birthYears: { Yildiz: 2005 },
  };
  const s = newState(rc, 0);
  assert.throws(() => declare(s, rc, 'a', { player: 'Maignan', birthYear: 2006 }, 0), /rosa/);
  declare(s, rc, 'a', { player: 'Yildiz', birthYear: 1990 }, 0); // anno ignorato: noto
  assert.equal(s.declarations.a.birthYear, 2005);
  assert.equal(s.declarations.a.cost, 70);
  assert.equal(s.declarations.a.role, 'W T');
  assert.equal(s.declarations.a.club, 'Juventus');
  assert.throws(() => declare(s, rc, 'a', { player: 'Nuovo', birthYear: 2001 }, 0), /giovane/);
  declare(s, rc, 'a', { player: 'Nuovo', birthYear: 2008 }, 0);
  assert.equal(s.declarations.a.birthYear, 2008);
  const v = view(s, rc, 'a', 0);
  assert.equal(v.myRoster.find((p) => p.name === 'Yildiz').birthYear, 2005);
  assert.equal(v.teams[0].players, undefined);
});

test('config reale: 10 squadre con rose caricate', async () => {
  const { default: league } = await import('../config/league.mjs');
  assert.equal(league.teams.length, 10);
  assert.equal(new Set(league.teams.map((t) => t.id)).size, 10);
  assert.ok(league.teams.every((t) => t.players.length > 0));
});
