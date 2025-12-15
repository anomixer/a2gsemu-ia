const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

function parseArgs(argv) {
  const args = { out: path.join(__dirname, 'games_v8.js'), rows: 200, start: 0, all: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--games-only') args.all = false;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--rows') args.rows = parseInt(argv[++i], 10);
    else if (a === '--start') args.start = parseInt(argv[++i], 10);
  }
  if (!Number.isFinite(args.rows) || args.rows <= 0) args.rows = 200;
  if (!Number.isFinite(args.start) || args.start < 0) args.start = 0;
  return args;
}

function cleanTitle(title) {
  if (!title) return '';
  return String(title)
    .replace(/\s*\(woz-a-day collection\)\s*$/i, '')
    .trim();
}

function guessTypeFromTitle(title) {
  const t = String(title || '').toLowerCase();
  const eduHints = [
    'reader rabbit', 'stickybear', 'math', 'typing', 'spelling', 'phonics', 'alphabet',
    'shapes', 'learning', 'lesson', 'school', 'workbook', 'word problems'
  ];
  for (const h of eduHints) {
    if (t.includes(h)) return 'edu';
  }
  const nonGameHints = [
    'utility', 'tool', 'editor', 'font', 'driver', 'system', 'installer', 'patch', 'update',
    'manual', 'reference', 'dictionary', 'thesaurus', 'spreadsheet', 'word processor',
    'tutorial', 'education', 'workshop',
    'demo', 'intro', 'presentation'
  ];
  for (const h of nonGameHints) {
    if (t.includes(h)) return 'tool';
  }
  return 'game';
}

function typeWeight(type) {
  switch (type) {
    case 'game': return 0;
    case 'edu': return 1;
    case 'tool': return 2;
    case 'special': return 3;
    default: return 9;
  }
}

function pickPlayableFiles(meta) {
  const md = (meta && meta.metadata) || {};
  const files = Array.isArray(meta.files) ? meta.files : [];

  const file = md.mame_peripheral_flop3 || files.find(f => /^00playable\.(woz|2mg)$/i.test(f.name))?.name;
  const file2 = md.mame_peripheral_flop4 || files.find(f => /^00playable2\.(woz|2mg)$/i.test(f.name))?.name;

  const screenshot = files.find(f => /^00playable_screenshot\.(png|jpg|jpeg)$/i.test(f.name))?.name
    || files.find(f => /screenshot\.(png|jpg|jpeg)$/i.test(f.name))?.name;

  return { file, file2, screenshot };
}

async function advancedSearch({ start, rows }) {
  const q = encodeURIComponent('collection:wozaday AND emulator:apple2gs AND mediatype:software');
  const url = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=emulator&rows=${rows}&start=${start}&output=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`advancedsearch failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchMetadata(identifier) {
  const url = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`metadata failed for ${identifier}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function main() {
  const args = parseArgs(process.argv);

  let start = args.start;
  const rows = Math.min(Math.max(args.rows, 50), 500);

  let numFound = null;
  const ids = [];

  while (numFound === null || start < numFound) {
    const page = await advancedSearch({ start, rows });
    const resp = page.response;
    if (!resp) break;
    if (numFound === null) numFound = resp.numFound;

    for (const d of resp.docs || []) {
      if (d && d.identifier && String(d.identifier).startsWith('wozaday_')) {
        ids.push({ id: d.identifier, title: d.title, emulator: d.emulator });
      }
    }

    start += rows;

    // soft limit to avoid accidental huge runs
    if (start > 10000) break;
  }

  const games = [];

  for (let i = 0; i < ids.length; i++) {
    const { id } = ids[i];
    try {
      const meta = await fetchMetadata(id);
      const md = meta.metadata || {};
      const title = cleanTitle(md.title || ids[i].title || id);
      const { file, file2, screenshot } = pickPlayableFiles(meta);
      const emu = md.emulator || ids[i].emulator || 'apple2gs';

      if (!file) continue;

      const type = guessTypeFromTitle(title);
      if (!args.all && type !== 'game') continue;

      games.push({
        id,
        emu,
        file,
        ...(file2 ? { file2 } : {}),
        ...(screenshot ? { screenshot } : {}),
        name: title,
        nameEn: title,
        year: md.year || md.date || '',
        type,
        desc: (md.description || '').replace(/\s+/g, ' ').trim(),
        developer: '',
        publisher: ''
      });
    } catch (e) {
      // keep going
    }
  }

  games.sort((a, b) => {
    const w = typeWeight(a.type) - typeWeight(b.type);
    if (w !== 0) return w;
    return String(a.nameEn).localeCompare(String(b.nameEn));
  });

  const out = `window.games = ${JSON.stringify(games, null, 2)};\n`;
  fs.writeFileSync(args.out, out, 'utf8');

  process.stdout.write(`Wrote ${games.length} entries to ${args.out}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
