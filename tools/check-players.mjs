// Controlla che i dati dei giocatori coprano le rose: npm run check-players
import rosters from '../config/rosters.mjs';
import players from '../config/players.mjs';
const all = new Set(rosters.flatMap((t) => t.players.map((p) => p.name)));
for (const name of Object.keys(players)) if (!all.has(name)) console.log(`⚠️  "${name}" non è in nessuna rosa`);
for (const t of rosters) {
  const miss = (f) => t.players.filter((p) => !players[p.name]?.[f]).map((p) => p.name);
  const noDate = miss('nato'), noRole = miss('ruolo');
  const ok = !noDate.length && !noRole.length;
  console.log(`${ok ? '✓' : '…'} ${t.name}: date ${t.players.length - noDate.length}/${t.players.length}, ruoli ${t.players.length - noRole.length}/${t.players.length}`);
  if (noDate.length && noDate.length < t.players.length) console.log(`    senza data: ${noDate.join(', ')}`);
  if (noRole.length && noRole.length < t.players.length) console.log(`    senza ruolo: ${noRole.join(', ')}`);
}
