# PhotoPop

Modular, single-page, Photoshop-style editor refactored from a single HTML file into an app structure using ES modules and Vite.

## Structure
- `index.html` – App shell, loads modules
- `src/styles.css` – Styles extracted from inline CSS
- `src/utils.js` – Reusable helpers
- `src/document.js` – Doc/Layer models and serialization
- `src/state.js` – App state, rendering, history, file ops
- `src/tools.js` – Tool logic and canvas interactions
- `src/main.js` – UI bindings and initialization

## Run locally
- Install deps once
- Start dev server

## Build
- Produces a static `dist/` folder you can serve anywhere.

## Notes
- No external runtime deps; pure Canvas + DOM.
- Preserves original features: layers, tools, history, export, adjustments.
