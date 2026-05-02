// One-shot script: translate every location's title + description into en/ja/ko
// using the free Google Translate web endpoint, and write the results back into
// public/locations.json under `titles` and `descriptions` maps.
//
// Re-running is cheap: any (title, lang) pair that already has a translation
// is skipped, so you only pay for newly added locations.
//
// Usage:  node scripts/pretranslate.mjs

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FILE = path.resolve('public/locations.json');
const TARGET_LANGS = ['en', 'ja', 'ko'];
const REQUEST_DELAY_MS = 150;

async function translate(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data[0].map((item) => item[0]).join('');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const raw = await readFile(FILE, 'utf-8');
  const locations = JSON.parse(raw);
  console.log(`Loaded ${locations.length} locations`);

  let translated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const tag = `[${i + 1}/${locations.length}]`;

    if (loc.title && loc.title.trim()) {
      if (!loc.titles) loc.titles = {};
      for (const lang of TARGET_LANGS) {
        if (loc.titles[lang]) { skipped++; continue; }
        try {
          loc.titles[lang] = await translate(loc.title, lang);
          translated++;
          console.log(`${tag} title->${lang}: ${loc.title.slice(0, 40)} => ${loc.titles[lang].slice(0, 40)}`);
          await sleep(REQUEST_DELAY_MS);
        } catch (e) {
          failed++;
          console.error(`${tag} title->${lang} FAILED: ${e.message}`);
        }
      }
    }

    if (loc.description && loc.description.trim()) {
      if (!loc.descriptions) loc.descriptions = {};
      for (const lang of TARGET_LANGS) {
        if (loc.descriptions[lang]) { skipped++; continue; }
        try {
          loc.descriptions[lang] = await translate(loc.description, lang);
          translated++;
          console.log(`${tag} desc->${lang}: ${loc.description.slice(0, 40)}...`);
          await sleep(REQUEST_DELAY_MS);
        } catch (e) {
          failed++;
          console.error(`${tag} desc->${lang} FAILED: ${e.message}`);
        }
      }
    }
  }

  await writeFile(FILE, JSON.stringify(locations));
  console.log(`\nDone. translated=${translated} skipped=${skipped} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
