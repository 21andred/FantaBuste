// ============================================================
//  CONFIGURAZIONE DELLA LEGA — modifica qui e fai push su GitHub
// ============================================================

export default {
  // Stagione a cui si riferisce l'asta dei giovani
  season: '2026/27',
  // Anno di inizio della stagione (per calcolare fino a quando un giocatore resta "giovane")
  seasonStartYear: 2026,
  // Sono "giovani" i nati in questo anno o dopo. Aumentalo di 1 ogni stagione.
  minBirthYear: 2005,

  // Squadre: "id" deve essere unico, senza spazi, e NON va cambiato a stagione in corso
  teams: [
    { id: 'squadra1', name: 'Squadra 1', manager: 'Fantallenatore 1' },
    { id: 'squadra2', name: 'Squadra 2', manager: 'Fantallenatore 2' },
    { id: 'squadra3', name: 'Squadra 3', manager: 'Fantallenatore 3' },
    { id: 'squadra4', name: 'Squadra 4', manager: 'Fantallenatore 4' },
    { id: 'squadra5', name: 'Squadra 5', manager: 'Fantallenatore 5' },
    { id: 'squadra6', name: 'Squadra 6', manager: 'Fantallenatore 6' },
    { id: 'squadra7', name: 'Squadra 7', manager: 'Fantallenatore 7' },
    { id: 'squadra8', name: 'Squadra 8', manager: 'Fantallenatore 8' },
  ],

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
