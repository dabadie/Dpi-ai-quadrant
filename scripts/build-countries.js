#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(root, p), 'utf8'));
const writeJson = (p, data) => fs.writeFileSync(path.resolve(root, p), JSON.stringify(data, null, 2));

const WEIGHTS = { dpimap: 0.7, egdi: 0.3 };

function normalizeCountryName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePillarStatus(value) {
  const s = normalizeCountryName(value);
  if (!s) return 'none';
  if (/(operational|live|launched|national|dpi|full|established)/.test(s)) return 'dpi_like';
  if (/(pilot|partial|wip|work in progress|planned|development)/.test(s)) return 'pilot';
  return 'none';
}

function normalizeDpimapCountry(rawCountry) {
  const digitalIdentity = rawCountry.digitalIdentity || rawCountry.digital_identity || rawCountry.identity || rawCountry.id || '';
  const payments = rawCountry.payments || rawCountry.payment || '';
  const dataExchange = rawCountry.dataExchange || rawCountry.data_exchange || rawCountry.interoperability || '';

  const pillars = {
    digitalIdentity: { status: normalizePillarStatus(digitalIdentity), label: String(digitalIdentity || ''), notes: '' },
    payments: { status: normalizePillarStatus(payments), label: String(payments || ''), notes: '' },
    dataExchange: { status: normalizePillarStatus(dataExchange), label: String(dataExchange || ''), notes: '' }
  };

  const statuses = Object.values(pillars).map((p) => p.status);
  return {
    name: rawCountry.name || rawCountry.country || '',
    iso2: (rawCountry.iso2 || '').toUpperCase(),
    iso3: (rawCountry.iso3 || rawCountry.isoCode || '').toUpperCase(),
    region: rawCountry.region || '',
    subregion: rawCountry.subregion || '',
    pillars,
    summary: {
      numPillars: statuses.filter((s) => s !== 'none').length,
      numDPILike: statuses.filter((s) => s === 'dpi_like').length,
      numPilot: statuses.filter((s) => s === 'pilot').length
    }
  };
}

function computeDpimapBaseScore(country) {
  const scoreMap = { dpi_like: 100, pilot: 50, none: 0 };
  const statuses = ['digitalIdentity', 'payments', 'dataExchange'].map((k) => country?.pillars?.[k]?.status || 'none');
  return statuses.reduce((sum, s) => sum + scoreMap[s], 0) / 3;
}

function normalizeUnegovDataset(raw) {
  return {
    metadata: {
      source: 'un-egov',
      year: String(new Date().getFullYear()),
      url: 'https://publicadministration.un.org/egovkb/en-us/Data-Center'
    },
    countries: (raw.countries || []).map((c) => ({
      name: c.name || '',
      iso2: (c.iso2 || '').toUpperCase(),
      iso3: (c.iso3 || '').toUpperCase(),
      region: c.region || '',
      egdi: c.egdi == null ? null : Number(c.egdi),
      osi: c.osi == null ? null : Number(c.osi),
      tcii: c.tcii == null ? null : Number(c.tcii),
      hcii: c.hcii == null ? null : Number(c.hcii),
      rank: c.rank == null ? null : Number(c.rank)
    }))
  };
}

function computeStateCapacityScore(country) {
  const egdi = Number(country?.egdi);
  if (!Number.isFinite(egdi)) return 0;
  return Math.max(0, Math.min(1, egdi)) * 100;
}

function computeDpiBaseScore(country) {
  return (WEIGHTS.dpimap * country._dpimapScore) + (WEIGHTS.egdi * country._egdiScore);
}

function computeAiBaseScore(country) {
  return 0.6 * country._egdiScore;
}

function computeConfidence(country) {
  if (country._hasDpimap && country._hasEgdi) return 'high';
  if (country._hasDpimap || country._hasEgdi) return 'medium';
  return 'low';
}

function computeDataCompleteness(country) {
  if (country._dpimapPillars === 3 && country._hasEgdi) return 'high';
  if (country._dpimapPillars > 0 || country._hasEgdi) return 'medium';
  return 'low';
}

function indexByKeys(countries, aliases) {
  const map = new Map();
  countries.forEach((c) => {
    if (c.iso3) map.set(c.iso3, c);
    if (c.iso2) map.set(c.iso2, c);
    const normalized = normalizeCountryName(c.name);
    if (normalized) map.set(normalized, c);
  });
  Object.entries(aliases).forEach(([name, iso3]) => map.set(normalizeCountryName(name), { iso3 }));
  return map;
}

function resolveMatch(base, index, aliases) {
  if (base.iso3 && index.has(base.iso3)) return index.get(base.iso3);
  if (base.iso2 && index.has(base.iso2)) return index.get(base.iso2);
  const n = normalizeCountryName(base.name);
  if (index.has(n)) {
    const candidate = index.get(n);
    if (candidate && candidate.iso3 && index.has(candidate.iso3)) return index.get(candidate.iso3);
    return candidate;
  }
  const aliasIso = aliases[n];
  if (aliasIso && index.has(aliasIso)) return index.get(aliasIso);
  return null;
}

function run() {
  const baseline = readJson('country-metadata-baseline.json');
  const dpimapRaw = readJson('data/dpimap.raw.json');
  const unegovRaw = readJson('data/unegov.raw.json');
  const aliases = readJson('data/country-aliases.json').aliases || {};

  const countriesBase = {
    countries: (baseline.countries || []).map((c) => ({
      name: c.meta.countryName,
      iso2: '',
      iso3: c.meta.isoCode,
      region: c.meta.region || '',
      subregion: c.meta.subregion || ''
    }))
  };

  const dpimapCountriesRaw = Array.isArray(dpimapRaw.payload?.countries)
    ? dpimapRaw.payload.countries
    : Array.isArray(dpimapRaw.payload)
      ? dpimapRaw.payload
      : [];

  const dpimapNormalized = {
    metadata: {
      source: 'dpimap',
      version: '',
      lastUpdated: dpimapRaw.metadata?.fetchedAt || new Date().toISOString(),
      url: 'https://dpimap.org/data/'
    },
    countries: dpimapCountriesRaw.map(normalizeDpimapCountry)
  };

  const unegovNormalized = normalizeUnegovDataset(unegovRaw);

  writeJson('data/dpimap.normalized.json', dpimapNormalized);
  writeJson('data/unegov.normalized.json', unegovNormalized);
  writeJson('data/countries.base.json', countriesBase);

  const dpimapIndex = indexByKeys(dpimapNormalized.countries, aliases);
  const unegovIndex = indexByKeys(unegovNormalized.countries, aliases);

  const enriched = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sources: ['dpimap', 'un-egov'],
      weights: WEIGHTS
    },
    countries: countriesBase.countries.map((base) => {
      const dpimap = resolveMatch(base, dpimapIndex, aliases);
      const unegov = resolveMatch(base, unegovIndex, aliases);
      const dpimapAvailable = !!(dpimap && dpimap.pillars);
      const unegovAvailable = !!(unegov && Number.isFinite(Number(unegov.egdi)));
      const dpimapScore = dpimapAvailable ? computeDpimapBaseScore(dpimap) : 0;
      const egdiScore = unegovAvailable ? computeStateCapacityScore(unegov) : 0;
      const tmp = {
        _hasDpimap: dpimapAvailable,
        _hasEgdi: unegovAvailable,
        _dpimapPillars: dpimapAvailable ? (dpimap.summary?.numPillars || 0) : 0,
        _dpimapScore: dpimapScore,
        _egdiScore: egdiScore
      };

      return {
        name: base.name,
        iso2: base.iso2,
        iso3: base.iso3,
        region: base.region,
        subregion: base.subregion,
        sources: {
          dpimap: {
            available: dpimapAvailable,
            pillars: dpimap?.pillars || {},
            summary: dpimap?.summary || {}
          },
          unegov: {
            available: unegovAvailable,
            egdi: unegov?.egdi ?? null,
            rank: unegov?.rank ?? null,
            osi: unegov?.osi ?? null,
            tcii: unegov?.tcii ?? null,
            hcii: unegov?.hcii ?? null
          }
        },
        derived: {
          dpiBaseScore: Number(computeDpiBaseScore(tmp).toFixed(2)),
          stateCapacityScore: Number(egdiScore.toFixed(2)),
          aiBaseScore: Number(computeAiBaseScore(tmp).toFixed(2)),
          confidence: computeConfidence(tmp),
          dataCompleteness: computeDataCompleteness(tmp),
          aiEstimated: true
        }
      };
    })
  };

  writeJson('data/countries.enriched.json', enriched);
  console.log('Built normalized and enriched datasets.');
}

run();
