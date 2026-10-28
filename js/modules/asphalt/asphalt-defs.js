// @ts-nocheck
const DEFAULT_DRYBACK_CORRECTION = 0.005;
const DEFAULT_HAUL_MINUTES = 30;

const T166 = {
  volume:  (ssd, submerged) => ssd - submerged,
  gmb:     (dry, volume) => (volume > 0 ? dry / volume : null),
  percent: (gmb, gmm) => ((gmb && gmm > 0) ? roundHalfToEven(gmb / gmm, 5) * 100 : null)
};

const TestDefinitions = {
  rice: {
    id: "rice",
    title: "Rice Test (Gmm)",
    icon: "🍚",
    database: { parent: "sample", collection: "riceTests", idKey: "riceTestId", create: sample => addRiceTest(sample) },
    navigation: { group: false, collectionLabel: "Rice Tests", addLabel: "Add Rice Test", itemLabel: (record, id) => `Rice Test #${id}` },
    sequence: [
      {
        key: "bowlCalibrationWeight",
        section: "prereq",
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
        section: "prereq",
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
    database: { parent: "sample", collection: "pills", idKey: "pillId", create: sample => addPill(sample) },
    navigation: { group: false, collectionLabel: "Gyratory Pills", addLabel: "Add Gyratory Pill", itemLabel: (record, id) => `Gyratory Pill #${id}` },
    sequence: [
      {
        key: "riceTestId",
        section: "prereq",
        label: "Rice Test for This Pill",
        type: "choice",
        resolver: "pillRice",
        instruction: "A pill uses the Rice test from its own sample."
      },
      {
        key: "riceGmm",
        section: "prereq",
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
    database: {
      parent: "plant",
      collection: "cores",
      idKey: "coreId",
      create: plant => {
        const nextNum = nextNumber(plant.cores);
        return addRoadwayCore(plant, `CORE-${String(nextNum).padStart(2, "0")}`);
      }
    },
    navigation: { group: true, groupIcon: "🛣️", collectionLabel: "Roadway Cores", addLabel: "Log New Roadway Core", itemLabel: (core, id) => `Core ${id} (${core.station || "No Station"})` },
    sequence: [
      {
        key: "transitMinutes",
        home: "plant",
        section: "prereq",
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
        home: "mix",
        section: "prereq",
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
        section: "prereq",
        label: "Rice Test for This Core",
        type: "choice",
        resolver: "coreRice",
        instruction: "Closest Rice test to target laydown time."
      },
      {
        key: "targetRiceGmm",
        section: "prereq",
        label: "Target Rice Gmm",
        type: "computed",
        from: ["laydownTimestamp", "transitMinutes", "designGmm", "riceChoice"],
        fetch: "coreRice",
        reads: { type: "rice", key: "measuredGmm" },
        unit: "",
        decimals: 3,
        instruction: "Gmm reference."
      },
      {
        key: "laydownTimestamp",
        label: "Lay Time (placement time)",
        type: "datetime",
        autoKey: "isUsingAutoTime",
        autoValueKey: "systemCreatedAt",
        autoHint: "automatic",
        manualHint: "entered",
        rerender: true,
        instruction: "When the section of mat was laid."
      },
      {
        key: "dryWeight",
        label: "Dry Core Mass in Air (A)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Weigh trimmed, dry core in air."
      },
      {
        key: "submergedWeight",
        label: "Submerged Core Mass (C)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
        instruction: "Immerse core in water bath."
      },
      {
        key: "surfaceDryWeight",
        label: "SSD Core Mass in Air (B)",
        type: "input",
        unit: "g",
        decimals: 1,
        step: "0.1",
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
        instruction: "In-Place Density % = (Core Gmb / Target Rice Gmm) * 100."
      }
    ]
  },
  bowlCalibration: {
    id: "bowlCalibration",
    title: "Bowl Calibration",
    icon: "⚖️",
    database: { parent: "plant", collection: "calibrations", idKey: "calibrationId", create: plant => addBowlCalibration(plant) },
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
    database: { parent: "plant", collection: "drybackCorrections", idKey: "drybackId", create: plant => addDrybackCorrection(plant) },
    navigation: { group: true, groupIcon: "💧", collectionLabel: "Dryback Corrections", addLabel: "Add Dryback Correction", itemLabel: (r, id) => `Correction @ ${shortStamp(r.effectiveDate)}${r.correction !== null && r.correction !== undefined ? " · " + Number(r.correction).toFixed(3) : ""}` },
    sequence: [
      { key: "correction", label: "Dryback Correction", type: "input", unit: "", decimals: 3, step: "0.001", instruction: "Subtracted from Gmm SSD." },
      { key: "effectiveDate", label: "In Effect From", type: "datetime", autoKey: "isUsingAutoDate", autoValueKey: "systemCreatedAt", autoHint: "automatic", manualHint: "entered", rerender: true, instruction: "Effective date." }
    ]
  }
};