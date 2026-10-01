# AS-Radar-X — Final Run Guide

## 1. Install

```bash
npm install
```

## 2. Configure Gemini

Create `.env` from `.env.example` and set:

```env
GEMINI_API_KEY="YOUR_KEY"
GEMINI_MODEL="gemini-3.8-flash"
```

The application can also store the Gemini key/model from the System Config UI. Never commit the real key to source control.

## 3. Start

```bash
npm run dev
```

Open the URL printed by the server (normally `http://localhost:3000`).

## 4. First run

Set the desired Photo and Video counts and click **Start Today's Research**.

The engine performs:

1. Direct public marketplace collection (when accessible).
2. Normalization/deduplication.
3. Recurrence, sample-saturation, commercial-use and longevity analysis.
4. A Gemini + Google Search grounded research pass for current commercial context and missing source coverage.
5. A separate Gemini strategic/creative pass.
6. Evidence/history/rejection validation.
7. Final report generation.

A blocked marketplace is not treated as a successful source and is never replaced with fabricated marketplace data. The grounded web-research pass can still add traceable public context when direct marketplace access is incomplete.

## 5. Important behavior

The app may return fewer opportunities than requested when the evidence does not support the requested number. It must not fill missing slots with invented market facts.

The generated report differentiates:

- direct marketplace observations
- grounded public-web observations
- strategic inference

Photo/video production specifications include camera position, focal length, aperture, shutter/lighting guidance, composition, copy space, aspect ratio and negative constraints where appropriate.
