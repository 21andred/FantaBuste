// ============================================================
//  CONFIGURAZIONE DELLA LEGA — modifica qui e fai push su GitHub
// ============================================================
import rosters from './rosters.mjs';
import players from './players.mjs';

// Nomi dei fantallenatori (facoltativi), per nome squadra
const managers = {
  // 'Atletico Patagarru': 'Andrea',
};

const birthYear = (d) => (d ? Number(String(d).split('/').pop()) : null);

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default {
  // Stagione per cui si confermano i giovani (l'asta a buste si fa a settembre, prima dell'asta)
  season: '2027/28',
  // Anno di inizio di quella stagione
  seasonStartYear: 2027,
  // Sono "giovani" i nati in questo anno o dopo. Ogni stagione aumentate di 1 tutti e tre i valori.
  minBirthYear: 2005,

  // Squadre e rose: generate dall'export Excel con `npm run import-rosters -- file.xlsx`
  teams: rosters.map((t) => ({
    id: slug(t.name),
    name: t.name,
    manager: managers[t.name] || '',
    players: t.players.map((p) => ({
      ...p,
      role: players[p.name]?.ruolo || '',
      club: players[p.name]?.squadra || '',
    })),
  })),
  // Anni di nascita noti (da config/players.mjs)
  birthYears: Object.fromEntries(
    Object.entries(players).filter(([, p]) => p.nato).map(([name, p]) => [name, birthYear(p.nato)]),
  ),

  // Crediti di ogni squadra: dopo ogni aggiudicazione il sito mostra i crediti rimasti
  // (budget meno quanto speso dalla squadra in quest'asta delle buste)
  budget: 500,

  // Offerta minima in busta
  minBid: 1,
  // Prezzo a cui il proprietario tiene il giocatore se nessuno fa offerte
  priceIfNoBids: 1,

  // Tempi (in secondi)
  timers: {
    intro: 30,      // tempo per vedere l'elenco dei giocatori alle buste prima di iniziare
    bidding: 90,    // tempo per consegnare la busta
    decision: 120,  // tempo per il proprietario per decidere (scaduto = rinuncia)
    tiebreak: 60,   // tempo per il giro di spareggio in caso di parità
    result: 12,     // tempo in cui resta visibile il risultato prima del giocatore successivo
  },
};
