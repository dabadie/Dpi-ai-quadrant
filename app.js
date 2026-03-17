const MANUAL_KEY = 'dpiAiManualOverridesV2';

let baseCountries = [];
let manualOverrides = {};
let mergedCountries = [];
let selectedIso3 = null;

async function loadBaseCountries() {
  const response = await fetch('./data/countries.enriched.json');
  if (!response.ok) throw new Error(`Failed to load countries.enriched.json (${response.status})`);
  const data = await response.json();
  return data.countries || [];
}

function loadManualOverrides() {
  const raw = localStorage.getItem(MANUAL_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function saveManualOverrides() {
  localStorage.setItem(MANUAL_KEY, JSON.stringify(manualOverrides));
}

function computeFinal(country, manual) {
  const m = manual || {};
  const dpi = Number(m?.final?.dpiScore ?? country.derived.dpiBaseScore);
  const ai = Number(m?.final?.aiScore ?? country.derived.aiBaseScore);
  const quadrant = `${dpi >= 50 ? 'High DPI' : 'Low DPI'} / ${ai >= 50 ? 'High AI' : 'Low AI'}`;
  return {
    dpiScore: Number(dpi.toFixed(2)),
    aiScore: Number(ai.toFixed(2)),
    quadrant,
    aboveEquator: dpi >= 50,
    goldenZone: dpi >= 70 && ai >= 70
  };
}

function mergeCountryData(baseCountry) {
  const manual = manualOverrides[baseCountry.iso3] || { manual: {}, final: {} };
  return {
    ...baseCountry,
    manual: {
      dpiOverrides: manual.manual?.dpiOverrides || {},
      aiOverrides: manual.manual?.aiOverrides || {},
      notes: manual.manual?.notes || '',
      tags: manual.manual?.tags || [],
      evaluator: manual.manual?.evaluator || '',
      updatedAt: manual.manual?.updatedAt || ''
    },
    final: computeFinal(baseCountry, manual)
  };
}

function deterministicNarrative(country) {
  const mode = country.manual.updatedAt ? 'manual-adjusted' : 'auto-estimated';
  return `${country.name} currently sits in ${country.final.quadrant}. Confidence is ${country.derived.confidence}, completeness is ${country.derived.dataCompleteness}, and scoring mode is ${mode}.`;
}

function getVisibleCountries() {
  const search = document.getElementById('search').value.trim().toLowerCase();
  const region = document.getElementById('filter-region').value;
  const confidence = document.getElementById('filter-confidence').value;
  const completeness = document.getElementById('filter-completeness').value;
  const showIncomplete = document.getElementById('show-incomplete').checked;

  return mergedCountries.filter((c) => {
    if (region !== 'all' && c.region !== region) return false;
    if (confidence !== 'all' && c.derived.confidence !== confidence) return false;
    if (completeness !== 'all' && c.derived.dataCompleteness !== completeness) return false;
    if (!showIncomplete && c.derived.dataCompleteness !== 'high') return false;
    if (search) {
      const hay = `${c.name} ${c.iso2} ${c.iso3}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function drawScatter(countries) {
  const canvas = document.getElementById('scatterplot');
  const ctx = canvas.getContext('2d');
  const pad = 40;
  const x = (v) => pad + (v / 100) * (canvas.width - 2 * pad);
  const y = (v) => canvas.height - pad - (v / 100) * (canvas.height - 2 * pad);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#d0d8e4';
  for (let i = 0; i <= 10; i += 1) {
    const p = i * 10;
    ctx.beginPath(); ctx.moveTo(x(p), y(0)); ctx.lineTo(x(p), y(100)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x(0), y(p)); ctx.lineTo(x(100), y(p)); ctx.stroke();
  }

  countries.forEach((c) => {
    ctx.beginPath();
    ctx.arc(x(c.final.aiScore), y(c.final.dpiScore), 4, 0, Math.PI * 2);
    ctx.fillStyle = c.derived.confidence === 'high' ? '#1f6d8c' : c.derived.confidence === 'medium' ? '#946b1c' : '#b44747';
    ctx.fill();
  });
}

function renderTable() {
  const countries = getVisibleCountries();
  const tbody = document.querySelector('#countries-table tbody');
  tbody.innerHTML = countries.map((c) => `<tr data-iso3="${c.iso3}">
      <td>${c.name}</td><td>${c.iso3}</td><td>${c.region || '-'}</td>
      <td>${c.final.dpiScore}</td><td>${c.final.aiScore}</td>
      <td>${c.derived.confidence}</td><td>${c.derived.dataCompleteness}</td><td>${c.final.quadrant}</td>
    </tr>`).join('');
  drawScatter(countries);

  tbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => {
      selectedIso3 = row.dataset.iso3;
      renderDetail();
    });
  });
}

function renderDetail() {
  const container = document.getElementById('detail-content');
  const country = mergedCountries.find((c) => c.iso3 === selectedIso3);
  if (!country) {
    container.textContent = 'Select a country.';
    return;
  }
  container.innerHTML = `
    <h3>${country.name} (${country.iso3})</h3>
    <p>${deterministicNarrative(country)}</p>
    <div class="detail-grid">
      <div class="card"><h4>Sources (raw/normalized)</h4><pre>${JSON.stringify(country.sources, null, 2)}</pre></div>
      <div class="card"><h4>Derived (auto-generated)</h4><pre>${JSON.stringify(country.derived, null, 2)}</pre></div>
      <div class="card"><h4>Manual overrides</h4>
        <label>DPI score override <input id="override-dpi" type="number" min="0" max="100" step="0.1" value="${manualOverrides[country.iso3]?.final?.dpiScore ?? ''}" /></label>
        <label>AI score override <input id="override-ai" type="number" min="0" max="100" step="0.1" value="${manualOverrides[country.iso3]?.final?.aiScore ?? ''}" /></label>
        <label>Evaluator <input id="override-evaluator" value="${country.manual.evaluator || ''}" /></label>
        <label>Notes <textarea id="override-notes">${country.manual.notes || ''}</textarea></label>
        <button id="save-override">Save override</button>
      </div>
      <div class="card"><h4>Final</h4><pre>${JSON.stringify(country.final, null, 2)}</pre></div>
    </div>
  `;

  document.getElementById('save-override').addEventListener('click', () => {
    const dpiValue = document.getElementById('override-dpi').value;
    const aiValue = document.getElementById('override-ai').value;
    manualOverrides[country.iso3] = {
      manual: {
        dpiOverrides: dpiValue ? { dpiScore: Number(dpiValue) } : {},
        aiOverrides: aiValue ? { aiScore: Number(aiValue) } : {},
        notes: document.getElementById('override-notes').value,
        tags: [],
        evaluator: document.getElementById('override-evaluator').value,
        updatedAt: new Date().toISOString()
      },
      final: {
        dpiScore: dpiValue ? Number(dpiValue) : undefined,
        aiScore: aiValue ? Number(aiValue) : undefined
      }
    };
    saveManualOverrides();
    mergedCountries = baseCountries.map(mergeCountryData);
    renderTable();
    renderDetail();
  });
}

function populateRegions() {
  const select = document.getElementById('filter-region');
  const regions = [...new Set(mergedCountries.map((c) => c.region).filter(Boolean))].sort();
  select.innerHTML = '<option value="all">All regions</option>' + regions.map((r) => `<option value="${r}">${r}</option>`).join('');
}

function bindFilters() {
  ['search', 'filter-region', 'filter-confidence', 'filter-completeness', 'show-incomplete'].forEach((id) => {
    document.getElementById(id).addEventListener('input', renderTable);
    document.getElementById(id).addEventListener('change', renderTable);
  });
}

async function init() {
  baseCountries = await loadBaseCountries();
  manualOverrides = loadManualOverrides();
  mergedCountries = baseCountries.map(mergeCountryData);
  populateRegions();
  bindFilters();
  renderTable();
}

init();
