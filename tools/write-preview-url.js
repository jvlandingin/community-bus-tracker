#!/usr/bin/env node
// Points the link preview's picture at this deployment's own address.
//
// og:image has to be a full URL: most of the crawlers that build a preview
// card (Messenger's among them) will not resolve a relative one. index.html
// cannot know its own address, because the whole point of it is that a
// different route deploys the same file unchanged. So the committed value is
// the relative path, and this rewrites it at build time from the address
// Netlify hands every build.
//
// Run by netlify.toml before the test suites, so what they test is what gets
// published. Production builds use URL, the site's main address; deploy
// previews and branch deploys use DEPLOY_PRIME_URL, so a preview of a change
// to the picture shows the changed picture rather than the live one.
//
// Absent is a normal outcome, not a failure: run locally, or on a host that
// does not set these, it leaves the file alone and the preview card simply
// has no picture. Nothing else on the page depends on it.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'index.html');
const IMAGE = 'assets/icons/preview.png';

const env = process.env;
const raw = (env.CONTEXT === 'production' ? env.URL : env.DEPLOY_PRIME_URL) || env.URL || '';
const base = raw.trim().replace(/\/+$/, '');

if (!base) {
  console.log('No URL from the build environment; leaving og:image relative. ' +
    'Link previews will have no picture, which is the only thing this affects.');
  process.exit(0);
}
// Whatever is written lands inside an HTML attribute. Anything that is not a
// plain http(s) origin is not what Netlify sends, and worth stopping for.
if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) {
  console.error('the build URL does not look like a site address, not writing it: ' + JSON.stringify(base));
  process.exit(1);
}

let html;
try {
  html = fs.readFileSync(FILE, 'utf8');
} catch (e) {
  console.error('cannot read index.html: ' + e.message);
  process.exit(1);
}

// Exactly one such tag. Matching whatever it holds, rather than only the
// relative path, keeps a second run idempotent.
const re = /<meta property="og:image" content="[^"]*">/;
if (!re.test(html)) {
  console.error('index.html has no og:image tag to write into.');
  process.exit(1);
}
html = html.replace(re, '<meta property="og:image" content="' + base + '/' + IMAGE + '">');
fs.writeFileSync(FILE, html);
console.log('pointed og:image at ' + base + '/' + IMAGE);
