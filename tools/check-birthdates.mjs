// Controlla che le date di nascita coprano le rose: npm run check-birthdates
import rosters from '../config/rosters.mjs';
import birthdates from '../config/birthdates.mjs';
const all = new Set(rosters.flatMap((t) => t.players.map((p) => p.name)));
for (const name of Object.keys(birthdates)) if (!all.has(name)) console.log(`⚠️  "${name}" non è in nessuna rosa`);
for (const t of rosters) {
  const missing = t.players.filter((p) => !birthdates[p.name]).map((p) => p.name);
  console.log(`${missing.length ? '…' : '✓'} ${t.name}: ${t.players.length - missing.length}/${t.players.length}${missing.length ? ` (mancano: ${missing.join(', ')})` : ''}`);
}
