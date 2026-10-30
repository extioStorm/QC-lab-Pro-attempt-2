# Roadway workday modules - preliminary design (2026-10-30)

Design only; no code changed. Sources: technician-workday.md, the other project docs, and a read of the repo at commit 350a1fc.

## Decisions taken
- **No new tree level.** Everything stays under the plant, next to samples and cores. Records carry timestamps (as they already do) and "the day" is a lens that groups them by time window.
- **Navigation is a lens too.** The existing tree stays as the "browse everything" view. A technician lens is a second navigation block, declared by the module and built from the same data and the same actions, shown above the tree. It follows the workday in chronological order. A lab technician lens can replace it later with no framework change (see Technician lens).
- **Haul time = haul distance.** It stays on the plant (existing `transitMinutes`, `home: "plant"`, read by the `coreRice` policy). It is captured in the Jobsite Setup section of the day log, using the same `home` step pattern the core already uses. No policy change.
  - Caveat: editing it recomputes target Rice for every core on that plant (that is how `propagateHome` works). Fine while the haul stays roughly constant on a job.
- **Lay time stays as built:** automatic (moment logged) unless the tech enters the real lay time, which then wins; clearing it returns to automatic. The design only makes this more visible (see Roadway Core).
- **Lots and sublots: record only for now.** The tech (following the inspector) enters lot and sublot on each core. Counting rules and reminders come later (see Lots, sublots and stationing).
- **Stations are text as written, and direction is recorded.** Stations can run up or down and can start anywhere (10+00, 15+00). The app never assumes begin < end.
- **Station math is deferred.** Later: a small helper that teaches converting 10+00 to 1000 ft, doing the math, and converting back.
- **Paving rate** is lb/yd2 and the rule of thumb is 110 lb/yd2 per inch of compacted thickness. Agencies vary (for example 106 to 112), so 110 is a default on the mix, not a constant in code.
- **Core kind** (state random / test section / QC / other) is recorded on every core. **Test sections** (a trial stretch, often the first 1,000 ft, where the specs let the crew work out the rolling pattern before cores count, possibly 8+ cores) are deferred because the company usually waives them. Core kind means they can be added later without migrating data.

## Is the timestamp approach costly?
Low cost, and it matches how samples and cores already work. Things to design around:
- **Midnight / night shifts.** Group by window, not calendar date. A day's window = the day log's start time to its end time (or to the next log's start, or open-ended if neither exists).
- **Late entries.** A reading logged after the fact uses its own editable "taken at" time, so it lands in the right day.
- **Records before any day log exists.** The lens shows them in an "Unassigned" bucket instead of hiding them.
- **Cores are the exception.** The core's lay time means when the mat was laid, not when it was cut, so the lens groups cores by when they were logged (`systemCreatedAt`).

## Tree (built from DatabaseMap, nothing hand-drawn)
```
Plant
 |- Loose Mix Samples -> Sample -> Rice, Pills     (unchanged)
 |- Workday Logs                                   (new)
 |- Mat Temps                                      (new)
 |- Break-the-Mat                                  (new)
 |- Day Events                                     (new)
 |- Roadway Cores                                  (existing, extended)
 |- Bowl Calibrations, Dryback Corrections         (unchanged)
 |- Plant Production Summary                       (existing view)
 |- Red Book                                       (new view / lens)
 |- Roadway Diary                                  (new view / lens)
 '- Open Follow-ups                                (new view / lens)
```
All new record types are test definitions in the asphalt module with `database.parent: "plant"`. The tree, record shape and screens come from them.

## Technician lens (workday navigation)
A lens is a module-declared, ordered list of entries. Each entry points at something that already exists: a record type (optionally one section of it), a list of records with its existing "add" action, or a lens view. The framework draws the list above the tree using the same row builder and the same navigation calls the tree uses, so there is still one data object and one set of actions.

Roadway technician lens, in workday order (each entry shows progress derived from the data, such as "6/9 checked" or "3 cores", never stored separately):
1. **Open plant:** Workday Log, section 1
2. **Plan with scale house and plant lab:** section 2
3. **Load up:** section 3
4. **Jobsite setup (haul time, stations, rolling pattern):** section 4
5. **PQI setup:** section 5
6. **Mat temperatures:** Mat Temps (count, add)
7. **Break the mat:** Break-the-Mat (count, add)
8. **Cores:** Roadway Cores (count, add), field section
9. **Events and weather:** Day Events (count, add), section 6
10. **Back at the plant (core prep, lab density):** the cores' lab section
11. **Close out and paperwork:** section 7, Red Book, Roadway Diary, Open Follow-ups

Notes:
- Which Workday Log the entries open: the latest log by start time, or a "Start workday" action that creates one.
- The active lens is saved with the rest of the navigation state, so swapping to a lab technician lens (open lab, samples, Rice, pills, calibrations) is another declaration, not new framework code.
- The order above is a draft to confirm against how the tech really moves through the day.

## Modules

### 1. Workday Log (one per day; the checklist spine)
One record, grouped into collapsible sections. Step Wizard mode walks the sections in order, which is the guided workday.
- **Header:** tech name (text), started at (datetime, auto; window start), ended at (datetime; window end).
- **1 Open plant** (checks): garage/parking opened; doors, radiation storage, closets unlocked; main office open; ovens on; burners low; sink water warming; office AC set; PQI on charger. Inputs: gauge standard CHI, standard count.
- **2 Plan:** planned mix (text); plant status (select: running / standby / not running) + reason (text); expected start (datetime); plan changes (text); plant lab tech (text); verified with plant lab (check); how we'll communicate (text).
- **3 Load up** (checks): trailer hitch, pin, chains, lights; generator fuel, started and ran; water barrel filled; ice for expected cores; crayon, paint, core-removal tool; shovel, asphalt container, tamp, boards; tape and measuring wheel; PQI charged; red book primed + pen; truck fuel above half.
- **4 Jobsite setup:** address/GPS (text); road (text); **haul time** (`transitMinutes`, home plant); begin station (text); **stations run** (select: increasing / decreasing); lane (select inner/outer); direction (text); mat width (ft); paving rate (lb/yd2); **rate per inch** (home mix, default 110); expected thickness (computed: rate / rate per inch); rolling pattern (text); roller operator pattern established (check); inspector name/phone (text); **sublot length** (home project, default 3000 ft; stored now, used by stage 2).
- **5 PQI setup:** PQI ID (text); paver/screed (text); start offset (default 88); adjusted offset; reason (text); calibrated (check).
- **6 Weather (midday):** air temp F, wind mph, conditions (text), recorded at (datetime).
- **7 Close out:** end station (text); lab results recorded (check); handed off to other lab tech (check); shut down and locked (checks); notes.

### 2. Mat Temp (repeating)
Taken at (datetime, auto); checkpoint (select: initial / 1,000 ft / other); station (text); temp F; where/conditions (text); roller window behind paver (ft); told roller operator (check); told plant lab (check).
Thresholds (280 target low, 320 high, about 176 cessation) are module constants used by the lenses to flag LOW / HIGH. No new computing is needed.

### 3. Break the Mat (repeating, one per attempt)
Section/station (text); taken at (datetime); PQI reading slots for pass 0 (before rolling) through pass 8 (inputs, %); computed peak % and pass at peak; recommended passes (input, technician's call); calibration note (text).
Slots are generated in the module definition. The cap of 8 is a trade-off versus one record per reading (no cap, more taps).

### 4. Day Event (repeating)
Taken at (datetime); kind (select: paving stopped / paving resumed / section skipped / direction change / **new lot started** / equipment problem / delay at core / visitor / communication / other); station; resume station; **stations run** (select increasing / decreasing, used on a direction change); minutes; notes (text). Feeds the diary (problems, visitors, communications, unusual) and the red book (unusual conditions). Records what happened, never a verdict on a core.

### 5. Roadway Core (existing, extended)
Existing lab steps get `section: "Lab"` and new field steps get `section: "Field"`:
- **Core kind** (select: state random / test section / QC / other).
- Requested station (text; replaces the current `station` default so there is one station field), offset (ft), offset from (centerline / edge).
- **Lot** (input) and **sublot** (input), plus **sublot limits** (text as written in the book, e.g. 00+00 to 30+00). Record only for now.
- **PQI % and PQI MTD** (the five-reading averages): these are the "Avg" columns on the roadway book.
- Thickness (in), handed to (text), hole filled (check), notes (text).
- **Lay time** (existing step) moves to the top of the Field section and is shown with a visible "AUTOMATIC - set the real lay time" highlight while it is still the fallback; it clears once the tech enters a time.
Computed steps: PQI Gmb = PQI MTD / 62.2; **lab MTD = core Gmb x 62.2** (new; the "Act" MTD on the book); and PQI minus lab density % (the end-of-day comparison). The lab density % is the existing In-Place Mat Density ("Act"). All read the same core record, so they cannot be mixed up with another core.

## Lots, sublots and stationing
- **What the book shows.** The roadway book's core table is grouped by station limits (00+00 to 30+00, 30+00 to 60+00, ...), which are the 3,000 ft sublots. The Red Book lens groups cores by the sublot limits entered on each core.
- **Direction.** Paving can turn around, so stations may count down. A direction change records the new stations-run direction. Footage is always distance along the travel direction, never end minus begin.
- **Stage 1 (now):** record only, as above. Sublot length is stored in project settings.
- **Stage 2 (later):** suggestions and reminders from the paving record (stops, skips, direction changes, new-lot events). Rules vary by inspector, so they become per-project settings with the tech able to override: count from the day's begin station or the whole project; skip unpaved sections (a bridge) or count the footage and move any core that lands there; restart counting when a new lot starts (default no; most inspectors continue on). Lots are by tonnage, so the tech enters where a lot ends. Cores with kind "test section" are left out of the sublot counts.

## Lenses (declared views; no double entry)
The Red Book and Diary need a day picker: choose a Workday Log, and the lens filters records by that log's window.
- **Red Book:** header (date, job, project, plant, mix), the core table grouped by sublot limits (core, station + offset, thickness, PQI % / lab %, PQI MTD / lab MTD, notes), paving details (begin/end station, lane, rolling pattern), unusual conditions from Day Events.
- **Roadway Diary** (company QC diary list): technicians and hours, mixes placed + station limits, weather, problems, equipment and rolling pattern, density issues, visitors, communications, anything unusual. Output is text with a Copy button.
- **Open Follow-ups** (plant-wide, no day picker): cores whose hole is not filled, cores not handed off, cores whose lay time is still automatic, lab results not yet recorded.

## Framework additions (generic; no asphalt knowledge in `qc-*.js`)
1. **Step types** `check`, `text`, `select` (options from the module): extend `buildStepControl`, `handleScaleInput`, `createTestRecord`, and the caption in `buildStepRow`. No new handler functions.
2. **`step.section`:** group steps into collapsible sections in Speed Sheet, reusing the existing prerequisite `details` styling; wizard shows the section name.
3. **Declared views with `sections` and a window picker:** extend `renderDeclaredView` (reuse `buildCard`, `buildRow`, `buildSourceView`); add Copy. Also count by path, since the existing `countCollection` only counts direct children.
4. **`partial` computed steps:** `computeStep` currently needs every input to be a number; Break the Mat needs "peak of whichever readings exist".
5. **Navigation lens block:** `renderDrawerContent` draws the active lens's entries above the tree, reusing `createTreeRow`, `navigateTo` and `jumpToStep`; the active lens name is saved in `Nav`.

## Rules check
- **Single navigation:** the tree is still generated from DatabaseMap; the schema loop already adds every test type to its parent. The lens is declared data drawn with the same row builder and the same navigation calls, not a separate hand-built menu.
- **Single data object:** one `appDb`; lenses only read it, and cores keep one station field. Lens progress is derived, not stored.
- **Framework vs module:** all checklist text, lens order, thresholds, 62.2 and the 110 default live in `modules/asphalt/` (suggest a new `asphalt-roadway.js` loaded before the schema); `qc-*.js` changes are generic.
- **Reuse:** `createTestRecord`, `hasNumber`, `commitChange`, `buildRow`, `buildSourceView` are reused; existing handlers are extended rather than duplicated.

## Open questions
1. **Lens order:** confirm the draft workday order above against how the tech really moves through the day.
2. **Station helper** (convert 10+00 to 1000 ft, do the math, convert back): deferred, a later teaching calculator.
3. **Stage 2 sublot rules:** to settle after seeing how a couple of inspectors work.
4. **Test sections:** deferred; core kind is the hook for adding them.

## Suggested build order
1. Framework items 1-2, then Workday Log, which gives the checklist and haul capture.
2. Framework item 5 (lens block) with the roadway lens, so the checklist can be walked in order.
3. Mat Temp, Day Event, core field steps (including core kind, lot and sublot).
4. Framework item 3 plus the Red Book and Diary lenses.
5. Break the Mat (needs item 4) and Open Follow-ups.
