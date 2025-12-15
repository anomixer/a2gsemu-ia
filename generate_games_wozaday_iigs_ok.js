const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// --- Configuration & Helpers ---

function parseArgs(argv) {
  const args = {
    out: path.join(__dirname, 'games_v8.js'),
    cache: path.join(__dirname, 'wozaday_metadata_cache.json'),
    rows: 200, // batch size for advanced search
    start: 0,
    all: true,
    concurrency: 5,
    limit: 0 // 0 = no limit
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--games-only') args.all = false;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--cache') args.cache = argv[++i];
    else if (a === '--rows') args.rows = parseInt(argv[++i], 10);
    else if (a === '--start') args.start = parseInt(argv[++i], 10);
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
  }

  if (!Number.isFinite(args.concurrency) || args.concurrency < 1) args.concurrency = 1;
  if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = 0;

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
    'shapes', 'learning', 'lesson', 'school', 'workbook', 'word problems', 'bannermania'
  ];
  for (const h of eduHints) {
    if (t.includes(h)) return 'edu';
  }
  const nonGameHints = [
    'utility', 'tool', 'editor', 'font', 'driver', 'system', 'installer', 'patch', 'update',
    'manual', 'reference', 'dictionary', 'thesaurus', 'spreadsheet', 'word processor',
    'tutorial', 'education', 'workshop',
    'demo', 'intro', 'presentation',
    'appleworks', 'writer', 'productivity', 'database', 'paint', 'draw', 'graphics',
    'music', 'sound', 'studio', 'hyperstudio', 'hypercard', 'clip art', 'desktop'
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

// --- API ---

async function advancedSearch({ start, rows }) {
  const q = encodeURIComponent('collection:wozaday AND emulator:apple2gs AND mediatype:software');
  const url = `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&fl[]=title&fl[]=emulator&sort[]=identifier+asc&rows=${rows}&start=${start}&output=json`;
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

// --- Caching ---

function loadCache(cachePath) {
  if (fs.existsSync(cachePath)) {
    try {
      console.log(`Loading cache from ${cachePath}...`);
      return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    } catch (e) {
      console.warn('Failed to load cache:', e.message);
    }
  }
  return {};
}

function saveCache(cachePath, cache) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.warn('Failed to save cache:', e.message);
  }
}

// --- Main Logic ---

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Starting generation with:
  Concurrency: ${args.concurrency}
  Cache: ${args.cache}
  Output: ${args.out}
  Limit: ${args.limit || 'None (Fetch all)'}
  Games Only: ${!args.all}`);

  // 1. Fetch all Identifiers first (Pagination is fast)
  console.log('Fetching list of identifiers...');
  let start = args.start;
  const rows = Math.min(Math.max(args.rows, 50), 500);
  let numFound = null;
  const allIds = [];
  const seenIds = new Set();

  while (numFound === null || start < numFound) {
    process.stdout.write(`\rFetching IDs... ${start} / ${numFound || '?'}`);
    const page = await advancedSearch({ start, rows });
    const resp = page.response;
    if (!resp) break;
    if (numFound === null) numFound = resp.numFound;

    for (const d of resp.docs || []) {
      if (d && d.identifier && String(d.identifier).startsWith('wozaday_')) {
        if (!seenIds.has(d.identifier)) {
          seenIds.add(d.identifier);
          allIds.push({ id: d.identifier, title: d.title, emulator: d.emulator });
        }
      }
    }

    start += rows;
    if (args.limit > 0 && allIds.length >= args.limit) {
      console.log(`\nHit limit of ${args.limit} items.`);
      break;
    }
    if (start > 10000) break; // Safety break
  }
  console.log(`\nTotal items to process: ${allIds.length}`);

  if (args.limit > 0) {
    allIds.splice(args.limit);
  }

  // 2. Load Cache
  const cache = loadCache(args.cache);
  let cacheDirty = false;
  let cacheSaveCounter = 0;

  // 3. Process items (Concurrency)
  const games = [];
  const itemsToProcess = allIds;

  // Simple Work Queue
  let curIndex = 0;
  let completedCount = 0;

  const worker = async (workerId) => {
    while (curIndex < itemsToProcess.length) {
      const index = curIndex++;
      const item = itemsToProcess[index];
      const { id } = item;

      let meta = cache[id];

      if (!meta) {
        // Fetch
        try {
          // console.log(`[W${workerId}] Fetching ${id}...`);
          meta = await fetchMetadata(id);
          // Add to cache
          cache[id] = meta;
          cacheDirty = true;
          cacheSaveCounter++;
        } catch (e) {
          console.error(`\n[W${workerId}] Failed to fetch ${id}:`, e.message);
          continue; // Skip this item
        }
      } else {
        // console.log(`[W${workerId}] Cache hit ${id}`);
      }

      // Save cache periodically
      if (cacheSaveCounter >= 50) {
        saveCache(args.cache, cache);
        cacheSaveCounter = 0;
        cacheDirty = false;
      }

      // Transform to Game Object
      try {
        const md = meta.metadata || {};
        const title = cleanTitle(md.title || item.title || id);
        const { file, file2, screenshot } = pickPlayableFiles(meta);
        const emu = md.emulator || item.emulator || 'apple2gs';

        if (file) {
          const type = guessTypeFromTitle(title);
          if (args.all || type === 'game') {
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
          }
        }
      } catch (err) {
        console.warn(`\nError processing ${id}:`, err.message);
      }

      completedCount++;
      if (completedCount % 10 === 0 || completedCount === itemsToProcess.length) {
        process.stdout.write(`\rProgress: ${completedCount} / ${itemsToProcess.length} items processed.`);
      }
    }
  };

  const workers = [];
  for (let i = 0; i < args.concurrency; i++) {
    workers.push(worker(i + 1));
  }

  await Promise.all(workers);

  // Final Cache Save
  if (cacheDirty || cacheSaveCounter > 0) {
    console.log('\nSaving final cache...');
    saveCache(args.cache, cache);
  }

  console.log('\nSorting and writing output...');

  games.sort((a, b) => {
    const w = typeWeight(a.type) - typeWeight(b.type);
    if (w !== 0) return w;
    return String(a.nameEn).localeCompare(String(b.nameEn));
  });

  const out = `window.games = ${JSON.stringify(games, null, 2)};\n`;
  fs.writeFileSync(args.out, out, 'utf8');

  console.log(`\n✅ Done! Wrote ${games.length} entries to ${args.out}`);
  console.log(`Cache saved to ${args.cache} (${Object.keys(cache).length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
