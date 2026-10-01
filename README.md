# AS-Radar-X: Commercial Stock Content Market Intelligence Engine

An automated, evidence-backed commercial stock photography and videography research intelligence platform.
It gathers real marketplace signals from Adobe Stock, Shutterstock, and Pond5, normalizes and clusters evidence, adds a grounded Google Search research pass when direct source coverage is incomplete, and uses Gemini to synthesize actionable commercial opportunities.

---

## 🚀 Quick Start (Running Locally)

### 1. Requirements
- Node.js (version 20 or higher recommended, Node 22 for native SQLite DatabaseSync)
- npm or bun

### 2. Installation
Extract the zip file to a directory and run:
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```
Inside `.env`, provide your Google Gemini API Key:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
```
*(Note: You can also configure or change your Gemini API key and model directly in the app UI under the "System Config" tab!)*

### 4. Running the Development Server
```bash
npm run dev
```
Open your browser at `http://localhost:3000` (or the port indicated in your console).

### 5. Running the Automated Test Suite
To verify all collectors, normalization algorithms, SQLite persistence, and Gemini strategic analyst integration:
```bash
npx tsx server/__tests__/research_engine.test.ts
```

---

## 🛠 Project Structure

- `src/` — React frontend application with Tailwind CSS
  - `App.tsx` — Main dashboard, research workflow, live feeds probing, and system config
- `server/` — Backend research engine and API server
  - `collectors/` — Live data extractors for Adobe Stock, Shutterstock, and Pond5
  - `gemini/analyst.ts` — Gemini Strategic Analyst with multi-model failover & schema enforcement
  - `normalization/` — Text cleaning, deduplication, Jaccard similarity, and concept clustering
  - `storage/database.ts` — SQLite persistence for reports, raw evidence, and user settings
  - `researcher.ts` — 13-stage asynchronous research pipeline coordinator
- `server.ts` — Express application server mounting API endpoints and Vite dev server

---

## 📋 Features

- **Genuine Evidence Only:** No fake market evidence, synthetic fallback streams, or hardcoded market-answer claims. Fixed topic taxonomies and safety filters are query/quality heuristics, not claimed market facts. Direct source observations and grounded web research are kept separate from strategic inference.
- **Multi-Model Failover:** Automatic resilient switching among current Gemini 3 models, with a dedicated grounded Google Search research pass before creative synthesis.
- **Motion Value Separation:** Distinct photo concepts vs. motion-critical video concepts.
- **SQLite Persistence:** Reports, historical trends, and evidence audit trails saved locally.
- **One-Click In-App ZIP Export:** Download the complete source code directly from the UI.


## Research quality model

The pipeline now works in four evidence layers:

1. Direct marketplace collection from Adobe Stock, Shutterstock, and Pond5.
2. Deterministic normalization, clustering, recurrence, supply-sample, commercial-use, and longevity analysis.
3. A Gemini grounded web-research pass using Google Search. It uses the current research topics even when all direct marketplace collectors are blocked, and stores grounded URLs/search queries with the report.
4. A separate Gemini strategic/creative pass that must use the direct evidence + grounded web research, reject repetitive concepts, respect user rejection history, and output detailed production specifications for each photo/video.

If evidence cannot support the requested number of opportunities, the report returns fewer opportunities rather than manufacturing the missing items.


See `FINAL_AUDIT.md` for the final engineering/data-integrity audit performed on this package.
