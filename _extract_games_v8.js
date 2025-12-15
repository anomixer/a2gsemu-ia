const fs = require('fs');

const HTML_PATH = 'index_emularity_v8.html';
const OUT_JS_PATH = 'games_v8.js';

const html = fs.readFileSync(HTML_PATH, 'utf8');

const match = html.match(/const games = \[([\s\S]*?)\r?\n\s*\];/);
if (!match) {
  throw new Error('games array not found');
}

const arrBody = match[1];
const jsOut = `window.games = [${arrBody}\n];\n`;
fs.writeFileSync(OUT_JS_PATH, jsOut, 'utf8');

let patched = html.replace(/const games = \[[\s\S]*?\r?\n\s*\];/, 'const games = window.games;');

const loaderTag = '<script src="./loader.js"></script>';
const gamesTag = '<script src="./games_v8.js"></script>';

if (!patched.includes(loaderTag)) {
  throw new Error('loader.js script tag not found');
}

if (!patched.includes(gamesTag)) {
  patched = patched.replace(loaderTag, `${loaderTag}\r\n    ${gamesTag}`);
}

fs.writeFileSync(HTML_PATH, patched, 'utf8');
console.log('OK');
