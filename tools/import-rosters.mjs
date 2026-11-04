// Importa le rose dall'export Excel della lega (foglio "ROSE") e genera config/rosters.mjs
// Uso: npm run import-rosters -- percorso/del/file.xlsx
import readXlsxFile from 'read-excel-file/node';
import { writeFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run import-rosters -- percorso/del/file.xlsx');
  process.exit(1);
}

const sheets = await readXlsxFile(file);
const sheet = sheets.find((s) => String(s.sheet).toUpperCase() === 'ROSE') || sheets[0];
const rows = sheet.data ?? sheet;
const header = rows[0];
const teams = [];
for (let c = 0; c < header.length; c++) {
  if (header[c] && String(header[c + 1] ?? '').trim().toLowerCase() === 'costo') {
    teams.push({ col: c, name: String(header[c]).trim(), players: [] });
  }
}
if (!teams.length) throw new Error('Non trovo le squadre: la prima riga deve avere "Nome squadra | costo" per ogni squadra.');

for (const row of rows.slice(1)) {
  for (const t of teams) {
    const name = row[t.col];
    if (name == null || String(name).trim() === '' || String(name).trim().toLowerCase() === 'totale') continue;
    t.players.push({ name: String(name).trim(), cost: Number(row[t.col + 1]) || 0 });
  }
}

const data = teams.map(({ name, players }) => ({ name, players }));
const out = `// File generato da tools/import-rosters.mjs — non modificarlo a mano, rigenera dall'export Excel.
// Fonte: ${file.split(/[\\/]/).pop()} — generato il ${new Date().toISOString().slice(0, 10)}
export default ${JSON.stringify(data, null, 2)};
`;
await writeFile(new URL('../config/rosters.mjs', import.meta.url), out);
for (const t of data) console.log(`${t.name}: ${t.players.length} giocatori`);
