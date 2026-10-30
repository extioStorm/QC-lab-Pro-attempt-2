# Field forms reference (transcribed from photos, 2026-10-19)

Source: three photos supplied by the project owner. Transcribed by Claude; anything marked (?) was hard to read in the photo and should be checked against the paper original. People's names and signatures are left out on purpose.

---

## 1. "Roadway Book Format" (company one-page template for the technician's field book)

A field book is opened to two facing pages. A sample is filled in on the sheet.

### Left page (job, mix and cores)
Header, written once per page:
- Date
- Job # (example: a four-digit number)
- Project number and road name (example: a state-style project number and a road name)
- Plant # (example: plant # 1)
- Mix (example: a 1/2" ESAL C/D mix)
- Pay Item (example: a pay item code)

Core table. Columns: **core #, Avg, Act, Station, thickness, rice**
- Example row 1: core # 00+00 | Avg 145.4 | Act 144 | Station 10+51 | thickness 1 1/2" | rice 155.1
- Example row 2: core # 30+00 | Avg 94.1 | Act 93.1 | Station "6' off c/l" | rice 2.510
- Further blocks start with "core#" and list the station limits of each test section: 30+00 / 60+00, then 60+00 / 90+00.

How the example reads (interpretation, to confirm with the owner):
- The "core #" column holds the **station limits of a test section** (00+00 to 30+00, 30+00 to 60+00, ...), so a core belongs to a section.
- "Station" is where the core was actually cut: a station (10+51) or an offset such as "6' off c/l" (6 feet off centerline).
- "Rice" appears both as a density-style number (155.1) and as a Gmm (2.510), so the book is not consistent about units. 155.1 / 62.4 = 2.485, which is a plausible Gmm.
- "Avg" and "Act" look like the section average and the actual value for the core, in lb/ft3 in row 1 and percent in row 2. (?) Needs the owner to confirm.

### Right page (paving details)
- Date
- Beg Sta (example 00+00) and direction/lane (example: an inner/outer lane code plus direction)
- End sta (example 84+98)
- Rolling pattern (example: 1 vibe, 3 stat)
- Notes (free text)

### Rules printed under the form
1. The roadway technician should be on the jobsite when the first truck arrives; exceptions only if approved by the supervisor.
2. The roadway technician should not leave the jobsite until the last load shows up; exceptions only if approved by the supervisor.
3. Maintain all roadway technician equipment and report any damaged or missing items directly to the supervisor.

---

## 2. State DOT "Materials Testing Report" - Gyratory Compactor (HMA), job mix formula

A state-issued report for one mix design, sample type "Job Control". Contractor, project, supplier and intended-use fields are masked with asterisks in the photo. Photo is slightly blurry; numbers marked (?) are uncertain.

Header facts
- Inspection analysis: Superpave, Wearing. Material code on the form (omitted)
- Sampled from: stockpile. Dates sampled/tested/approved appear on the form.
- Max size aggregate 1/2"; metric 12.5 mm.
- Binder grade: a PG grade (value omitted); specific gravity of AC: 1.033.
- Pay items are listed at the bottom (same pay item as the roadway book example).

Aggregate blend (percent approx, description, source)
- 13 - #89 granite
- 10 - #8910 limestone
- 24.5 (?) - sand
- 14 - pea gravel
- 8 - #78 mod. limestone
- 8.5 - baghouse fines
- 20 - RAP (stockpile)
(Quarry names and ID numbers are on the sheet; not transcribed.)

Job mix information
- % AC required: 5.50 (?) ; AC required per ton: about 110 lb (?)
- **Max specific gravity of mix (Gmm): 2.492**
- Unit weight: 148.8 lb/ft3 and 2388 kg/m3 (?)
- TSR: 0.80; anti-strip: 0.80 (?)
- Effective AC: 5.02
- Dust/asphalt ratio: 0.92
- Coarse aggregate angularity: 85/81; fine aggregate angularity: 45
- **Aggregate bulk specific gravity (Gsb): 2.679**
- **VMA: 15.6**
- **Number of gyrations: 40**; **%Gmm at design: 95.6**
- Mixing temperature: 225 F
- Sieve/percent-passing table is on the sheet (1 1/2" down to #200); the photo is too blurry to transcribe it reliably. Re-photograph if the gradation is needed.

Why it matters for the app: this one sheet carries the mix-design values the app needs for voids/VMA/VFA later (Gmm, Gsb, % binder, binder specific gravity, design gyrations, design VMA).

---

## 3. Company QC diary requirements (from a company quality control program toolbox talk)

Requirement: a **Daily Diary** must be kept at each laboratory and on each project site, every day. It documents all QC activity at the plant and/or roadway, and is the responsibility of the technicians working that day. Reason given: legal issues often come up weeks or months later, and the diary is the record used to recall what happened.

### Laboratory Daily Diary (entries required for days a QC technician or other QC staff is at the facility)
- Names of QC technicians sampling and testing, and the hours they worked
- All materials produced: type of mix, mix design number, tonnages, and whether it complied with contract specifications or there was a problem
- Times of routine plant inspections, problems or unusual circumstances, plant adjustments, work stoppages
- Mixtures sampled and tested, including check samples
- Plant and/or lab equipment that was calibrated
- Visitors to the lab, including management, and any reviews or audits
- Any material, equipment, lab equipment or plant adjustments, problems or concerns, and all actions taken to resolve them
- Descriptions of sampling and/or testing errors, or retest authorizations
- Communications or directions from management, other employees, other people, or the Agency/Owner/Customer's representative
- Anything unusual

### Roadway Daily Diary (kept by the roadway QC technician each paving day)
- Names of roadway technicians working and the hours they worked
- Mixtures placed: type of mix, mix design number, station limits, number of test sections, mat inspections, and whether the mix complied with contract specifications or there were problems
- Description of the weather
- Problems or unusual circumstances, including plant adjustments or work stoppages, and related communications
- Paving and compaction equipment used (distributor, material transfer vehicle, paver, roller) and rolling patterns
- Problems with density, smoothness, pavement texture, segregation, etc., and how they were resolved
- Names of any visitors, including management
- Communications with or directions from management, other employees, other people, or the Agency/Owner/Customer's representative
- Anything unusual

The form has lines for technician printed name, signature and date.

---

## Notes for the app (design hints, not decisions)
- The Roadway Book's header (date, job #, project number, road name, plant, mix, pay item) and right page (begin/end station, lane, rolling pattern, notes) line up with fields the project, mix and plant levels could hold.
- A core is tied to a **test section** (station limits) and has a **station or offset** and a **thickness**.
- The lab diary lists "equipment that was calibrated", which connects to the plant bowl calibration records the app already stores.
- A **Daily Diary** (one per lab or roadway per day) is a record type the app does not have yet.
