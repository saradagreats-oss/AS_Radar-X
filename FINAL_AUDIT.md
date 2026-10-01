# AS-Radar-X — Final Engineering/Data-Integrity Audit

This package supersedes the earlier prototype packs. It is the Google AI Studio-generated AS-Radar-X project with the research pipeline hardened for evidence quality and human-style strategic analysis.

## Removed / fixed hard-coded production behavior

- Removed synthetic fallback evidence from Shutterstock, Adobe Stock, and Pond5 collectors.
- Removed hard-coded opportunity examples and domain-specific "gap" claims from supply analysis.
- Removed the hard-coded supply-gap baseline score.
- Removed hard-coded visual-angle suggestions from the clustering layer.
- Prevented trend/editorial-only observations from becoming opportunities without a marketplace/contributor observation.
- Added user rejection/history filtering and evidence validation after Gemini generation.

Fixed constants that remain are intentionally limited to:

- query seed taxonomy used to discover research topics
- risk/safety filters for obvious stock clichés
- API/UI defaults and validation limits

These are heuristics/controls, not claimed market evidence.

## Research architecture

`Direct marketplace collection → normalization → dedupe → clustering → recurrence/supply/commercial/longevity analysis → Gemini + Google Search grounded research → Gemini strategic/creative synthesis → validation → SQLite report/history`.

Direct source failures are reported as BLOCKED/ERROR/EMPTY. No blocked source is silently converted to synthetic market data.

When direct marketplace access is incomplete, the grounded Google Search pass still researches the active research topics and stores its source URLs/search queries so the report can contain traceable public context instead of stopping at "trend list" paraphrasing.

## Creative quality

The Gemini creative pass is explicitly instructed to:

- distinguish observations from inference
- reject saturated/generic concepts
- use supply/differentiation evidence before choosing a concept
- respect previous reports and user rejection history
- avoid near-duplicate concepts within the same report
- generate production specs down to subject, setting, action, camera height, lens, aperture, shutter, lighting, color, depth of field, composition, copy space, aspect ratio, texture/detail and negative constraints
- create motion-specific video ideas rather than simply converting photo ideas to video

## Verification in this sandbox

- TypeScript/TSX source syntax was transpiled successfully with TypeScript's parser across the project source set.
- Pure analysis modules were executed in a temporary Node harness with representative evidence and produced dynamic supply/commercial/longevity/priority outputs.
- Production collectors no longer contain synthetic "verified" fallback streams.
- Fixed the project ZIP export endpoint to use the supported `archiver("zip", ...)` API instead of importing a non-existent `ZipArchive` class.
- The package contains no real API key in `.env.example`.

## Runtime verification limitation

This sandbox does not have the project npm dependencies installed, and package installation timed out during earlier verification. Therefore a full `npm run dev` + live Gemini request could not be truthfully claimed here.

The project is intended to be run in Google AI Studio/Replit/local Node 20+ with `npm install` and a valid `GEMINI_API_KEY`. The built-in Gemini + Google Search grounded pass is the secondary research layer used when direct marketplace access is incomplete.
