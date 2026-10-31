// @ts-nocheck
const DEFAULT_DRYBACK_CORRECTION = 0.005;
const DEFAULT_HAUL_MINUTES = 30;
const MTD_PER_GMB = 62.2; // PQI MTD (lb/ft³) is about Gmb x 62.2
const DEFAULT_RATE_PER_INCH = 110; // lb/yd² per inch compacted; a rule of thumb, a default on each mix design

const T166 = {
  volume:  (ssd, submerged) => ssd - submerged,
  gmb:     (dry, volume) => (volume > 0 ? dry / volume : null),
  percent: (gmb, gmm) => ((gmb && gmm > 0) ? roundHalfToEven(gmb / gmm, 5) * 100 : null)
};

// A new core's Core #: one more than the highest number of the same kind on this plant (1, 2... or QC 1, QC 2...).
function nextCoreNumber(core, plant) {
  const isQc = core.coreKind === "QC";
  const used = Object.values((plant && plant.cores) || {})
    .filter(other => other !== core && (other.coreKind === "QC") === isQc)
    .map(other => parseInt(String(other.coreNumber || "").replace(/\D/g, ""), 10))
    .filter(n => !isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return isQc ? `QC ${next}` : String(next);
}

const TestDefinitions = {
  // A company mix design (an asset kept beside the projects): entered once, used by every job's mix that picks it.
  mixDesign: {
    id: "mixDesign",
    title: "Mix Design",
    icon: "📄",
    database: { parent: "top", collection: "mixDesigns", idKey: "mixDesignId", idPrefix: "MD-", idPad: 2, defaults: { ratePerInch: DEFAULT_RATE_PER_INCH } },
    navigation: { group: true, groupIcon: "📄", collectionLabel: "Mix Designs", addLabel: "Add Mix Design", itemLabel: (r, id) => r.mixDescription || `Mix Design ${id}` },
    sequence: [
      { key: "mixDescription", label: "Mix (as written in the book)", type: "text", instruction: "As you write it on the Red Book's Mix line, e.g. 1/2\" ESAL C/D." },
      { key: "mixDesignNumber", label: "Mix Design Number", type: "text" },
      { key: "nominalSize", label: "Nominal Size", type: "select", options: ["3/8\"", "1/2\"", "3/4\"", "1\"", "1 1/2\""], instruction: "Keyed into the PQI at setup; also explains texture and thin-lift trouble." },
      { key: "designGmm", label: "Mix Design Gmm", type: "input", unit: "", decimals: 3, step: "0.001", instruction: "Cores fall back on it when no Rice test fits." },
      { key: "ratePerInch", label: "Rate per Inch Compacted", type: "input", unit: "lb/yd²", decimals: 0, step: "1", optional: true, instruction: "Rule of thumb 110." }
    ]
  },
  rice: {
    id: "rice",
    title: "Rice Test (Gmm)",
    icon: "🍚",
    database: { parent: "sample", collection: "riceTests", idKey: "riceTestId" },
    navigation: { group: false, collectionLabel: "Rice Tests", addLabel: "Add Rice Test", itemLabel: (record, id) => `Rice Test #${id}` },
    sequence: [
      {
        key: "bowlCalibrationWeight",
        label: "Empty Bowl Underwater (B)",
        type: "computed",
        fetch: "bowlCalibration",
        reads: [{ type: "bowlCalibration", key: "weight" }, { type: "bowlCalibration", key: "calibrationDate" }],
        unit: "g",
        decimals: 1,
        instruction: "Comes from this plant's bowl calibration."
      },
      {
        key: "drybackCorrection",
        label: "Dryback Correction",
        type: "computed",
        fetch: "drybackCorrection",
        reads: [{ type: "drybackCorrection", key: "correction" }, { type: "drybackCorrection", key: "effectiveDate" }],
        unit: "",
        decimals: 3,
        instruction: "From this plant's dryback correction."
      },
      {
        key: "drySampleWeight",
        label: "Dry Loose Mix in Air (A)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Zero bowl in air. Pour cooled loose mix into bowl. Record net dry mass A."
      },
      {
        key: "bowlAndSampleSubmergedWeight",
        label: "Bowl + Saturated Sample (C)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Submerge bowl and saturated mix. Record submerged mass C."
      },
      {
        key: "sampleSubmergedWeight",
        label: "Sample in Water (C - B)",
        type: "computed",
        from: ["bowlAndSampleSubmergedWeight", "bowlCalibrationWeight"],
        calc: (c, b) => c - b,
        unit: "g",
        decimals: 1,
        instruction: "Intermediate check: Calculates sample underwater mass (C - B)."
      },
      {
        key: "sampleVolumeBasis",
        label: "Volume Basis (A - Submerged)",
        type: "computed",
        from: ["drySampleWeight", "sampleSubmergedWeight"],
        calc: (a, submerged) => a - submerged,
        unit: "cm³",
        decimals: 1,
        instruction: "Intermediate volume basis."
      },
      {
        key: "gmmSsd",
        label: "Gmm SSD (before correction)",
        type: "computed",
        from: ["drySampleWeight", "sampleVolumeBasis"],
        calc: (a, volumeBasis) => (volumeBasis > 0 ? a / volumeBasis : null),
        unit: "",
        decimals: 3,
        instruction: "Dry mass A divided by volume basis."
      },
      {
        key: "measuredGmm",
        label: "Max Specific Gravity (Gmm)",
        type: "computed",
        from: ["gmmSsd", "drybackCorrection"],
        calc: (ssd, correction) => ssd - correction,
        unit: "",
        decimals: 3,
        instruction: "Gmm SSD minus dryback correction."
      }
    ]
  },
  pill: {
    id: "pill",
    title: "Gyratory Pill (Gmb)",
    icon: "🔘",
    database: { parent: "sample", collection: "pills", idKey: "pillId" },
    navigation: { group: false, collectionLabel: "Gyratory Pills", addLabel: "Add Gyratory Pill", itemLabel: (record, id) => `Gyratory Pill #${id}` },
    sequence: [
      {
        key: "riceTestId",
        label: "Rice Test for This Pill",
        type: "choice",
        resolver: "pillRice",
        instruction: "A pill uses the Rice test from its own sample."
      },
      {
        key: "riceGmm",
        label: "Rice Gmm (this sample)",
        type: "computed",
        from: ["riceTestId"],
        fetch: "pillRice",
        reads: { type: "rice", key: "measuredGmm" },
        unit: "",
        decimals: 3,
        instruction: "Loose-mix Gmm reference."
      },
      {
        key: "dryWeight",
        label: "Dry Specimen Mass in Air (A)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Weigh dry, cooled compacted pill in air."
      },
      {
        key: "submergedWeight",
        label: "Submerged Specimen Mass (C)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Immerse specimen completely in water bath."
      },
      {
        key: "surfaceDryWeight",
        label: "SSD Mass in Air (B)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Blot surface moisture with damp towel."
      },
      {
        key: "volume",
        label: "Specimen Volume (B - C)",
        type: "computed",
        from: ["surfaceDryWeight", "submergedWeight"],
        calc: T166.volume,
        unit: "cm³",
        decimals: 1,
        instruction: "Volume = SSD Mass (B) - Submerged Mass (C)."
      },
      {
        key: "gmb",
        label: "Bulk Specific Gravity (Gmb)",
        type: "computed",
        from: ["dryWeight", "volume"],
        calc: T166.gmb,
        unit: "",
        decimals: 3,
        instruction: "Gmb = Dry Mass (A) / Volume."
      },
      {
        key: "percentOfGmm",
        label: "Compaction Percent Density",
        type: "computed",
        from: ["gmb", "riceGmm"],
        calc: T166.percent,
        unit: "%",
        decimals: 1,
        instruction: "Compares compacted Pill Gmb against loose Rice Gmm."
      }
    ]
  },
  core: {
    id: "core",
    title: "Roadway Core",
    icon: "🔴",
    database: { parent: "plant", collection: "cores", idKey: "coreId", idPrefix: "CORE-", idPad: 2, defaults: { coreKind: "State" } },
    navigation: { group: true, groupIcon: "🛣️", collectionLabel: "Roadway Cores", addLabel: "Log New Roadway Core", itemLabel: (core, id) => `Core ${core.coreNumber || id} (${core.station || "No Station"})` },
    sequence: [
      {
        key: "transitMinutes",
        home: "plant",
        label: "Haul Time, Plant to Job",
        type: "input",
        unit: "min",
        decimals: 0,
        step: "1",
        rerender: true,
        instruction: "Minutes from sampling at plant to laydown."
      },
      {
        key: "designGmm",
        home: "mixDesign",
        label: "Mix Design Gmm (fallback)",
        type: "input",
        unit: "",
        decimals: 3,
        step: "0.001",
        rerender: true,
        instruction: "Used only when no Rice test fits."
      },
      {
        key: "riceChoice",
        label: "Rice Test for This Core",
        type: "choice",
        resolver: "coreRice",
        instruction: "Closest Rice test to target laydown time."
      },
      {
        key: "targetRiceGmm",
        label: "Target Rice Gmm",
        type: "computed",
        from: ["laydownTimestamp", "transitMinutes", "designGmm", "riceChoice"],
        fetch: "coreRice",
        reads: { type: "rice", key: "measuredGmm" },
        unit: "",
        decimals: 3,
        instruction: "Gmm reference."
      },
      { key: "coreKind", label: "Core Kind", type: "select", options: ["State", "QC"], section: "Locate & Read", rerender: true, instruction: "State: the inspector gave the location; counts toward one core per sublot. QC: your own check on the mix and the gauge calibration, at a spot you pick." },
      { key: "coreNumber", label: "Core #", type: "text", section: "Locate & Read", autoFill: { when: ["coreKind"], value: nextCoreNumber }, instruction: "Filled in with the next number for this kind (1, 2... or QC 1, QC 2...); type over it if needed." },
      { key: "station", label: "Station", type: "text", section: "Locate & Read", instruction: "As given, e.g. 135+56. Measure back or forward from whichever station is nearest (136+00 back 44 ft, or 135+00 forward 56 ft) and mark it with paint." },
      { key: "offset", label: "Offset", type: "text", section: "Locate & Read", instruction: "As written, from the centerline or an edge, e.g. 6' off C/L or 8' off outer edge. Measure it the same way every time." },
      { key: "sublotLimits", label: "Station Limits (sublot)", type: "text", section: "Locate & Read", instruction: "The sublot this core is in, e.g. 00+00 to 30+00 (the line under the core # in the book)." },
      { key: "pqiPercent", label: "PQI Density (5-reading avg)", type: "input", unit: "%", decimals: 1, step: "0.1", section: "Locate & Read", instruction: "Use the five-reading average mode at the exact spot and circle it with the lumber crayon. The core should be within about six inches." },
      { key: "pqiMtd", label: "PQI MTD (5-reading avg)", type: "input", unit: "", decimals: 1, step: "0.1", section: "Locate & Read" },
      {
        key: "laydownTimestamp",
        label: "Lay Time (placement time)",
        type: "datetime",
        autoKey: "isUsingAutoTime",
        autoValueKey: "systemCreatedAt",
        autoHint: "automatic",
        manualHint: "entered",
        rerender: true,
        section: "Ice & Cut",
        instruction: "When the section of mat was laid. Then ice the spot (about 10 minutes per inch of thickness), check the mat is about 150°F or cooler before moving the rig on, set up the drill and water, cut, and pry the core out with the removal tool."
      },
      { key: "thickness", label: "Thickness", type: "input", unit: "in", decimals: 2, step: "0.125", section: "Label, Measure & Hand Off", instruction: "Write the core # on the core with the lumber crayon first, then measure." },
      { key: "handedTo", label: "Handed To", type: "text", section: "Label, Measure & Hand Off", instruction: "Who took the core and its paperwork, and when if it wasn't right away." },
      { key: "holeFilled", label: "Hole filled", type: "check", section: "Label, Measure & Hand Off", instruction: "Fill from the paver while asphalt is available; if paving has stopped, bring asphalt the next day. Stays an open follow-up until ticked." },
      { key: "coreNotes", label: "Notes", type: "text", section: "Label, Measure & Hand Off", instruction: "Observed facts only (e.g. paver sat over this spot 20 min). Never label a core bad or assert a cause." },
      {
        key: "dryWeight",
        label: "Dry Core Mass in Air (A)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        section: "Lab",
        instruction: "Weigh trimmed, dry core in air."
      },
      {
        key: "submergedWeight",
        label: "Submerged Core Mass (C)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        section: "Lab",
        instruction: "Immerse core in water bath."
      },
      {
        key: "surfaceDryWeight",
        label: "SSD Core Mass in Air (B)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        section: "Lab",
        instruction: "Blot surface with damp towel."
      },
      {
        key: "volume",
        label: "Core Volume (B - C)",
        type: "computed",
        from: ["surfaceDryWeight", "submergedWeight"],
        calc: T166.volume,
        unit: "cm³",
        decimals: 1,
        section: "Lab",
        instruction: "Core Volume = SSD Mass (B) - Submerged Mass (C)."
      },
      {
        key: "coreGmb",
        label: "Core Bulk Specific Gravity (Gmb)",
        type: "computed",
        from: ["dryWeight", "volume"],
        calc: T166.gmb,
        unit: "",
        decimals: 3,
        section: "Lab",
        instruction: "Core Gmb = Dry Mass (A) / Volume."
      },
      {
        key: "matDensityPercent",
        label: "In-Place Mat Density",
        type: "computed",
        from: ["coreGmb", "targetRiceGmm"],
        calc: T166.percent,
        unit: "%",
        decimals: 1,
        section: "Lab",
        instruction: "In-Place Density % = (Core Gmb / Target Rice Gmm) * 100."
      },
      { key: "labMtd", label: "Lab MTD", type: "computed", from: ["coreGmb"], calc: gmb => gmb * MTD_PER_GMB, unit: "", decimals: 1, section: "Lab", instruction: "Core Gmb x 62.2 (the Actual MTD line in the book)." },
      { key: "pqiMinusLabPercent", label: "PQI minus Lab (%)", type: "computed", from: ["pqiPercent", "matDensityPercent"], calc: (pqi, lab) => pqi - lab, unit: "%", decimals: 1, section: "Lab", instruction: "How far the gauge read from the core. Consistently high or low suggests adjusting the offset." },
      { key: "pqiMinusLabMtd", label: "PQI minus Lab (MTD)", type: "computed", from: ["pqiMtd", "labMtd"], calc: (pqi, lab) => pqi - lab, unit: "", decimals: 1, section: "Lab" }
    ]
  },
  bowlCalibration: {
    id: "bowlCalibration",
    title: "Bowl Calibration",
    icon: "⚖️",
    database: { parent: "plant", collection: "calibrations", idKey: "calibrationId", idPrefix: "CAL-", idPad: 2 },
    navigation: { group: true, groupIcon: "⚖️", collectionLabel: "Bowl Calibrations", addLabel: "Add Bowl Calibration", itemLabel: (r, id) => `Calibration @ ${shortStamp(r.calibrationDate)}${r.weight ? " · " + Number(r.weight).toFixed(1) + " g" : ""}` },
    sequence: [
      { key: "weight", label: "Empty Bowl Underwater (B)", type: "input", unit: "g", decimals: 1, step: "0.1", instruction: "Submerge empty bowl and record mass." },
      { key: "calibrationDate", label: "Date & Time Calibrated", type: "datetime", autoKey: "isUsingAutoDate", autoValueKey: "systemCreatedAt", autoHint: "automatic", manualHint: "entered", rerender: true, instruction: "When calibrated." }
    ]
  },
  drybackCorrection: {
    id: "drybackCorrection",
    title: "Dryback Correction",
    icon: "💧",
    database: { parent: "plant", collection: "drybackCorrections", idKey: "drybackId", idPrefix: "DRY-", idPad: 2, defaults: { correction: DEFAULT_DRYBACK_CORRECTION } },
    navigation: { group: true, groupIcon: "💧", collectionLabel: "Dryback Corrections", addLabel: "Add Dryback Correction", itemLabel: (r, id) => `Correction @ ${shortStamp(r.effectiveDate)}${hasNumber(r.correction) ?" · " + Number(r.correction).toFixed(3) : ""}` },
    sequence: [
      { key: "correction", label: "Dryback Correction", type: "input", unit: "", decimals: 3, step: "0.001", instruction: "Subtracted from Gmm SSD." },
      { key: "effectiveDate", label: "In Effect From", type: "datetime", autoKey: "isUsingAutoDate", autoValueKey: "systemCreatedAt", autoHint: "automatic", manualHint: "entered", rerender: true, instruction: "Effective date." }
    ]
  }
};