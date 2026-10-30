# Gyro Worksheet (company plant-sample worksheet) - transcribed from photos, 2026-10-19

Two photos: a blank copy on a clipboard, and a copy with the owner's handwritten notes. (?) marks handwriting that was hard to read.

## Blank form: every field

**Header**: Mix type, Date, ESAL, Plant, Job, GYR (which gyratory), Tech, Lot #, Sample
**Sample Info box**: Tonnage, Truck No., Temp (F)

**Binder / ignition block (left column)**
- AC REQD %
- AC TEST %
- % MOIST
- AC ACT %
- SAMP. WT.
- AC WT.
- AGG. WT.
- Gse
- Pba %
- Pbe %
- D/A

**Middle**: AVG Gmm, UNIT WT.

**Maximum Theoretical (Gmm) - the Rice test (right column)**
- A  SAMPLE
- B  CAL WT.
- A+B
- C  TOTAL
- A+B-C  VOL
- Gmm SSD
- Gmm

**Gyratory specimens**: columns for sample 1 and sample 2
- HEIGHT, WT. AIR, WT. H2O, SSD WT., VOL., BLK. GR.
- Actual Voids (per specimen) and AVG.

**Results (right column)**: Avg. Voids, VMA %, Gsb

**Gradation table**: sieves 1.5", 1", 3/4", 1/2", 3/8", #4, #8, #16, #30, #50, #100, #200. Columns: WT. RET'D, % RET'D, % PASSING, SPECS.

**Notes** box.

## Handwritten annotations (owner's own explanations)

- Mix type: "Plant" (as opposed to a mix-design sample) (?)
- ESAL: "on mix design - submittal ... means axle weights for mix" (?). ESAL is the traffic level the mix is designed for.
- GYR: "Which gyro using - brand"
- LOT #: "number of 2000 (ton) lots we are on"
- SAMPLE: "1-4 test per sublot. N/A - sample 1 fine for private job"
- AC REQD %: "Spec"
- AC TEST %: "Gauge reading of sample, or burnoff"
- % MOIST: "0.02 or 0.0"
- AC ACT %: "Percent binder" (also written Pb =)
- SAMP. WT.: "Gradation weight"
- AC WT.: "Pb % times sample weight"
- AGG. WT.: "Sample weight - AC wt" (?)
- Gse: "Mass / effective volume - gravity of the stone with Pb stripped away"; also "plugged stones density" (?), and in the box: "Gse is how stone density acts in mix"
- Pba %: "Asphalt absorbed in rock"
- Rice (Gmm) block: A is the dry sample weight, B is the bowl, C is the submerged weight. A value is crossed out. Gmm row: **"Gmm SSD - 0.005: subtract 0.005 from SSD"**
- Actual Voids: "Air voids, percent of max" (i.e. relative to Gmm)

## What the form implies (for the app; not yet confirmed with the owner)

- Rice volume on the form is A + B - C, the same as the app's A - (C - B).
- The form has two rows, "Gmm SSD" and "Gmm", with the note to subtract 0.005 from the SSD value. The app currently computes one Gmm and has no such correction.
- Binder: AC weight = Pb x sample weight; aggregate weight = sample weight - AC weight.
- Per gyratory specimen: bulk gravity from the weights, then air voids against Gmm; average of the two specimens.
- Gse, Pba, Pbe, D/A, VMA and Gsb need the mix-design values (Gsb, binder specific gravity) from the mix design report (see field-forms-reference.md).
- A sample belongs to a **lot and sublot** (tonnage-based: 2000-ton lots, 1-4 tests per sublot).
