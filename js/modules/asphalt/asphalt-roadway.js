// @ts-nocheck
// Roadway workday records. Loaded after asphalt-defs.js (adds to TestDefinitions) and before
// asphalt-schema.js (which reads TestDefinitions to build the tree).
const DEFAULT_RATE_PER_INCH = 110;     // lb/yd² per inch compacted; a rule of thumb, kept on the mix
const DEFAULT_SUBLOT_LENGTH_FT = 3000; // kept on the project
const DEFAULT_PQI_START_OFFSET = 88;   // % on uncompacted mat (manufacturer's recommendation)

// Steps that are only a box to tick, all in one section.
const checkSteps = (section, items) => items.map(([key, label]) => ({ key, label, type: "check", section }));

TestDefinitions.workdayLog = {
  id: "workdayLog",
  title: "Workday Log",
  icon: "📅",
  database: { parent: "plant", collection: "workdayLogs", idKey: "workdayLogId", idPrefix: "DAY-", idPad: 2, defaults: { endedAt: null, expectedStart: null, weatherRecordedAt: null, pqiStartOffset: DEFAULT_PQI_START_OFFSET } },
  navigation: { group: true, groupIcon: "📅", collectionLabel: "Workday Logs", addLabel: "Start New Workday", itemLabel: (r, id) => `Workday ${shortStamp(r.startedAt)}${r.techName ? " · " + r.techName : ""}` },
  sequence: [
    { key: "techName", label: "Technician", type: "text", instruction: "Who is working today." },
    { key: "startedAt", label: "Day Started", type: "datetime", autoKey: "isUsingAutoStart", autoValueKey: "systemCreatedAt", autoHint: "automatic", manualHint: "entered", rerender: true, instruction: "Start of the workday. Records logged from here on belong to this day." },
    { key: "endedAt", label: "Day Ended", type: "datetime", instruction: "End of the workday." },

    ...checkSteps("1 · Open Plant", [
      ["garageOpened", "Garage / parking opened"],
      ["doorsUnlocked", "Doors, radiation storage, closets unlocked"],
      ["officeOpened", "Main office open"],
      ["ovensOn", "Ovens on"],
      ["burnersLow", "Burners on low"],
      ["sinkWarming", "Sink water warming"],
      ["officeAcSet", "Office AC set"],
      ["pqiOnCharger", "PQI on charger"]
    ]),
    { key: "gaugeStandardChi", label: "Nuclear Gauge Standard CHI", type: "input", unit: "", decimals: 0, step: "any", section: "1 · Open Plant", instruction: "Asphalt content gauge standard check." },
    { key: "gaugeStandardCount", label: "Nuclear Gauge Standard Count", type: "input", unit: "", decimals: 0, step: "1", section: "1 · Open Plant", instruction: "Standard number from the check." },

    { key: "plannedMix", label: "Planned Mix", type: "text", section: "2 · Plan", instruction: "From the scale house." },
    { key: "plantStatus", label: "Plant Status", type: "select", options: ["Running", "Standby", "Not running"], section: "2 · Plan" },
    { key: "plantStatusReason", label: "Status Reason", type: "text", section: "2 · Plan" },
    { key: "expectedStart", label: "Expected Start", type: "datetime", section: "2 · Plan", instruction: "When production / shipping is expected to start." },
    { key: "planChanges", label: "Plan Changes", type: "text", section: "2 · Plan" },
    { key: "plantLabTech", label: "Plant Lab Technician", type: "text", section: "2 · Plan" },
    { key: "verifiedWithPlantLab", label: "Plan verified with plant lab", type: "check", section: "2 · Plan" },
    { key: "communicationPlan", label: "How We'll Communicate", type: "text", section: "2 · Plan" },

    { key: "pqiId", label: "PQI ID", type: "text", section: "3 · PQI Setup" },
    { key: "paverScreed", label: "Paver / Screed", type: "text", section: "3 · PQI Setup" },
    { key: "pqiStartOffset", label: "Starting Offset", type: "input", unit: "%", decimals: 1, step: "0.1", section: "3 · PQI Setup", instruction: "Usually 88% unless the screed or past experience says otherwise." },
    { key: "pqiAdjustedOffset", label: "Adjusted Offset", type: "input", unit: "%", decimals: 1, step: "0.1", section: "3 · PQI Setup" },
    { key: "pqiOffsetReason", label: "Reason for Change", type: "text", section: "3 · PQI Setup" },
    { key: "pqiCalibrated", label: "PQI calibrated for this setup", type: "check", section: "3 · PQI Setup" },

    ...checkSteps("4 · Load Up", [
      ["trailerChecked", "Trailer hitch, pin, chains, lights"],
      ["generatorChecked", "Generator fueled, started and ran"],
      ["waterFilled", "Water barrel filled"],
      ["iceLoaded", "Ice for expected cores"],
      ["markingToolsLoaded", "Crayon, paint, core-removal tool"],
      ["generalToolsLoaded", "Shovel, asphalt container, tamp, boards"],
      ["measuringToolsLoaded", "Tape and measuring wheel"],
      ["pqiLoaded", "Charged PQI in the truck"],
      ["redBookReady", "Red book primed, pen"],
      ["truckFueled", "Truck fuel above half"]
    ]),

    { key: "jobsiteAddress", label: "Address / GPS", type: "text", section: "5 · Jobsite Setup" },
    { key: "road", label: "Road", type: "text", section: "5 · Jobsite Setup" },
    { key: "transitMinutes", home: "plant", label: "Haul Time, Plant to Job", type: "input", unit: "min", decimals: 0, step: "1", section: "5 · Jobsite Setup", instruction: "Set once for the job. Every core on this plant uses it to find its Rice test." },
    { key: "beginStation", label: "Begin Station", type: "text", section: "5 · Jobsite Setup", instruction: "As written, e.g. 135+56." },
    { key: "stationsRun", label: "Stations Run", type: "select", options: ["Increasing", "Decreasing"], section: "5 · Jobsite Setup" },
    { key: "lane", label: "Lane", type: "select", options: ["Inner", "Outer"], section: "5 · Jobsite Setup" },
    { key: "direction", label: "Direction", type: "text", section: "5 · Jobsite Setup" },
    { key: "matWidth", label: "Mat Width", type: "input", unit: "ft", decimals: 1, step: "0.1", section: "5 · Jobsite Setup" },
    { key: "pavingRate", label: "Paving Rate", type: "input", unit: "lb/yd²", decimals: 0, step: "1", section: "5 · Jobsite Setup" },
    { key: "ratePerInch", home: "mix", label: "Rate per Inch Compacted", type: "input", unit: "lb/yd²", decimals: 0, step: "1", section: "5 · Jobsite Setup", instruction: "Kept on the mix. Rule of thumb 110; agencies vary." },
    { key: "expectedThickness", label: "Expected Thickness", type: "computed", from: ["pavingRate", "ratePerInch"], calc: (rate, perInch) => (perInch > 0 ? rate / perInch : null), unit: "in", decimals: 2, section: "5 · Jobsite Setup", instruction: "Paving rate / rate per inch." },
    { key: "rollingPattern", label: "Rolling Pattern", type: "text", section: "5 · Jobsite Setup" },
    { key: "rollingPatternSet", label: "Roller operator pattern established", type: "check", section: "5 · Jobsite Setup" },
    { key: "inspectorName", label: "Inspector Name", type: "text", section: "5 · Jobsite Setup" },
    { key: "inspectorPhone", label: "Inspector Phone", type: "text", section: "5 · Jobsite Setup" },
    { key: "sublotLengthFt", home: "project", label: "Sublot Length", type: "input", unit: "ft", decimals: 0, step: "1", section: "5 · Jobsite Setup", instruction: "Kept on the project." },

    { key: "airTemp", label: "Air Temperature", type: "input", unit: "°F", decimals: 0, step: "1", section: "6 · Weather" },
    { key: "windMph", label: "Wind", type: "input", unit: "mph", decimals: 0, step: "1", section: "6 · Weather" },
    { key: "weatherConditions", label: "Conditions", type: "text", section: "6 · Weather" },
    { key: "weatherRecordedAt", label: "Weather Recorded At", type: "datetime", section: "6 · Weather", instruction: "Midday is a good time." },

    { key: "endStation", label: "End Station", type: "text", section: "7 · Close Out" },
    { key: "labResultsRecorded", label: "Lab results recorded", type: "check", section: "7 · Close Out" },
    { key: "handedOffToLabTech", label: "Handed off to other lab tech", type: "check", section: "7 · Close Out" },
    { key: "shutDown", label: "Shut down", type: "check", section: "7 · Close Out" },
    { key: "lockedUp", label: "Locked and secured", type: "check", section: "7 · Close Out" },
    { key: "closeNotes", label: "Notes", type: "text", section: "7 · Close Out" }
  ]
};
