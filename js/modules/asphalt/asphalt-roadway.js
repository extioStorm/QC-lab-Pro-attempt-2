// @ts-nocheck
// Roadway workday records. Loaded after asphalt-defs.js (adds to TestDefinitions) and before
// asphalt-schema.js (which reads TestDefinitions to build the tree).
const DEFAULT_RATE_PER_INCH = 110;     // lb/yd² per inch compacted; a rule of thumb, a default on each mix
const DEFAULT_SUBLOT_LENGTH_FT = 3000; // kept on the project
const DEFAULT_PQI_TARGET_PERCENT = 88; // reading to calibrate to on uncompacted mat (older pavers)

// Steps marked `optional` (checklists and extra info) are folded into "Checklists & Optional Info"; the rest are
// what affects a test or goes in the Red Book / Diary, and are shown open.
// Steps that are only a box to tick, all in one section.
const checkSteps = (section, items) => items.map(([key, label]) => ({ key, label, type: "check", section, optional: true }));

TestDefinitions.workdayLog = {
  id: "workdayLog",
  title: "Workday Log",
  icon: "📅",
  database: { parent: "project", collection: "workdayLogs", idKey: "workdayLogId", idPrefix: "DAY-", idPad: 2, defaults: { endedAt: null, weatherRecordedAt: null } },
  navigation: { group: true, groupIcon: "📅", collectionLabel: "Workday Logs", addLabel: "Start New Workday", itemLabel: (r, id) => `Workday ${shortStamp(r.startedAt)}${r.techName ? " · " + r.techName : ""}` },
  sequence: [
    { key: "techName", label: "Technician", type: "text", instruction: "Who is working today." },
    { key: "startedAt", label: "Day Started", type: "datetime", autoKey: "isUsingAutoStart", autoValueKey: "systemCreatedAt", autoHint: "automatic", manualHint: "entered", rerender: true, instruction: "Start of the workday. Records logged from here on belong to this day." },
    { key: "endedAt", label: "Day Ended", type: "datetime", instruction: "End of the workday." },

    ...checkSteps("Open Plant", [
      ["garageOpened", "Garage / parking opened"],
      ["doorsUnlocked", "Doors, radiation storage, closets unlocked"],
      ["officeOpened", "Main office open"],
      ["ovensOn", "Ovens on"],
      ["burnersLow", "Burners on low"],
      ["sinkWarming", "Sink water warming"],
      ["officeAcSet", "Office AC set"],
      ["pqiOnCharger", "PQI on charger"]
    ]),
    { key: "gaugeStandardChi", label: "Nuclear Gauge Standard CHI", type: "input", unit: "", decimals: 0, step: "any", section: "Open Plant", instruction: "Asphalt content gauge standard check.", optional: true },
    { key: "gaugeStandardCount", label: "Nuclear Gauge Standard Count", type: "input", unit: "", decimals: 0, step: "1", section: "Open Plant", instruction: "Standard number from the check.", optional: true },

    { key: "mixesPlaced", label: "Mixes Placed Today", type: "text", section: "Plan", instruction: "Check with the scale house: the planned mix or mixes, whether the plant is running or on standby (and why), when production or shipping is expected to start, and any plan changes. Plans are expectations, not guarantees. Then go over it with the plant lab technician: re-verify, ask for anything newer, sort out differences, and agree how you'll keep in touch during the day (save their number in your phone). List the mixes laid today as they go in the Red Book, including patching." },

    { key: "pqiPresetMix", label: "Gauge Mix Preset", type: "text", section: "PQI Setup", instruction: "The mix preset selected on the gauge, so readings use consistent settings." },
    { key: "pqiMixSize", label: "Gauge Mix Size", type: "select", options: ["3/8\"", "1/2\"", "3/4\"", "1\"", "1 1/2\""], section: "PQI Setup", instruction: "The mix (rock) size keyed into the gauge, for the mix you're coring." },
    { key: "pqiId", label: "PQI ID", type: "text", section: "PQI Setup", optional: true },

    ...checkSteps("Load Up", [
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

    { key: "jobsiteAddress", label: "Address / GPS", type: "text", section: "Jobsite Setup", optional: true },
    { key: "inspectorName", label: "Inspector Name", type: "text", section: "Jobsite Setup", optional: true },
    { key: "inspectorPhone", label: "Inspector Phone", type: "text", section: "Jobsite Setup", optional: true },

    { key: "airTemp", label: "Air Temperature", type: "input", unit: "°F", decimals: 0, step: "1", section: "Weather" },
    { key: "windMph", label: "Wind", type: "input", unit: "mph", decimals: 0, step: "1", section: "Weather" },
    { key: "weatherConditions", label: "Conditions", type: "text", section: "Weather" },
    { key: "weatherRecordedAt", label: "Weather Recorded At", type: "datetime", section: "Weather", instruction: "Midday is a good time.", optional: true },

    { key: "labResultsRecorded", label: "Lab results recorded", type: "check", section: "Close Out", optional: true },
    { key: "handedOffToLabTech", label: "Handed off to other lab tech", type: "check", section: "Close Out", optional: true },
    { key: "shutDown", label: "Shut down", type: "check", section: "Close Out", optional: true },
    { key: "lockedUp", label: "Locked and secured", type: "check", section: "Close Out", optional: true },
    { key: "closeNotes", label: "Notes", type: "text", section: "Close Out" }
  ]
};

// One mix laid from one plant on one day (a stream of trucks being placed): what goes on the Red Book's right page.
// It sits under the plant (this mix as produced at this plant), with the samples and cores of the same stream.
TestDefinitions.placement = {
  id: "placement",
  title: "Placement",
  icon: "🛤️",
  database: { parent: "plant", collection: "placements", idKey: "placementId", idPrefix: "PL-", idPad: 2, defaults: { pqiTargetPercent: DEFAULT_PQI_TARGET_PERCENT } },
  navigation: { group: true, groupIcon: "🛤️", collectionLabel: "Placements", addLabel: "Log Placement", itemLabel: (r, id) => `Placement ${shortStamp(r.placedAt)}${r.beginStation ? " · " + r.beginStation + (r.endStation ? " to " + r.endStation : "") : ""}` },
  sequence: [
    { key: "placedAt", label: "Placed On", type: "datetime", autoKey: "isUsingAutoTime", autoValueKey: "systemCreatedAt", autoHint: "automatic", manualHint: "entered", rerender: true, instruction: "When this mix started going down." },
    { key: "pavingRate", label: "Paving Rate", type: "input", unit: "lb/yd²", decimals: 0, step: "1", instruction: "Ask the screed operator what rate they're setting." },
    { key: "ratePerInch", home: "mix", label: "Rate per Inch Compacted", type: "input", unit: "lb/yd²", decimals: 0, step: "1", instruction: "Kept on the mix; rule of thumb 110." },
    { key: "expectedLift", label: "Expected Lift (set PQI depth to match)", type: "computed", from: ["pavingRate", "ratePerInch"], calc: (rate, perInch) => (perInch > 0 ? rate / perInch : null), unit: "in", decimals: 2, instruction: "Paving rate / rate per inch." },
    { key: "paverId", label: "Paver", type: "select", optionsFrom: "paver", rerender: true, instruction: "Pick the paver laying this mix (add it once under Company Lists). Pavers prepack consistently, so last time's calibration is a good start.", note: lastPaverCalibration },
    { key: "pqiTargetPercent", label: "Target Reading, Uncompacted Mat", type: "input", unit: "%", decimals: 1, step: "0.1", instruction: "Worked out on the job: what the gauge is calibrated to read before rolling. 88% on older pavers; newer screeds may need up to about 91%." },
    { key: "pqiOffset", label: "Offset", type: "input", unit: "MTD", decimals: 1, step: "0.1", instruction: "In MTD units, + or -. A -4 offset turns a 145 reading into 141. Found by trial and error." },
    { key: "pqiDepth", label: "Gauge Depth", type: "input", unit: "in", decimals: 2, step: "0.25", instruction: "Depth set on the gauge; it matters relative to the lift thickness. Match the expected lift above." },
    { key: "pqiCalibrated", label: "PQI calibrated for this paver", type: "check", optional: true },
    { key: "beginStation", label: "Begin Station", type: "text", instruction: "As written, e.g. 135+56." },
    { key: "endStation", label: "End Station", type: "text" },
    { key: "stationsRun", label: "Stations Run", type: "select", options: ["Increasing", "Decreasing"] },
    { key: "lane", label: "Lane", type: "select", options: ["Inner", "Outer"] },
    { key: "direction", label: "Direction", type: "text" },
    { key: "matWidth", label: "Mat Width", type: "input", unit: "ft", decimals: 1, step: "0.1" },
    { key: "rollingPattern", label: "Rolling Pattern", type: "text" },
    { key: "rollingPatternSet", label: "Roller operator pattern established", type: "check", optional: true },
  ]
};

// Company equipment, kept beside the projects (database.parent "top") so it is entered once for every job.
TestDefinitions.paver = {
  id: "paver",
  title: "Paver",
  icon: "🚜",
  database: { parent: "top", collection: "pavers", idKey: "paverId", idPrefix: "PAV-", idPad: 2 },
  navigation: { group: true, groupIcon: "🚜", collectionLabel: "Pavers", addLabel: "Add Paver", itemLabel: (r, id) => r.paverName || `Paver ${id}` },
  sequence: [
    { key: "paverName", label: "Paver (name / number)", type: "text" },
    { key: "screed", label: "Screed", type: "text", instruction: "Model / age; older screeds often read about 88% before rolling, newer up to about 91%." },
    { key: "paverNotes", label: "Notes", type: "text", optional: true }
  ]
};
// "Last time on this paver": the latest other placement (any job) that used it, with its target and offset.
function lastPaverCalibration(placement) {
  if (!placement || !placement.paverId) return "";
  let last = null;
  Object.values(appDb.projects || {}).forEach(project => walkRecords("project", project, {}, (type, record) => {
    if (type === "placement" && record !== placement && record.paverId === placement.paverId && (!last || record.placedAt > last.placedAt)) last = record;
  }));
  if (!last) return "First time on this paver.";
  return `Last time (${shortStamp(last.placedAt)}): target ${hasNumber(last.pqiTargetPercent) ? last.pqiTargetPercent + "%" : "--"}, offset ${hasNumber(last.pqiOffset) ? last.pqiOffset : "--"}`;
}

// The roadway technician's workday, in order and in groups. Drawn above the tree for the selected job (renderLensBlock).
// A day covers every mix on the job: records entries gather the day's records from all its mixes and plants.
//   section entry  a section of the day's Workday Log (progress = filled / total)
//   records entry  the day's records of a test, with its add action; with doneKey, how many are done
//   fields entry   the job's, and each placed mix's and plant's, own fields (entities[level].fields)
const todaysCores = { records: "core", timeKey: "systemCreatedAt" };
const todaysCoresRun = { ...todaysCores, doneKey: "coreGmb", doneLabel: "run", warnLabel: "cores not run" };
const WorkdayLenses = {
  roadway: {
    id: "roadway",
    label: "Roadway Workday",
    icon: "🛣️",
    parent: "project",
    window: { type: "workdayLog", startKey: "startedAt", endKey: "endedAt" },
    startLabel: "Start Today's Workday",
    groups: [
      { label: "At the plant (morning)", icon: "🏭", entries: [
        { label: "Open plant", section: "Open Plant" },
        { label: "Plan with scale house and plant lab", section: "Plan" },
        { label: "Mix & job info", fieldsOf: ["project", "mix", "plant"] },
        { label: "PQI setup", section: "PQI Setup" },
        { label: "Load up", section: "Load Up" }
      ] },
      { label: "On the jobsite", icon: "🚧", entries: [
        { label: "Jobsite setup", section: "Jobsite Setup" },
        { label: "Placements (rate, stations, lane, pattern)", records: "placement", timeKey: "systemCreatedAt" },
        { label: "Cores", ...todaysCores },
        { label: "Weather", section: "Weather" }
      ] },
      { label: "Back at the plant", icon: "🏁", entries: [
        { label: "Run the cores", ...todaysCoresRun },
        { label: "Close out", section: "Close Out", warn: todaysCoresRun }
      ] }
    ]
  }
};

// Fields kept on the job, the mix and the plant themselves (entered once, shown on their pages and in the
// "Mix & job info" entry). A field exists only if it feeds the Red Book, the Diary, the PQI or a calculation,
// or is a tool the technician asked for (toolbox); anything else is an instruction or nothing.
const LevelFields = {
  project: [
    { key: "stateProjectNumber", home: "project", label: "State Project Number", type: "text" },
    { key: "roadName", home: "project", label: "Road", type: "text" },
    { key: "sublotLengthFt", home: "project", label: "Sublot Length", type: "input", unit: "ft", decimals: 0, step: "1", optional: true }
  ],
  mix: [
    { key: "mixDescription", home: "mix", label: "Mix (as written in the book)", type: "text", instruction: "As you write it on the Red Book's Mix line, e.g. 1/2\" ESAL C/D." },
    { key: "mixDesignNumber", home: "mix", label: "Mix Design Number", type: "text" },
    { key: "ratePerInch", home: "mix", label: "Rate per Inch Compacted", type: "input", unit: "lb/yd²", decimals: 0, step: "1", rerender: true, optional: true, instruction: "Rule of thumb 110." },
    { key: "nominalSize", home: "mix", label: "Nominal Size", type: "select", options: ["3/8\"", "1/2\"", "3/4\"", "1\"", "1 1/2\""], instruction: "Entered into the PQI at setup; also explains texture and thin-lift trouble." },
    { key: "payItem", home: "mix", label: "Pay Item", type: "text" },
    { key: "designGmm", home: "mix", label: "Mix Design Gmm", type: "input", unit: "", decimals: 3, step: "0.001", optional: true }
  ],
  plant: [
    { key: "transitMinutes", home: "plant", label: "Haul Time, Plant to Job", type: "input", unit: "min", decimals: 0, step: "1", instruction: "Set once for the job. Every core on this plant uses it to find its Rice test." }
  ]
};
