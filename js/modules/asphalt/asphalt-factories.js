// @ts-nocheck
const AsphaltPlantResults = {
  dailyAverageGmm: {
    calc: vals => (vals.length ? roundHalfToEven(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null)
  },
  averageCoreGmb: {
    calc: vals => (vals.length ? roundHalfToEven(vals.reduce((a, b) => a + b, 0) / vals.length, 3) : null)
  },
  averageMatDensity: {
    calc: vals => (vals.length ? roundHalfToEven(vals.reduce((a, b) => a + b, 0) / vals.length, 1) : null)
  }
};

function calculatePlantResults(plant) {
  if (!plant) return;
  plant.results = plant.results || {};
  const gmmValues = [];
  Object.values(plant.samples || {}).forEach(s => {
    Object.values(s.riceTests || {}).forEach(r => {
      const val = resolve(r.measuredGmm);
      if (val !== null && val !== undefined && !isNaN(val) && Number(val) > 0) {
        gmmValues.push(Number(val));
      }
    });
  });
  plant.results.dailyAverageGmm = AsphaltPlantResults.dailyAverageGmm.calc(gmmValues);

  const coreGmbValues = [], matDensityValues = [];
  Object.values(plant.cores || {}).forEach(c => {
    const gmb = resolve(c.coreGmb);
    if (gmb !== null && gmb !== undefined && !isNaN(gmb) && Number(gmb) > 0) {
      coreGmbValues.push(Number(gmb));
    }
    const density = resolve(c.matDensityPercent);
    if (density !== null && density !== undefined && !isNaN(density) && Number(density) > 0) {
      matDensityValues.push(Number(density));
    }
  });
  plant.results.averageCoreGmb = AsphaltPlantResults.averageCoreGmb.calc(coreGmbValues);
  plant.results.averageMatDensity = AsphaltPlantResults.averageMatDensity.calc(matDensityValues);
}

function addBowlCalibration(plant) {
  const now = getIsoTimestamp();
  const id = `CAL-${String(nextNumber(plant.calibrations)).padStart(2, "0")}`;
  return createDatabaseRecord(plant, "calibrations", id, {
    calibrationId: id,
    systemCreatedAt: now,
    calibrationDate: now,
    isUsingAutoDate: true,
    weight: null
  });
}

function addDrybackCorrection(plant) {
  const now = getIsoTimestamp();
  const id = `DRY-${String(nextNumber(plant.drybackCorrections)).padStart(2, "0")}`;
  return createDatabaseRecord(plant, "drybackCorrections", id, {
    drybackId: id,
    systemCreatedAt: now,
    effectiveDate: now,
    isUsingAutoDate: true,
    correction: DEFAULT_DRYBACK_CORRECTION
  });
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