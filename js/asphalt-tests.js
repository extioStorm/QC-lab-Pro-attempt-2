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

const DatabaseMap = {
  rootCollection: "projects",
  rootEntity: "project",
  storage: { databaseKey: "qc_asphalt_db", navigationKey: "qc_asphalt_nav" },
  entities: {
    project: { label: "Project", idKey: "projectId", navKey: "projectId", titleKey: "projectName", icon: "📁", navigationTitle: (r, id) => `${id}: ${r.projectName || "Unnamed Project"}` },
    mix:     { label: "Mix Design", idKey: "mixId", navKey: "mixId", titleKey: "mixName", icon: "🥣", navigationTitle: (r, id) => r.mixName || id },
    plant:   { label: "Plant", idKey: "plantId", navKey: "plantId", titleKey: "plantName", icon: "🏭", navigationTitle: (r, id) => r.plantName || id },
    sample:  { label: "Truck Sample", idKey: "sampleId", navKey: "sampleId", titleKey: "timestamp", icon: "🕒", navigationTitle: (r, id) => `Sample @ ${shortStamp(r.timestamp || r.sampleId || id)}` }
  },
  tests: {
    ...Object.fromEntries(Object.entries(TestDefinitions).map(([type, test]) => [type, test.database]))
  },
  tree: {
    project: { holds: [{
      collection: "mixes",
      node: "mix",
      navigation: {
        addLabel: "Add New Mix Design",
        fields: [{ key: "name", prompt: "Enter Mix Design Name:", required: true }],
        requiredMessage: "A mix design name is required.",
        clearNav: ["plantId", "sampleId", "activeTestType", "activeTestId"],
        create: (project, values) => {
          const id = `MIX-${nextNumber(project.mixes)}`;
          return createDatabaseRecord(project, "mixes", id, { mixId: id, mixName: values.name, designGmm: null, plants: {} });
        }
      }
    }] },
    mix: { holds: [{
      collection: "plants",
      node: "plant",
      navigation: {
        addLabel: "Add New Plant",
        fields: [{ key: "name", prompt: "Enter Plant Name:", required: true }],
        requiredMessage: "A plant name is required.",
        clearNav: ["sampleId", "activeTestType", "activeTestId"],
        create: (mix, values) => {
          const id = `PLANT-${nextNumber(mix.plants)}`;
          const plant = createDatabaseRecord(mix, "plants", id, { plantId: id, plantName: values.name, transitMinutes: DEFAULT_HAUL_MINUTES, samples: {}, cores: {}, calibrations: {}, drybackCorrections: {}, results: {} });
          addDrybackCorrection(plant);
          return plant;
        }
      }
    }] },
    plant: { holds: [{
      collection: "samples",
      node: "sample",
      navigation: {
        group: true,
        groupIcon: "📦",
        groupLabel: "Loose Mix Samples",
        addLabel: "Create New Truck Sample",
        clearActiveTest: true,
        create: plant => {
          const timestamp = getIsoTimestamp();
          let sampleId = timestamp, suffix = 2;
          while (plant.samples && plant.samples[sampleId]) sampleId = `${timestamp}-${suffix++}`;
          return createDatabaseRecord(plant, "samples", sampleId, { sampleId, timestamp, lotNumber: null, riceTests: {}, pills: {} });
        }
      }
    }] },
    sample: { holds: [] }
  },
  views: {
    plant: {
      id: "plant",
      parent: "plant",
      icon: "📊",
      navigationLabel: "Plant Production Summary",
      contextTitle: "{name} · Production Summary",
      cardTitle: "Daily Plant & Mat Summary",
      description: "Aggregate multi-test results for {name}.",
      calculate: calculatePlantResults,
      metrics: [
        { key: "dailyAverageGmm", label: "Daily Average Rice Gmm", caption: "Loose Mix Plant Average", countCollection: "samples", countLabel: "Samples", decimals: 3, unit: "" },
        { key: "averageCoreGmb", label: "Average Core Gmb", caption: "Roadway Mat Average", countCollection: "cores", countLabel: "Cores", decimals: 3, unit: "" },
        { key: "averageMatDensity", label: "Average In-Place Mat Density", caption: "In-Place Pavement Compaction", decimals: 1, unit: "%" }
      ]
    }
  },
  setup: {
    icon: "🚜",
    title: "Start New Shift / Job",
    instruction: "Set up your project to begin logging test data.",
    buttonLabel: "🚀 Initialize Job & Start",
    requiredFields: ["jobId"],
    requiredMessage: "Please enter a Job Number.",
    fields: [
      { key: "jobId", label: "Job / Contract #:", placeholder: "e.g. JOB-2026-A" },
      { key: "jobName", label: "Project Name / Location:", placeholder: "e.g. Hwy 41 Resurfacing" },
      { key: "mixName", label: "Mix Design Name:", placeholder: "e.g. 9.5mm Superpave" },
      { key: "plantName", label: "Plant Facility Name:", placeholder: "e.g. North Drum Plant" }
    ],
    create: (db, values) => {
      const jobId = values.jobId.trim();
      const project = DatabaseMap.rootNavigation.create(db, { jobId, projectName: values.jobName.trim() || jobId });
      const mixId = "MIX-1", plantId = "PLANT-1";
      const mix = DatabaseMap.tree.project.holds[0].navigation.create(project, { name: values.mixName.trim() || "Surface Mix" });
      DatabaseMap.tree.mix.holds[0].navigation.create(mix, { name: values.plantName.trim() || "Main Plant" });
      return { projectId: jobId, mixId, plantId, sampleId: null, activeTestType: null, activeTestId: null };
    }
  },
  rootNavigation: {
    addLabel: "Create New Project / Job",
    icon: "➕",
    level: "project",
    idKey: "projectId",
    fields: [
      { key: "jobId", prompt: "Enter Job # (e.g. 'JOB-2026-A'):", required: true },
      { key: "projectName", prompt: "Enter Project Name:", fallbackFrom: "jobId" }
    ],
    requiredMessage: "Please enter a Job Number.",
    clearNav: ["mixId", "plantId", "sampleId", "activeTestType", "activeTestId"],
    create: (db, values) => createDatabaseRecord(db, DatabaseMap.rootCollection, values.jobId, {
      projectId: values.jobId,
      projectName: values.projectName || values.jobId,
      mixes: {}
    })
  }
};

Object.entries(DatabaseMap.tests).forEach(([type, test]) => {
  const parent = DatabaseMap.tree[test.parent];
  if (parent) parent.holds.push({ test: type });
});

const AsphaltPlantResults = {
  dailyAverageGmm: { calc: vals => (vals.length ? roundHalfToEven(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null) },
  averageCoreGmb: { calc: vals => (vals.length ? roundHalfToEven(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null) },
  averageMatDensity: { calc: vals => (vals.length ? roundHalfToEven(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : null) }
};

function calculatePlantResults(plant) {
  if (!plant) return;
  plant.results = plant.results || {};
  const gmmValues = [];
  Object.values(plant.samples || {}).forEach(s => {
    Object.values(s.riceTests || {}).forEach(r => {
      const val = resolve(r.measuredGmm);
      if (val !== null && val !== undefined && !isNaN(val) && Number(val) > 0) gmmValues.push(Number(val));
    });
  });
  plant.results.dailyAverageGmm = AsphaltPlantResults.dailyAverageGmm.calc(gmmValues);
  const coreGmbValues = [], matDensityValues = [];
  Object.values(plant.cores || {}).forEach(c => {
    const gmb = resolve(c.coreGmb);
    if (gmb !== null && gmb !== undefined && !isNaN(gmb) && Number(gmb) > 0) coreGmbValues.push(Number(gmb));
    const density = resolve(c.matDensityPercent);
    if (density !== null && density !== undefined && !isNaN(density) && Number(density) > 0) matDensityValues.push(Number(density));
  });
  plant.results.averageCoreGmb = AsphaltPlantResults.averageCoreGmb.calc(coreGmbValues);
  plant.results.averageMatDensity = AsphaltPlantResults.averageMatDensity.calc(matDensityValues);
}

function addBowlCalibration(plant) {
  const now = getIsoTimestamp();
  const id = `CAL-${String(nextNumber(plant.calibrations)).padStart(2, "0")}`;
  return createDatabaseRecord(plant, "calibrations", id, { calibrationId: id, systemCreatedAt: now, calibrationDate: now, isUsingAutoDate: true, weight: null });
}

function addDrybackCorrection(plant) {
  const now = getIsoTimestamp();
  const id = `DRY-${String(nextNumber(plant.drybackCorrections)).padStart(2, "0")}`;
  return createDatabaseRecord(plant, "drybackCorrections", id, { calibrationId: id, drybackId: id, systemCreatedAt: now, effectiveDate: now, isUsingAutoDate: true, correction: DEFAULT_DRYBACK_CORRECTION });
}

function addRiceTest(sample) {
  const nextId = String(nextNumber(sample.riceTests));
  const riceTest = {
    riceTestId: nextId,
    bowlCalibrationWeight: createOverridable(),
    matchedCalibrationId: null,
    drySampleWeight: null,
    bowlAndSampleSubmergedWeight: null,
    sampleSubmergedWeight: createOverridable(),
    sampleVolumeBasis:     createOverridable(),
    drybackCorrection:     createOverridable(),
    matchedDrybackId: null,
    gmmSsd:                createOverridable(),
    measuredGmm:           createOverridable()
  };
  sample.riceTests[nextId] = riceTest;
  return riceTest;
}

function addPill(sample) {
  const nextId = String(nextNumber(sample.pills));
  const pill = {
    pillId: nextId,
    dryWeight: null,
    submergedWeight: null,
    surfaceDryWeight: null,
    volume:       createOverridable(),
    gmb:          createOverridable(),
    riceGmm:      createOverridable(),
    percentOfGmm: createOverridable(),
    riceTestId: null
  };
  sample.pills[nextId] = pill;
  return pill;
}

function addRoadwayCore(plant, coreId, manualLaydownTime = null) {
  const now = getIsoTimestamp();
  const core = {
    coreId,
    station: "",
    systemCreatedAt: now,
    laydownTimestamp: manualLaydownTime || now,
    isUsingAutoTime: !manualLaydownTime,
    riceChoice: { mode: "auto", parentId: null, subId: null },
    dryWeight: null,
    submergedWeight: null,
    surfaceDryWeight: null,
    volume:            createOverridable(),
    coreGmb:           createOverridable(),
    targetRiceGmm:     createOverridable(),
    matDensityPercent: createOverridable(),
    matchedSampleId: null,
    matchedRiceTestId: null
  };
  plant.cores[coreId] = core;
  return core;
}

const PolicyConfigs = {
  pillRice: {
    policy: "parentPicker",
    parent: "sample",
    collection: "riceTests",
    idKey: "riceTestId",
    valueKey: "measuredGmm",
    choiceKey: "riceTestId",
    resultKey: "riceGmm",
    testType: "rice",
    label: "Rice Test",
    decimals: 3
  },
  bowlCalibration: {
    policy: "latestRecord",
    ancestor: "plant",
    collection: "calibrations",
    idKey: "calibrationId",
    valueKey: "weight",
    timeKey: "calibrationDate",
    refTime: { level: "sample", key: "timestamp" },
    matchStoreKey: "matchedCalibrationId",
    testType: "bowlCalibration",
    labels: {
      item: "bowl calibration",
      missing: "No bowl calibration on file for this plant yet.",
      fallbackNote: "Earliest calibration on file is being used."
    }
  },
  drybackCorrection: {
    policy: "latestRecord",
    ancestor: "plant",
    collection: "drybackCorrections",
    idKey: "drybackId",
    valueKey: "correction",
    timeKey: "effectiveDate",
    refTime: { level: "sample", key: "timestamp" },
    matchStoreKey: "matchedDrybackId",
    testType: "drybackCorrection",
    allowZero: true,
    labels: {
      item: "dryback correction",
      missing: "No dryback correction on file for this plant yet.",
      fallbackNote: "Earliest correction on file is being used."
    }
  },
  coreRice: {
    policy: "timeProximity",
    ancestor: "plant",
    itemLevel: "sample",
    itemsCollection: "samples",
    parentItemKey: "sampleId",
    timestampKey: "timestamp",
    subCollection: "riceTests",
    subTestType: "rice",
    idKey: "riceTestId",
    valueKey: "measuredGmm",
    myTimestampKey: "laydownTimestamp",
    eventAutoKey: "isUsingAutoTime",
    offsetMinutesKey: "transitMinutes",
    fallbackLevel: "mix",
    fallbackKey: "designGmm",
    choiceKey: "riceChoice",
    resultKey: "targetRiceGmm",
    matchStoreKeys: { parentId: "matchedSampleId", id: "matchedRiceTestId" },
    decimals: 3,
    labels: {
      item: "Sample",
      sub: "Rice Test",
      event: "Lay time",
      offset: "Haul time",
      fallback: "mix design",
      eventAuto: "Lay time is automatic from when core was logged."
    }
  }
};