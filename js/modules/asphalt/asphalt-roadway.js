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
  database: { parent: "project", collection: "workdayLogs", idKey: "workdayLogId", idPrefix: "DAY-", idPad: 2, defaults: { endedAt: null, weatherRecordedAt: null, pqiTargetPercent: DEFAULT_PQI_TARGET_PERCENT } },
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

    { key: "pqiTargetPercent", label: "Target Reading, Uncompacted Mat", type: "input", unit: "%", decimals: 1, step: "0.1", section: "PQI Setup", instruction: "What the gauge is calibrated to read before rolling. 88% on older pavers; newer screeds may need up to about 91%." },
    { key: "pqiPresetMix", label: "Gauge Mix Preset", type: "text", section: "PQI Setup", instruction: "The mix preset selected on the gauge, so readings use consistent settings. The gauge also needs the mix's nominal size (on the mix's page, under Mix & job info)." },
    { key: "pqiDepth", label: "Gauge Depth", type: "input", unit: "in", decimals: 2, step: "0.25", section: "PQI Setup", instruction: "Depth set on the gauge; it matters relative to the lift thickness. The expected lift is on the mix's page (Mix & job info): its paving rate / 110." },
    { key: "pqiOffset", label: "Offset", type: "input", unit: "MTD", decimals: 1, step: "0.1", section: "PQI Setup", instruction: "In MTD units, + or -. A -4 offset turns a 145 reading into 141. Found by trial and error." },
    { key: "pqiCalibrated", label: "PQI calibrated for this setup", type: "check", section: "PQI Setup", optional: true },
    { key: "pqiId", label: "PQI ID", type: "text", section: "PQI Setup", optional: true },
    { key: "paverScreed", label: "Paver / Screed", type: "text", section: "PQI Setup", optional: true },

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
    { key: "beginStation", label: "Begin Station", type: "text", section: "Jobsite Setup", instruction: "As written, e.g. 135+56." },
    { key: "stationsRun", label: "Stations Run", type: "select", options: ["Increasing", "Decreasing"], section: "Jobsite Setup" },
    { key: "lane", label: "Lane", type: "select", options: ["Inner", "Outer"], section: "Jobsite Setup" },
    { key: "direction", label: "Direction", type: "text", section: "Jobsite Setup" },
    { key: "matWidth", label: "Mat Width", type: "input", unit: "ft", decimals: 1, step: "0.1", section: "Jobsite Setup" },
    { key: "rollingPattern", label: "Rolling Pattern", type: "text", section: "Jobsite Setup" },
    { key: "rollingPatternSet", label: "Roller operator pattern established", type: "check", section: "Jobsite Setup", optional: true },
    { key: "inspectorName", label: "Inspector Name", type: "text", section: "Jobsite Setup", optional: true },
    { key: "inspectorPhone", label: "Inspector Phone", type: "text", section: "Jobsite Setup", optional: true },

    { key: "airTemp", label: "Air Temperature", type: "input", unit: "°F", decimals: 0, step: "1", section: "Weather" },
    { key: "windMph", label: "Wind", type: "input", unit: "mph", decimals: 0, step: "1", section: "Weather" },
    { key: "weatherConditions", label: "Conditions", type: "text", section: "Weather" },
    { key: "weatherRecordedAt", label: "Weather Recorded At", type: "datetime", section: "Weather", instruction: "Midday is a good time.", optional: true },

    { key: "endStation", label: "End Station", type: "text", section: "Close Out" },
    { key: "labResultsRecorded", label: "Lab results recorded", type: "check", section: "Close Out", optional: true },
    { key: "handedOffToLabTech", label: "Handed off to other lab tech", type: "check", section: "Close Out", optional: true },
    { key: "shutDown", label: "Shut down", type: "check", section: "Close Out", optional: true },
    { key: "lockedUp", label: "Locked and secured", type: "check", section: "Close Out", optional: true },
    { key: "closeNotes", label: "Notes", type: "text", section: "Close Out" }
  ]
};

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
    { key: "pavingRate", home: "mix", label: "Paving Rate", type: "input", unit: "lb/yd²", decimals: 0, step: "1", rerender: true, instruction: "Ask the screed operator what rate they're setting." },
    { key: "expectedLift", home: "mix", label: "Expected Lift (set PQI depth to match)", type: "computed", from: ["pavingRate", "ratePerInch"], calc: (rate, perInch) => (perInch > 0 ? rate / perInch : null), unit: "in", decimals: 2 },
    { key: "ratePerInch", home: "mix", label: "Rate per Inch Compacted", type: "input", unit: "lb/yd²", decimals: 0, step: "1", rerender: true, optional: true, instruction: "Rule of thumb 110." },
    { key: "nominalSize", home: "mix", label: "Nominal Size", type: "select", options: ["3/8\"", "1/2\"", "3/4\"", "1\"", "1 1/2\""], instruction: "Entered into the PQI at setup; also explains texture and thin-lift trouble." },
    { key: "payItem", home: "mix", label: "Pay Item", type: "text" },
    { key: "designGmm", home: "mix", label: "Mix Design Gmm", type: "input", unit: "", decimals: 3, step: "0.001", optional: true }
  ],
  plant: [
    { key: "transitMinutes", home: "plant", label: "Haul Time, Plant to Job", type: "input", unit: "min", decimals: 0, step: "1", instruction: "Set once for the job. Every core on this plant uses it to find its Rice test." }
  ]
};
