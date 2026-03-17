#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://dpimap.org/data/';
const OUTPUT = path.resolve(__dirname, '../data/dpimap.raw.json');

async function run() {
  let payload = null;
  let fetchError = null;
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    fetchError = error.message;
  }

  const raw = {
    metadata: {
      source: 'dpimap',
      fetchedAt: new Date().toISOString(),
      url: SOURCE_URL,
      warning: fetchError ? `Remote fetch failed: ${fetchError}` : ''
    },
    payload: payload || { countries: [] }
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(raw, null, 2));
  console.log(`Wrote ${OUTPUT}`);
}

run();
