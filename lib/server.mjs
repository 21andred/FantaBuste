// Gestione delle richieste HTTP, indipendente da Netlify (testabile con uno store in memoria).
import { createHash, timingSafeEqual } from 'node:crypto';
import { GameError, newState, tick, declare, bid, decide, view } from './engine.mjs';

const KEY = 'state';

function hashPin(teamId, pin) {
  return createHash('sha256').update(`fantabuste:${teamId}:${pin}`).digest('hex');
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * store deve offrire:
 *   read()  -> Promise<{ data, etag } | null>
 *   write(data, etag|null) -> Promise<boolean>   (false se qualcun altro ha scritto prima)
 */
export function createApi({ store, config, clock = () => Date.now(), rng = Math.random, resetKey = '' }) {
  async function load(now) {
    let rec = await store.read();
    if (!rec) {
      await store.write(newState(config, now), null);
      rec = await store.read();
    }
    return rec;
  }

  /** Legge-modifica-scrive con controllo di concorrenza ottimistico. */
  async function mutate(fn, { writeAlways = true } = {}) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const now = clock();
      const rec = await load(now);
      const state = rec.data;
      const ticked = tick(state, config, now, rng);
      const result = fn ? fn(state, now) : undefined;
      if (!ticked && !(fn && writeAlways)) return { state, now, result };
      if (await store.write(state, rec.etag)) return { state, now, result };
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 80));
    }
    throw new GameError('Troppe richieste contemporanee, riprova.');
  }

  function auth(state, teamId, pin) {
    if (!teamId) return null;
    if (!config.teams.some((t) => t.id === teamId)) throw new GameError('Squadra sconosciuta.');
    const stored = state.pins[teamId];
    if (!stored) throw new GameError('Questa squadra non ha ancora un PIN: fai il primo accesso.');
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(hashPin(teamId, String(pin ?? '')), 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'PIN errato.');
    return teamId;
  }

  async function handle(req) {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const teamId = req.headers.get('x-team') || '';
    const pin = req.headers.get('x-pin') || '';
    let body = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }

    try {
      if (req.method === 'GET' && route === 'state') {
        const { state, now } = await mutate(null);
        let me = null;
        try { me = auth(state, teamId, pin); } catch { me = null; }
        return json(200, view(state, config, me, now));
      }

      if (req.method !== 'POST') return json(404, { error: 'Not found' });

      if (route === 'login') {
        const id = String(body.team || '');
        const p = String(body.pin || '');
        if (!config.teams.some((t) => t.id === id)) throw new GameError('Squadra sconosciuta.');
        if (!/^\d{4,8}$/.test(p)) throw new GameError('Il PIN deve avere da 4 a 8 cifre.');
        const { result } = await mutate((state) => {
          if (!state.pins[id]) {
            state.pins[id] = hashPin(id, p);
            return 'created';
          }
          auth(state, id, p);
          return 'ok';
        });
        return json(200, { ok: true, created: result === 'created' });
      }

      if (route === 'declare' || route === 'bid' || route === 'decide') {
        const { state, now } = await mutate((state, now) => {
          const me = auth(state, teamId, pin);
          if (!me) throw new HttpError(401, 'Accesso richiesto.');
          if (route === 'declare') declare(state, config, me, body, now, rng);
          if (route === 'bid') bid(state, config, me, body.amount ?? null, now, rng);
          if (route === 'decide') decide(state, config, me, body.choice, now, rng);
        });
        return json(200, view(state, config, teamId, now));
      }

      if (route === 'reset') {
        if (!resetKey) throw new GameError('Reset disattivato: imposta la variabile RESET_KEY su Netlify.');
        if (String(body.key || '') !== resetKey) throw new HttpError(403, 'Chiave di reset errata.');
        const { result } = await mutate((state, now) => {
          const fresh = newState(config, now);
          if (body.keepPins !== false) fresh.pins = state.pins;
          const archive = { ...state, pins: undefined };
          for (const k of Object.keys(state)) delete state[k];
          Object.assign(state, fresh);
          return archive;
        });
        if (store.archive) await store.archive(result);
        return json(200, { ok: true });
      }

      return json(404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: err.message });
      if (err instanceof GameError) return json(400, { error: err.message });
      console.error(err);
      return json(500, { error: 'Errore del server.' });
    }
  }

  return { handle };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
