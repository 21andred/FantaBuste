# FantaBuste

Sito per la **conferma dei giovani con asta a buste chiuse** del fantacalcio.
Tutti si collegano dal telefono nello stesso momento, ognuno con la propria squadra, e l'asta va avanti da sola: non serve un banditore.

## Come funziona l'asta

1. **Dichiarazione**: ogni squadra dichiara il giovane che vuole confermare (uno solo), oppure "nessuno".
   I nomi restano segreti finché non hanno dichiarato tutti. Il sito rifiuta chi non è giovane.
2. **Estrazione**: appena hanno dichiarato tutti, il sito estrae a sorte l'ordine e mostra l'elenco dei giocatori alle buste.
3. **Buste**: per ogni giocatore tutti tranne il proprietario consegnano un'offerta segreta (o passano).
   Il giro si chiude quando hanno risposto tutti o quando scade il tempo (chi non risponde passa).
4. **Apertura**: viene mostrata l'offerta più alta.
5. **Prelazione**: il proprietario sceglie se **confermare a offerta più alta +1** oppure **rinunciare**.
   Se il tempo scade senza una scelta vale come rinuncia.
6. **Assegnazione**: se rinuncia, il giocatore va al miglior offerente.
   In caso di **parità** si fa un nuovo giro di buste solo tra i pari merito (bisogna superare la cifra pari).
   Se nessuno rilancia, si sorteggia.
7. **Nessuna offerta**: il giocatore resta al proprietario a 1 credito.

Le buste sono custodite sul server (Netlify Functions): nessuno può vedere le cifre altrui prima dell'apertura,
nemmeno con gli strumenti sviluppatore del browser. Dopo la chiusura di ogni giocatore vengono mostrate tutte le offerte.

## Configurazione

**Rose e squadre** — si importano dall'export Excel della lega (foglio `ROSE`, con le colonne "Squadra | costo"):

```bash
npm run import-rosters -- percorso/del/file.xlsx
```

Il comando rigenera [`config/rosters.mjs`](config/rosters.mjs). Rifatelo ogni volta che le rose cambiano
(mercato di gennaio, asta di settembre) e fate commit e push. Nella dichiarazione ogni squadra sceglie il giovane
da un menu con la propria rosa: non si può dichiarare un giocatore che non si ha.

**Anni di nascita** — in [`config/birthyears.mjs`](config/birthyears.mjs). I giocatori presenti lì hanno l'anno
precompilato e bloccato. Per gli altri lo inserisce chi dichiara, e tutti lo vedono quando si aprono le dichiarazioni.

**Regole e tempi** — in [`config/league.mjs`](config/league.mjs):

- `season`, `seasonStartYear`, `minBirthYear`: la stagione e da che anno di nascita si è "giovani"
  (ogni anno aumentate tutti e tre di 1);
- `managers`: nomi dei fantallenatori (facoltativi);
- `minBid`, `priceIfNoBids`: offerta minima e prezzo se nessuno offre;
- `timers`: secondi a disposizione per ogni fase.

**PIN**: al primo accesso ogni fantallenatore sceglie il PIN della propria squadra (4–8 cifre).
Conviene che lo facciano tutti qualche giorno prima dell'asta.

## Pubblicare su Netlify

1. Su [app.netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub** e scegli `FantaBuste`.
2. Lascia le impostazioni proposte (le legge da `netlify.toml`) e premi **Deploy**.
3. Facoltativo ma consigliato: in **Site configuration → Environment variables** aggiungi `RESET_KEY`
   con una parola segreta. Serve per azzerare l'asta dal sito (menu *Strumenti* in fondo alla pagina),
   per esempio dopo una prova o a inizio stagione. Dopo averla aggiunta rifai il deploy.

Lo stato dell'asta è salvato in Netlify Blobs (incluso nel piano gratuito). Ogni reset archivia lo stato precedente.

## Prove in locale

Serve Node.js 20 o più recente.

```bash
npm install
npm test             # test automatici del regolamento
npm run dev          # sito su http://localhost:8888 (chiave di reset: dev)
FAST=1 npm run dev   # come sopra ma con tutti i timer a 8 secondi
```

Per simulare più squadre apri più finestre in incognito (o browser diversi).

## Struttura

```
config/league.mjs         configurazione della lega
config/rosters.mjs        rose (generate dall'Excel)
config/birthyears.mjs     anni di nascita noti
tools/import-rosters.mjs  import delle rose dall'export Excel
lib/engine.mjs            regole dell'asta (logica pura, testata)
lib/server.mjs            API, PIN, gestione delle richieste contemporanee
netlify/functions/api.mjs funzione Netlify che collega le API a Netlify Blobs
public/                   il sito (HTML, CSS, JS senza framework)
test/                     test automatici
dev-server.mjs            server locale per le prove
```
