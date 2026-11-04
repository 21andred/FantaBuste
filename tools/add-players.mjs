// Aggiunge/aggiorna i dati dei giocatori da una tabella incollata (separata da tab, con intestazione).
// Colonne riconosciute (in qualsiasi ordine): Ruolo, Nome, Squadra, Data di nascita
// Uso: npm run add-players -- tabella.tsv
// Riscrive config/players.mjs raggruppando i giocatori per squadra del fantacalcio.
import { readFile, writeFile } from 'node:fs/promises';
import rosters from '../config/rosters.mjs';
import players from '../config/players.mjs';

const file = process.argv[2];
if (!file) { console.error('Uso: npm run add-players -- tabella.tsv'); process.exit(1); }

const lines = (await readFile(file, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const head = lines[0].split('\t').map((h) => h.trim().toLowerCase());
const col = (re) => head.findIndex((h) => re.test(h));
const iName = col(/^nome/), iRole = col(/^ruol/), iClub = col(/^squadra/), iBorn = col(/nascita|^nato/);
if (iName < 0) throw new Error('Manca la colonna "Nome" nell\'intestazione.');

const data = structuredClone(players);
let updated = 0;
for (const line of lines.slice(1)) {
  const c = line.split('\t').map((x) => x.trim());
  const name = c[iName];
  if (!name) continue;
  const p = (data[name] ||= {});
  if (iBorn >= 0 && c[iBorn]) {
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c[iBorn])) throw new Error(`Data non valida per ${name}: "${c[iBorn]}" (usa gg/mm/aaaa)`);
    p.nato = c[iBorn];
  }
  if (iRole >= 0 && c[iRole]) p.ruolo = c[iRole];
  if (iClub >= 0 && c[iClub]) p.squadra = c[iClub];
  updated++;
}

// riscrittura raggruppata per squadra
const fmt = (name, p) => `  ${JSON.stringify(name)}: { ${['nato', 'ruolo', 'squadra'].filter((k) => p[k]).map((k) => `${k}: ${JSON.stringify(p[k])}`).join(', ')} },`;
const used = new Set();
const blocks = [];
for (const t of rosters) {
  const rows = t.players.filter((p) => data[p.name]).map((p) => (used.add(p.name), fmt(p.name, data[p.name])));
  if (rows.length) blocks.push(`  // --- ${t.name}\n${rows.join('\n')}`);
}
const orphans = Object.keys(data).filter((n) => !used.has(n));
if (orphans.length) blocks.push(`  // --- Non presenti nelle rose attuali\n${orphans.map((n) => fmt(n, data[n])).join('\n')}`);

await writeFile(new URL('../config/players.mjs', import.meta.url), `// Dati dei giocatori, con il nome esattamente come nelle rose.
// nato: gg/mm/aaaa — ruolo: ruoli Mantra — squadra: squadra di Serie A
// L'anno di nascita serve a sapere chi è "giovane". Per i giocatori che NON sono qui,
// chi dichiara inserisce l'anno a mano (e tutti lo vedono quando si aprono le dichiarazioni).
// Aggiornamento: npm run add-players -- tabella.tsv — Controllo: npm run check-players
export default {
${blocks.join('\n\n')}
};
`);
console.log(`${updated} giocatori aggiornati.`);
if (orphans.length) console.log(`⚠️  Non trovati in nessuna rosa: ${orphans.join(', ')}`);
