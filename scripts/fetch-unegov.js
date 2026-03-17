#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SOURCE_URL = 'https://publicadministration.un.org/egovkb/en-us/Data-Center';
const BASELINE = path.resolve(__dirname, '../country-metadata-baseline.json');
const OUTPUT = path.resolve(__dirname, '../data/unegov.raw.json');

function run() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const countries = (baseline.countries || []).map((entry) => ({
    name: entry.meta.countryName,
    iso3: entry.meta.isoCode,
    region: entry.meta.region || '',
    egdi: entry.meta.unEgovIndex,
    rank: entry.meta.unEgovRank,
    osi: null,
    tcii: null,
    hcii: null
  }));

  const raw = {
    metadata: {
      source: 'un-egov',
      fetchedAt: new Date().toISOString(),
      url: SOURCE_URL,
      note: 'This repository currently snapshots UN-related values from country-metadata-baseline.json. Replace this script with a direct parser when a machine-readable EGDI export is available.'
    },
    countries
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(raw, null, 2));
  console.log(`Wrote ${OUTPUT}`);
}

run();
