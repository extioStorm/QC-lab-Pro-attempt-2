# QC Lab Pro (PWA for asphalt/HMA quality control)

Field and lab app for asphalt technicians: plant samples, Rice (Gmm), gyratory pills, roadway cores, PQI readings, and the daily paperwork around them. It is a progressive web app hosted on GitHub.

## Architecture rules (non-negotiable)
1. **Single source of truth for data.** One data object (`appDb`). Screens, lenses and views only read and manipulate it. Never store a second copy of a value, and never store derived progress or counts; compute them.
2. **Single navigation.** The navigation is built from the data shape (DatabaseMap). Do not hand-build menus. Lenses (technician workday, Red Book, Diary) are declared data drawn with the same row builder and navigation calls as the tree.
3. **Framework vs module.** Framework files (`js/qc-*.js`) must stay agnostic: no asphalt knowledge. All asphalt-specific data (test definitions, checklist text, thresholds, constants, lens order) lives under `js/modules/asphalt/`.
4. **Reuse before writing.** Extend existing helpers instead of duplicating: `createTestRecord`, `hasNumber`, `commitChange`, `buildRow`, `buildSourceView`, `buildCard`, `renderDeclaredView`, `computeStep`, `buildStepControl`, `navigateTo`, `jumpToStep`, `createTreeRow`. Before adding any function, search the repo for one that already does the job.
5. **A new record type should only need a test definition in the module.** Record shape, navigation entry and screens come from it.

Data tree today: project -> mix -> plant -> sample, with cores under plant. There is no date/shift level; "the day" is a lens that groups timestamped records by time window.

## File layout
Plain static site: no build step, no framework, scripts loaded in order by `index.html`.
- `js/modules/asphalt/`: `asphalt-defs.js`, `asphalt-policies.js`, `asphalt-schema.js` (module data; loaded first).
- `js/qc-database.js` (data object, `createTestRecord`, `hasNumber`), `qc-policies.js`, `qc-calculations.js` (`computeStep`), `qc-navigation.js` (`navigateTo`, `jumpToStep`, `createTreeRow`), `qc-inspector.js` (`commitChange`), `qc-screens.js` (`buildRow`, `buildCard`, `buildSourceView`, `buildStepControl`, `renderDeclaredView`).
- `css/styles.css`, `index.html`.
New script files must be added to `index.html` in dependency order (module files before the framework files that read them, as today).

## Working style
- Read the relevant code before changing it; confirm which existing function to extend.
- Make small, reviewable changes; explain which existing helper was reused.
- The user works mostly from a phone, so keep summaries short.
- Don't make design decisions that the docs list as open questions; ask.

## Reference docs (domain and design)
These are in `docs/`. Read them when the task touches that area.
- `docs/technician-workday.md`: the technician's own account of the paving/density workday. Source of the workflow.
- `docs/roadway-workday-design.md`: preliminary design for the workday modules, lens navigation, and framework additions, with build order and open questions.
- `docs/hma-volumetric-equations.md`: the volumetric equations (Gsb, Gse, Pba, Pbe, VMA, Va, VFA) and their dependency chain.
- `docs/gyro-worksheet.md`: the company plant-sample worksheet and what it implies for the app (including the Gmm SSD minus 0.005 correction, not yet implemented).
- `docs/field-forms-reference.md`: Roadway Book format, a state DOT mix design report, company QC diary requirements.

## Domain facts to keep straight
- Gmb is approximately MTD / 62.2. Keep the MTD value in the record, not only the converted Gmb.
- Paving rate is lb/yd2; 110 lb/yd2 per inch compacted is a default on the mix, not a constant in code.
- Stations are text as written (for example 135+56) and can run up or down; never assume begin < end.
- Each core keeps its own identifier with its location, PQI reading, thickness and notes. Never mix records or lab results between cores.
- Record observed facts about unusual conditions; never label a core "bad" or assert a cause.
- A core hole is an outstanding follow-up until it is marked filled.

## Current work
Roadway workday modules (Workday Log, Mat Temp, Break the Mat, Day Event, Roadway Core extensions, lenses). Follow the build order in `docs/roadway-workday-design.md`.

## Run / test / deploy
- No build step. Serve the repo root with any static server (for example `npx serve` or `python3 -m http.server`) and open it in a browser; `localhost` counts as a secure context.
- `index.html` currently has no web manifest or service worker registration, so there is no cache-busting to worry about yet. If a service worker is added, bump its cache version on every change.
- No automated tests yet. Verify changes by loading the app in a browser and checking the console for errors.
- Deploy: not set up. Suggested: GitHub Pages from `main` (use relative `./` paths).
- Docs under `docs/` are the home for design and domain notes; update them in the same PR as the code they describe.
