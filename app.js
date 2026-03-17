const STORAGE_KEY = "dpiAiAssessmentDataV1";
const BACKUP_KEY = "dpiAiAssessmentDataBackupV1";

const DEFAULT_SETTINGS = {
  thresholds: {
    dpiThreshold: 50,
    aiThreshold: 50,
    dpiEquator: 50,
    goldenDpiMin: 70,
    goldenAiMin: 70
  },
  dpiDimensions: [
    { key: "digitalIdentity", name: "Digital Identity maturity", weight: 20 },
    { key: "payments", name: "Payments maturity", weight: 20 },
    { key: "dataExchange", name: "Data exchange / consent / interoperability maturity", weight: 20 },
    { key: "credentialing", name: "Credentialing / trust infrastructure", weight: 10 },
    { key: "governance", name: "Governance / safeguards / legal readiness", weight: 10 },
    { key: "openness", name: "Openness / interoperability / modularity", weight: 10 },
    { key: "deliveryCapacity", name: "Delivery capacity / institutional capability", weight: 10 }
  ],
  aiDimensions: [
    { key: "policyReadiness", name: "National AI strategy / policy readiness", weight: 15 },
    { key: "dataForAi", name: "Data availability and governance for AI", weight: 15 },
    { key: "aiTalent", name: "AI talent and institutional capability", weight: 15 },
    { key: "compute", name: "Compute / infrastructure / cloud access", weight: 10 },
    { key: "publicAdoption", name: "AI adoption in public sector", weight: 15 },
    { key: "ecosystem", name: "AI ecosystem / private sector / academia", weight: 10 },
    { key: "safeguards", name: "Safeguards / accountability / risk management", weight: 10 },
    { key: "alignment", name: "Alignment of AI with DPI rails and workflows", weight: 10 }
  ]
};

let state = { settings: structuredClone(DEFAULT_SETTINGS), countries: [] };
let selectedCountryId = null;
let chartPoints = [];

function uid() {
  return `ctry-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

async function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    state = JSON.parse(stored);
    return;
  }
  await resetDemoData();
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function computeWeightedScore(dimensionList, scores) {
  return dimensionList.reduce((total, dim) => {
    const raw = Number(scores?.[dim.key]?.score || 0);
    return total + (Math.max(0, Math.min(5, raw)) / 5) * Number(dim.weight || 0);
  }, 0);
}

function computeCountryClassification(country) {
  const dpiScore = computeWeightedScore(state.settings.dpiDimensions, country.assessments.dpi);
  const aiScore = computeWeightedScore(state.settings.aiDimensions, country.assessments.ai);
  const t = state.settings.thresholds;

  const quadrant = `${dpiScore >= t.dpiThreshold ? "High DPI" : "Low DPI"} / ${aiScore >= t.aiThreshold ? "High AI" : "Low AI"}`;
  const aboveDpiEquator = dpiScore >= t.dpiEquator;
  const inGoldenZone = dpiScore >= t.goldenDpiMin && aiScore >= t.goldenAiMin;

  return {
    dpiScore: Math.round(dpiScore * 10) / 10,
    aiScore: Math.round(aiScore * 10) / 10,
    quadrant,
    aboveDpiEquator,
    inGoldenZone
  };
}

function generateNarrative(country, cls) {
  const name = country.meta.countryName;
  if (cls.inGoldenZone) {
    return `${name} is in the Golden Zone, with strong DPI and strong AI readiness. Priority should be scaling public agents, interoperable workflows, and safeguards.`;
  }
  if (!cls.aboveDpiEquator) {
    return `${name} remains below the DPI Equator. DaaS-style deployment of identity, payments, and data exchange should be prioritized before scaling AI use cases.`;
  }
  if (cls.aiScore >= state.settings.thresholds.aiThreshold) {
    return `${name} is above the DPI Equator and shows maturing AI readiness. Priority should be deepening safeguards and aligning AI delivery with trusted DPI workflows.`;
  }
  return `${name} is above the DPI Equator, with emerging AI readiness. Priority should be expanding trusted data exchange and credentialing while aligning new AI deployments with DPI workflows.`;
}

function switchSection(target) {
  document.querySelectorAll(".section").forEach((sec) => sec.classList.toggle("active", sec.id === target));
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.section === target));
  location.hash = target;
}

function getVisibleCountries() {
  const region = document.getElementById("filter-region").value;
  const confMin = Number(document.getElementById("filter-confidence").value);
  const status = document.getElementById("filter-status").value;
  const tag = document.getElementById("filter-tag").value.trim().toLowerCase();

  return state.countries.filter((country) => {
    const cls = computeCountryClassification(country);
    const tags = (country.meta.tags || []).join(",").toLowerCase();

    if (region !== "all" && country.meta.region !== region) return false;
    if (Number(country.meta.overallConfidence || 0) < confMin) return false;
    if (tag && !tags.includes(tag)) return false;
    if (status === "above" && !cls.aboveDpiEquator) return false;
    if (status === "below" && cls.aboveDpiEquator) return false;
    if (status === "golden" && !cls.inGoldenZone) return false;
    return true;
  });
}

function renderScatterplot() {
  const canvas = document.getElementById("scatterplot");
  const ctx = canvas.getContext("2d");
  const countries = getVisibleCountries();
  const t = state.settings.thresholds;
  const showLabels = document.getElementById("toggle-labels").checked;
  const pad = 50;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);

  const x = (v) => pad + (v / 100) * (w - pad * 2);
  const y = (v) => h - pad - (v / 100) * (h - pad * 2);

  ctx.fillStyle = "rgba(200,166,71,0.18)";
  ctx.fillRect(x(t.goldenAiMin), y(100), x(100) - x(t.goldenAiMin), y(t.goldenDpiMin) - y(100));

  ctx.strokeStyle = "#ced5df";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const val = i * 10;
    ctx.beginPath(); ctx.moveTo(x(val), y(0)); ctx.lineTo(x(val), y(100)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x(0), y(val)); ctx.lineTo(x(100), y(val)); ctx.stroke();
  }

  ctx.strokeStyle = "#2f6f8f";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x(t.aiThreshold), y(0)); ctx.lineTo(x(t.aiThreshold), y(100)); ctx.stroke();

  ctx.strokeStyle = "#1f7a5c";
  ctx.beginPath(); ctx.moveTo(x(0), y(t.dpiEquator)); ctx.lineTo(x(100), y(t.dpiEquator)); ctx.stroke();

  ctx.fillStyle = "#4b5563";
  ctx.fillText("AI Maturity (0-100)", w / 2 - 45, h - 10);
  ctx.save();
  ctx.translate(12, h / 2 + 45);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("DPI Maturity (0-100)", 0, 0);
  ctx.restore();

  chartPoints = [];
  countries.forEach((country) => {
    const cls = computeCountryClassification(country);
    const px = x(cls.aiScore);
    const py = y(cls.dpiScore);
    chartPoints.push({ x: px, y: py, id: country.id });

    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = cls.inGoldenZone ? "#b68d1e" : cls.aboveDpiEquator ? "#2f6f8f" : "#b54747";
    ctx.fill();

    if (showLabels) {
      ctx.fillStyle = "#111827";
      ctx.font = "12px Arial";
      ctx.fillText(country.meta.countryName, px + 8, py - 8);
    }
  });
}

function renderDashboard() {
  const tbody = document.querySelector("#country-table tbody");
  const countries = getVisibleCountries();
  tbody.innerHTML = countries.map((country) => {
    const cls = computeCountryClassification(country);
    return `<tr>
      <td>${country.meta.countryName}</td>
      <td>${country.meta.region}</td>
      <td>${cls.dpiScore}</td>
      <td>${cls.aiScore}</td>
      <td>${cls.quadrant}</td>
      <td>${cls.aboveDpiEquator ? "Above" : "Below"}</td>
      <td>${cls.inGoldenZone ? "Yes" : "No"}</td>
      <td>${country.meta.overallConfidence || "-"}</td>
    </tr>`;
  }).join("");

  renderScatterplot();
}

function renderCountrySelector() {
  const select = document.getElementById("country-selector");
  select.innerHTML = '<option value="">-- Select --</option>' + state.countries
    .map((c) => `<option value="${c.id}">${c.meta.countryName}</option>`)
    .join("");
  if (selectedCountryId) select.value = selectedCountryId;

  const regions = [...new Set(state.countries.map((c) => c.meta.region).filter(Boolean))].sort();
  const regionSelect = document.getElementById("filter-region");
  const current = regionSelect.value || "all";
  regionSelect.innerHTML = '<option value="all">All</option>' + regions.map((r) => `<option value="${r}">${r}</option>`).join("");
  regionSelect.value = regions.includes(current) ? current : "all";
}

function dimensionCardHtml(prefix, dim, value = {}) {
  return `<div class="dimension-card" data-key="${dim.key}">
    <h4>${dim.name} (Weight ${dim.weight})</h4>
    <div class="form-grid compact">
      <label>Score (0-5)<input type="number" min="0" max="5" step="0.1" data-field="score" value="${value.score ?? ""}" required></label>
      <label>Dimension Confidence (optional)<input type="number" min="1" max="5" data-field="confidence" value="${value.confidence ?? ""}"></label>
    </div>
    <label>Justification<input type="text" data-field="justification" value="${value.justification ?? ""}"></label>
    <label>Evidence / Source<input type="text" data-field="evidence" value="${value.evidence ?? ""}"></label>
  </div>`;
}

function renderWeightsEditor() {
  const mk = (dims, containerId, prefix) => {
    document.getElementById(containerId).innerHTML = dims.map((d) =>
      `<label>${d.name}<input type="number" min="0" max="100" data-weight-type="${prefix}" data-key="${d.key}" value="${d.weight}"></label>`
    ).join("");
  };
  mk(state.settings.dpiDimensions, "dpi-weights", "dpi");
  mk(state.settings.aiDimensions, "ai-weights", "ai");
}

function renderCountryForm(countryId) {
  const form = document.getElementById("country-form");
  const country = state.countries.find((c) => c.id === countryId);
  const c = country || {
    id: uid(),
    meta: { countryName: "", isoCode: "", region: "", subregion: "", population: "", incomeGroup: "", evaluator: "", evaluationDate: "", notes: "", tags: [], overallConfidence: 3 },
    assessments: { dpi: {}, ai: {} }
  };

  selectedCountryId = c.id;
  form.countryName.value = c.meta.countryName || "";
  form.isoCode.value = c.meta.isoCode || "";
  form.region.value = c.meta.region || "";
  form.subregion.value = c.meta.subregion || "";
  form.population.value = c.meta.population || "";
  form.incomeGroup.value = c.meta.incomeGroup || "";
  form.evaluator.value = c.meta.evaluator || "";
  form.evaluationDate.value = c.meta.evaluationDate || new Date().toISOString().slice(0, 10);
  form.notes.value = c.meta.notes || "";
  form.tags.value = (c.meta.tags || []).join(", ");
  form.overallConfidence.value = c.meta.overallConfidence || 3;

  document.getElementById("dpi-dimensions").innerHTML = `<h3>DPI Dimensions</h3>${state.settings.dpiDimensions.map((dim) => dimensionCardHtml("dpi", dim, c.assessments.dpi[dim.key])).join("")}`;
  document.getElementById("ai-dimensions").innerHTML = `<h3>AI Dimensions</h3>${state.settings.aiDimensions.map((dim) => dimensionCardHtml("ai", dim, c.assessments.ai[dim.key])).join("")}`;

  updateCalculationPreview();
}

function collectDimensionValues(containerId) {
  const result = {};
  document.querySelectorAll(`#${containerId} .dimension-card`).forEach((card) => {
    const key = card.dataset.key;
    result[key] = {
      score: Number(card.querySelector('[data-field="score"]').value || 0),
      confidence: card.querySelector('[data-field="confidence"]').value ? Number(card.querySelector('[data-field="confidence"]').value) : null,
      justification: card.querySelector('[data-field="justification"]').value.trim(),
      evidence: card.querySelector('[data-field="evidence"]').value.trim()
    };
  });
  return result;
}

function updateCalculationPreview() {
  const form = document.getElementById("country-form");
  const draft = {
    meta: { countryName: form.countryName.value || "This country" },
    assessments: { dpi: collectDimensionValues("dpi-dimensions"), ai: collectDimensionValues("ai-dimensions") }
  };
  const cls = computeCountryClassification(draft);
  document.getElementById("calc-summary").textContent = `DPI: ${cls.dpiScore}/100 | AI: ${cls.aiScore}/100 | ${cls.quadrant} | DPI Equator: ${cls.aboveDpiEquator ? "Above" : "Below"} | Golden Zone: ${cls.inGoldenZone ? "Yes" : "No"}`;
  document.getElementById("calc-narrative").textContent = generateNarrative(draft, cls);
}

function exportJSON() {
  downloadFile(`dpi-ai-assessments-${Date.now()}.json`, JSON.stringify(state, null, 2), "application/json");
}

function exportCSV() {
  const headers = ["Country", "ISO", "Region", "DPI Score", "AI Score", "Quadrant", "Above DPI Equator", "Golden Zone", "Confidence", "Tags"];
  const lines = state.countries.map((country) => {
    const cls = computeCountryClassification(country);
    return [
      country.meta.countryName,
      country.meta.isoCode,
      country.meta.region,
      cls.dpiScore,
      cls.aiScore,
      cls.quadrant,
      cls.aboveDpiEquator ? "Yes" : "No",
      cls.inGoldenZone ? "Yes" : "No",
      country.meta.overallConfidence,
      (country.meta.tags || []).join("|")
    ].map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`).join(",");
  });
  downloadFile(`dpi-ai-assessments-${Date.now()}.csv`, [headers.join(","), ...lines].join("\n"), "text/csv");
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed.settings || !Array.isArray(parsed.countries)) throw new Error("Invalid schema");
      state = parsed;
      saveData();
      refreshAll();
      setDataMessage("Data imported successfully.");
    } catch (err) {
      setDataMessage(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function setDataMessage(message) {
  document.getElementById("data-message").textContent = message;
}

async function resetDemoData() {
  const response = await fetch("./sample-data.json");
  state = await response.json();
  saveData();
  refreshAll();
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function refreshAll() {
  const t = state.settings.thresholds;
  document.getElementById("setting-dpi-threshold").value = t.dpiThreshold;
  document.getElementById("setting-ai-threshold").value = t.aiThreshold;
  document.getElementById("setting-dpi-equator").value = t.dpiEquator;
  document.getElementById("setting-golden-ai").value = t.goldenAiMin;
  document.getElementById("setting-golden-dpi").value = t.goldenDpiMin;

  renderCountrySelector();
  renderDashboard();
  renderWeightsEditor();

  if (!selectedCountryId && state.countries[0]) selectedCountryId = state.countries[0].id;
  renderCountryForm(selectedCountryId);
}

function wireEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchSection(btn.dataset.section));
  });

  ["filter-region", "filter-confidence", "filter-status", "filter-tag", "toggle-labels"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderDashboard);
  });

  document.getElementById("save-thresholds").addEventListener("click", () => {
    state.settings.thresholds = {
      dpiThreshold: Number(document.getElementById("setting-dpi-threshold").value),
      aiThreshold: Number(document.getElementById("setting-ai-threshold").value),
      dpiEquator: Number(document.getElementById("setting-dpi-equator").value),
      goldenAiMin: Number(document.getElementById("setting-golden-ai").value),
      goldenDpiMin: Number(document.getElementById("setting-golden-dpi").value)
    };
    saveData();
    refreshAll();
  });

  document.getElementById("country-selector").addEventListener("change", (e) => {
    selectedCountryId = e.target.value || null;
    if (selectedCountryId) renderCountryForm(selectedCountryId);
  });

  document.getElementById("new-country").addEventListener("click", () => {
    selectedCountryId = null;
    renderCountryForm(null);
  });

  document.getElementById("country-form").addEventListener("input", (e) => {
    if (e.target.closest("#dpi-dimensions") || e.target.closest("#ai-dimensions") || e.target.form) {
      updateCalculationPreview();
    }
  });

  document.getElementById("country-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const country = {
      id: selectedCountryId || uid(),
      meta: {
        countryName: form.countryName.value.trim(),
        isoCode: form.isoCode.value.trim().toUpperCase(),
        region: form.region.value.trim(),
        subregion: form.subregion.value.trim(),
        population: form.population.value ? Number(form.population.value) : null,
        incomeGroup: form.incomeGroup.value.trim(),
        evaluator: form.evaluator.value.trim(),
        evaluationDate: form.evaluationDate.value,
        notes: form.notes.value.trim(),
        tags: form.tags.value.split(",").map((t) => t.trim()).filter(Boolean),
        overallConfidence: Number(form.overallConfidence.value)
      },
      assessments: {
        dpi: collectDimensionValues("dpi-dimensions"),
        ai: collectDimensionValues("ai-dimensions")
      }
    };

    const idx = state.countries.findIndex((c) => c.id === country.id);
    if (idx >= 0) state.countries[idx] = country;
    else state.countries.push(country);

    selectedCountryId = country.id;
    saveData();
    refreshAll();
    switchSection("dashboard");
  });

  document.getElementById("delete-country").addEventListener("click", () => {
    if (!selectedCountryId) return;
    state.countries = state.countries.filter((c) => c.id !== selectedCountryId);
    selectedCountryId = state.countries[0]?.id || null;
    saveData();
    refreshAll();
  });

  document.getElementById("save-weights").addEventListener("click", () => {
    const assignWeights = (type, list) => list.map((dim) => {
      const value = document.querySelector(`[data-weight-type="${type}"][data-key="${dim.key}"]`).value;
      return { ...dim, weight: Number(value || 0) };
    });

    state.settings.dpiDimensions = assignWeights("dpi", state.settings.dpiDimensions);
    state.settings.aiDimensions = assignWeights("ai", state.settings.aiDimensions);
    saveData();
    refreshAll();
  });

  document.getElementById("export-json").addEventListener("click", exportJSON);
  document.getElementById("export-csv").addEventListener("click", exportCSV);
  document.getElementById("import-json").addEventListener("change", (e) => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
  });

  document.getElementById("backup-storage").addEventListener("click", () => {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(state));
    setDataMessage("Backup snapshot saved in browser storage.");
  });

  document.getElementById("restore-storage").addEventListener("click", () => {
    const backup = localStorage.getItem(BACKUP_KEY);
    if (!backup) return setDataMessage("No backup snapshot found.");
    state = JSON.parse(backup);
    saveData();
    refreshAll();
    setDataMessage("Backup restored.");
  });

  document.getElementById("load-demo").addEventListener("click", async () => {
    await resetDemoData();
    setDataMessage("Demo data loaded.");
  });

  document.getElementById("reset-data").addEventListener("click", () => {
    state.countries = [];
    saveData();
    refreshAll();
    setDataMessage("All assessments cleared.");
  });

  document.getElementById("scatterplot").addEventListener("click", (e) => {
    const rect = e.target.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (e.target.width / rect.width);
    const sy = (e.clientY - rect.top) * (e.target.height / rect.height);
    const hit = chartPoints.find((pt) => Math.hypot(pt.x - sx, pt.y - sy) <= 8);
    if (hit) {
      selectedCountryId = hit.id;
      renderCountryForm(selectedCountryId);
      switchSection("assessment");
      renderCountrySelector();
    }
  });
}

async function init() {
  wireEvents();
  await loadData();
  refreshAll();
  const hash = location.hash.replace("#", "");
  if (["dashboard", "assessment", "methodology", "data"].includes(hash)) switchSection(hash);
}

init();
