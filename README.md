# Country AI/DPI Quadrant Assessment Tool

A fully static, browser-only internal assessment website for the Centre for DPI.

The app allows teams to score countries on **DPI maturity** and **AI maturity**, place countries on a 2x2 matrix, and track whether each country is above/below the **DPI Equator** and inside/outside the **Golden Zone**.

## What the tool does

- Scores countries across weighted DPI and AI dimensions (0–5 per dimension).
- Converts scores to weighted totals out of 100.
- Classifies each country into one of four quadrants.
- Shows a dashboard scatterplot (AI on X axis, DPI on Y axis).
- Supports filtering by region, confidence, tags, and status.
- Captures justifications, evidence, and optional dimension confidence.
- Generates deterministic narrative summaries.
- Persists all data in browser `localStorage`.
- Supports JSON import/export, CSV export, and local backup/restore.
- Includes demo seed data for 10 countries.

## Project structure

- `index.html` — static multi-section UI (Dashboard, Assessment, Methodology, Data)
- `styles.css` — clean policy-tool styling
- `app.js` — data model, scoring, rendering, persistence, import/export logic
- `sample-data.json` — seed dataset and default settings
- `README.md` — usage and deployment instructions

## How to run locally

Because this app fetches `sample-data.json`, run it from a local static server (not `file://` directly).

### Option A: Python

```bash
python3 -m http.server 8080
```

Open: `http://localhost:8080`

### Option B: VS Code Live Server

- Open the repository in VS Code.
- Start Live Server for the root folder.

## GitHub Pages deployment

This app is designed for GitHub Pages and works under repository subpaths.

### 1) Push files to your repository

Ensure these files are in your default branch (for example `main`).

### 2) Enable GitHub Pages

1. Go to **Repository → Settings → Pages**.
2. Under **Build and deployment**, choose:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or your target branch)
   - **Folder**: `/ (root)`
3. Save.

Your site URL will look like:

- `https://<org-or-user>.github.io/<repository-name>/`

### 3) Verify subpath compatibility

This app uses relative asset paths (`styles.css`, `app.js`, `./sample-data.json`) and no backend routes, so it works when hosted under subpaths (e.g., `/country-maturity-tool/`).

## Updating repository name or base path

No hardcoded absolute URLs are used. If the repository name changes, GitHub Pages will still work without code changes in most cases.

If you add links later, keep them **relative** (avoid leading `/`) to remain GitHub Pages subpath-safe.

## Data persistence model

- Primary persistence: browser `localStorage`
  - Key: `dpiAiAssessmentDataV1`
- Backup snapshot key: `dpiAiAssessmentDataBackupV1`
- First run behavior:
  - If no saved data exists, the app loads `sample-data.json`.

## Editing weights and thresholds

### Thresholds/Zones (Dashboard)

Update and save:

- DPI threshold (default 50)
- AI threshold (default 50)
- DPI Equator (default 50)
- Golden Zone AI minimum (default 70)
- Golden Zone DPI minimum (default 70)

### Weights (Assessment page)

Edit DPI/AI dimension weights and click **Save Weights**.

Recommended practice:

- Keep DPI weights summing to 100.
- Keep AI weights summing to 100.

## Import/export assessments

On the **Data** page:

- **Export JSON**: full settings + countries snapshot.
- **Import JSON**: restore compatible app data schema.
- **Export CSV**: summary table for analysis in spreadsheets.
- **Backup Snapshot**: save a localStorage backup copy.
- **Restore Backup**: restore latest local backup snapshot.
- **Load Demo Data**: reset to provided sample dataset.
- **Clear All Assessments**: remove all country entries from current workspace.

## Methodology summary

- Dimension score scale: 0 to 5.
- Weighted formula:
  - `Σ((dimension_score / 5) × dimension_weight)`
- Country outputs:
  - DPI score (0–100)
  - AI score (0–100)
  - Quadrant classification
  - Above/below DPI Equator
  - Golden Zone yes/no

DaaS pathway framing is included to guide strategy from foundational DPI rails toward more advanced AI-enabled public service delivery.

## Future extension ideas

- Radar chart per country
- Side-by-side country comparison
- Confidence heatmap
- DaaS recommendations panel
- Printable scorecard view
- Audit log/version history in exported JSON
