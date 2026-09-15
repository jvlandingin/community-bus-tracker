#!/usr/bin/env node
// Writes the CARTO basemap key into config.txt from the CARTO_API_KEY
// environment variable, so the key can live in Netlify's build settings
// instead of in a public git repository.
//
// Run by netlify.toml before the test suites. Locally it does nothing
// unless you export CARTO_API_KEY yourself, which you would only do to
// reproduce a deploy.
//
// What this buys, and what it does not. It keeps the key out of the
// committed file, which is the difference that matters in practice:
// unattended bots trawl public repositories for keys, and this one is
// worth stealing because it spends a tile allowance. It does NOT make
// the key secret from anyone using the site. There is no build step to
// hide it in — config.txt is fetched by the browser, so the key is one
// devtools panel away on the deployed site, exactly as before. Hiding it
// from users would mean proxying every tile through a function, which is
// a different and much larger decision (see docs/ARCHITECTURE.md).
//
// Absent or blank is a normal outcome, not a failure: the deploy carries
// on and the map is watermarked, the same as a fork that never set it.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'config.txt');
const raw = process.env.CARTO_API_KEY;
const key = (raw || '').trim();

// Never print the key itself: build logs are not always private.
const masked = k => k.length <= 4 ? '*'.repeat(k.length)
  : k.slice(0, 4) + '*'.repeat(Math.min(k.length - 4, 12)) + ' (' + k.length + ' chars)';

if (!key) {
  console.log('CARTO_API_KEY not set; leaving config.txt alone. ' +
    'The map will work with CARTO\'s "API KEY REQUIRED" watermark. ' +
    'A key is free: https://carto.com/basemaps/apikey');
  process.exit(0);
}
// A key with a newline or a '#' in it would corrupt the file rather than
// fail, and the symptom would be a missing stop rather than a missing key.
if (/[\r\n#]/.test(key)) {
  console.error('CARTO_API_KEY contains a newline or "#", which config.txt cannot hold. Not writing it.');
  process.exit(1);
}

let text;
try {
  text = fs.readFileSync(FILE, 'utf8');
} catch (e) {
  console.error('cannot read config.txt: ' + e.message);
  process.exit(1);
}

// Match the line whatever it currently holds, so setting the variable
// also rotates a key that was committed once. There is exactly one such
// line; anything else means config.txt has drifted and is worth stopping for.
const re = /^CARTO_API_KEY[ \t]*=.*$/m;
const found = text.match(re);
if (!found) {
  console.error('config.txt has no CARTO_API_KEY line to write into. ' +
    'Copy the block from config-template.txt.');
  process.exit(1);
}
const had = found[0].split('=').slice(1).join('=').trim();
fs.writeFileSync(FILE, text.replace(re, 'CARTO_API_KEY = ' + key));
console.log('wrote CARTO_API_KEY into config.txt from the environment: ' + masked(key) +
  (had ? ' (replacing the one committed in the file)' : ''));
