// @ts-nocheck
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