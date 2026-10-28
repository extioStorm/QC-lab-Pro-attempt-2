// @ts-nocheck
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