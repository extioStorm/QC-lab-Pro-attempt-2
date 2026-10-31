function readsOf(step) {
  return [].concat((step && step.reads) || []);
}
function buildDependencyIndex() {
  const usedBy = {};
  const readers = {};
  Object.keys(TestDefinitions).forEach(type => {
    usedBy[type] = usedBy[type] || {};
    TestDefinitions[type].sequence.forEach(step => {
      (step.from || []).forEach(k => {
        (usedBy[type][k] = usedBy[type][k] || []).push(step.key);
      });
      readsOf(step).forEach(rd => {
        const r = (readers[rd.type] = readers[rd.type] || {});
        (r[rd.key] = r[rd.key] || []).push({ type, key: step.key });
      });
    });
  });
  return { usedBy, readers };
}
const Deps = buildDependencyIndex();
function stepOf(type, key) {
  const def = TestDefinitions[type];
  return def ? def.sequence.find(s => s.key === key) || null : null;
}
// Steps that are shown as "prerequisites": values that live elsewhere or are chosen/fetched from another record.
// A step the definition places in a section is entered in this test, so it is shown in its section instead.
function isPrereqStep(step) {
  return Boolean(step && !step.section && (step.home || step.fetch || step.resolver));
}
// A test's steps (prerequisites left out) as consecutive sections: [{ name, steps }]. Steps without a
// section form one of their own, named "".
function stepSections(testDef) {
  const sections = [];
  testDef.sequence.filter(step => !isPrereqStep(step)).forEach(step => {
    const name = step.section || "";
    if (!sections.length || sections[sections.length - 1].name !== name) sections.push({ name, steps: [] });
    sections[sections.length - 1].steps.push(step);
  });
  return sections;
}
function valueOf(type, record, ctx, key) {
  const step = stepOf(type, key);
  if (step && step.type === "computed") return resolve(record[key]);
  if (step && step.home && ctx[step.home]) return ctx[step.home][key];
  return record ? record[key] : null;
}
// Whether a step has been filled in: a ticked box, some text or a pick, a number, a date.
function isStepFilled(type, record, ctx, step) {
  const value = valueOf(type, record, ctx, step.key);
  if (step.type === "check") return value === true;
  return hasNumber(value) || (typeof value === "string" && value.trim() !== "");
}
// The day a lens looks at: the latest record of `window.type` in `scope` (by its start time) and its span,
// which ends at that record's end time, or stays open while it has none.
function currentWindow(scope, window) {
  const collection = DatabaseMap.tests[window.type].collection;
  const latest = Object.values(scope[collection] || {})
    .map(record => ({ record, start: parseLocalTime(record[window.startKey]) }))
    .filter(entry => entry.start !== null)
    .sort((a, b) => a.start - b.start)
    .pop();
  if (!latest) return null;
  const end = parseLocalTime(latest.record[window.endKey]);
  return { record: latest.record, start: latest.start, end: end === null ? Infinity : end };
}
// The records of a test in `scope` whose `timeKey` falls inside a window, and those without a `doneKey` value yet.
function recordsInWindow(scope, { records: type, timeKey, doneKey }, win) {
  const records = Object.values(scope[DatabaseMap.tests[type].collection] || {}).filter(record => {
    const time = parseLocalTime(record[timeKey]);
    return time !== null && time >= win.start && time <= win.end;
  });
  const notDone = doneKey ? records.filter(record => !hasNumber(resolve(record[doneKey]))) : [];
  return { records, notDone };
}
function computeStep(type, step, record, ctx) {
  let raw = null;
  if (step.fetch && SourceResolvers[step.fetch]) {
    raw = SourceResolvers[step.fetch].value(ctx);
  } else if (step.from && typeof step.calc === "function") {
    const vals = step.from.map(k => valueOf(type, record, ctx, k));
    raw = vals.every(hasNumber) ? step.calc(...vals) : null;
  }
  const next = roundHalfToEven(raw, step.decimals);
  const prev = record[step.key] ? record[step.key].auto : null;
  if (record[step.key]) {
    record[step.key].auto = next;
  }
  return prev !== next;
}
function recomputeRecord(type, record, ctx) {
  const steps = TestDefinitions[type].sequence;
  let changed = true;
  let passes = 0;
  const allChangedKeys = [];
  while (changed && passes < 10) {
    changed = false;
    passes++;
    steps.forEach(step => {
      if (step.type === "computed" && computeStep(type, step, record, ctx)) {
        changed = true;
        if (!allChangedKeys.includes(step.key)) allChangedKeys.push(step.key);
      }
    });
  }
  return allChangedKeys;
}
function walkRecords(node, obj, ctx, fn) {
  if (!obj) return;
  const here = Object.assign({}, ctx, { [node]: obj });
  const holds = (DatabaseMap.tree[node] && DatabaseMap.tree[node].holds) || [];
  const descendants = holds.filter(hold => hold.node).map(hold => hold.node);
  while (descendants.length) {
    const descendant = descendants.pop();
    delete here[descendant];
    ((DatabaseMap.tree[descendant] && DatabaseMap.tree[descendant].holds) || [])
      .filter(hold => hold.node).forEach(hold => descendants.push(hold.node));
  }
  holds.forEach(h => {
    const testDefinition = h.test && DatabaseMap.tests[h.test];
    const collection = h.collection || (testDefinition && testDefinition.collection);
    Object.values(obj[collection] || {}).forEach(child => {
      if (h.node) walkRecords(h.node, child, here, fn);
      else fn(h.test, child, Object.assign({}, here, { record: child }));
    });
  });
}
function getDependents(type, record, ctx, key) {
  const found = [];
  ((Deps.readers[type] || {})[key] || []).forEach(reader => {
    const step = stepOf(reader.type, reader.key);
    if (!step || !step.fetch || !SourceResolvers[step.fetch]) return;
    const resolver = SourceResolvers[step.fetch];
    const root = DatabaseMap.rootEntity;
    walkRecords(root, ctx[root], ctx, (t, rec, c) => {
      if (t === reader.type && resolver.isFedBy(c, record, ctx)) {
        found.push({ type: t, record: rec, ctx: c, key: reader.key });
      }
    });
  });
  return found;
}
// A value changed (an input, or a manual override switched on/off). Recalculate this record,
// then every other record that reads what changed. Nothing else is touched.
// Records are taken in dependency order (typeRank), so a record that reads two things that both
// changed is calculated once, after both, and later triggers merge into its pending seeds.
function propagate(type, record, ctx, seeds = []) {
  const pending = new Map([[record, { type, record, ctx, seeds: new Set(seeds) }]]);
  while (pending.size) {
    const job = [...pending.values()].reduce((a, b) => (typeRank(b.type) < typeRank(a.type) ? b : a));
    pending.delete(job.record);
    const changedKeys = recomputeRecord(job.type, job.record, job.ctx);
    // the seeds count as changed too: a manual override changes the effective value, not `auto`
    new Set(changedKeys.concat([...job.seeds])).forEach(k => {
      getDependents(job.type, job.record, job.ctx, k).forEach(d => {
        if (pending.has(d.record)) pending.get(d.record).seeds.add(d.key);
        else pending.set(d.record, { type: d.type, record: d.record, ctx: d.ctx, seeds: new Set([d.key]) });
      });
    });
  }
  recalculateDeclaredViews(ctx);
}
// A declared view calculates itself: a custom `calculate(scope, ctx)` when it has one, otherwise from the
// metrics it declares (see calculateViewMetrics).
function calculateView(view, scope, ctx) {
  if (typeof view.calculate === "function") view.calculate(scope, ctx);
  else calculateViewMetrics(view, scope);
}
// Average-type metrics: { key, decimals, average: { path: [collection, ...], field } }.
// Walks `path` down from the view's parent record, averages every usable (positive) `field` value found,
// and stores the result under the metric's key. No usable value gives null.
function calculateViewMetrics(view, scope) {
  const resultsName = view.resultsCollection || "results";
  scope[resultsName] = scope[resultsName] || {};
  (view.metrics || []).filter(metric => metric.average).forEach(metric => {
    let records = [scope];
    metric.average.path.forEach(collection => {
      records = records.flatMap(record => Object.values((record && record[collection]) || {}));
    });
    const values = records.map(record => resolve(record[metric.average.field])).filter(isPositiveNumber).map(Number);
    scope[resultsName][metric.key] = values.length
      ? roundHalfToEven(values.reduce((sum, value) => sum + value, 0) / values.length, metric.decimals)
      : null;
  });
}
function recalculateDeclaredViews(ctx) {
  Object.values(DatabaseMap.views || {}).forEach(view => {
    const scope = ctx[view.parent];
    if (scope) calculateView(view, scope, ctx);
  });
}
function propagateHome(level, ctx, key) {
  walkRecords(level, ctx[level], ctx, (t, rec, c) => {
    if (Deps.usedBy[t] && Deps.usedBy[t][key]) {
      propagate(t, rec, c, [key]);
    }
  });
}
function propagateChange(type, ctx, key) {
  const step = stepOf(type, key);
  if (step && step.home) propagateHome(step.home, ctx, key);
  else propagate(type, ctx.record, ctx, [key]);
}
// What a step directly depends on, as { type, key, relations } entries:
//   "from"  - the inputs of its formula, or (on a fetched value) the values that choose where it comes from
//   "reads" - a value it actually reads from another test
function directDependencies(type, key) {
  const step = stepOf(type, key);
  const dependencies = [];
  const seen = new Map();
  const add = (depType, depKey, relation) => {
    const id = depType + "." + depKey;
    if (seen.has(id)) {
      const existing = seen.get(id);
      if (!existing.relations.includes(relation)) existing.relations.push(relation);
      return;
    }
    const dependency = { type: depType, key: depKey, relations: [relation] };
    seen.set(id, dependency);
    dependencies.push(dependency);
  };
  ((step && step.from) || []).forEach(k => add(type, k, step.fetch ? "source selection" : "calculation"));
  readsOf(step).forEach(read => add(read.type, read.key, "source value"));
  return dependencies;
}
// Everything behind a value, as a graph with each value appearing once:
//   nodes[]  { id, type, key, dependencies: [{ type, key, relations, node }], depth, route }
//   root     the node for (type, key)
// `depth` is how many calculation levels sit under a node (0 = nothing under it). `route` is the chain of
// { fromType, fromKey, toType, toKey } steps that leads from the starting value to the node, which is what
// navigation follows to get there.
function buildDependencyTrace(type, key) {
  const nodes = new Map();

  function visit(nodeType, nodeKey, route, ancestors) {
    const id = nodeType + "." + nodeKey;
    if (ancestors.has(id)) return null;

    let node = nodes.get(id);
    if (!node) {
      node = { id, type: nodeType, key: nodeKey, route, dependencies: [], depth: 0 };
      nodes.set(id, node);
    }
    if (node.visited) return node;
    node.visited = true;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    directDependencies(nodeType, nodeKey).forEach(dep => {
      const edge = { fromType: nodeType, fromKey: nodeKey, toType: dep.type, toKey: dep.key };
      const child = visit(dep.type, dep.key, route.concat(edge), nextAncestors);
      if (child) node.dependencies.push({ ...dep, node: child });
    });
    return node;
  }

  const root = visit(type, key, [], new Set());
  const depthOf = (node, visiting = new Set()) => {
    if (visiting.has(node.id) || !node.dependencies.length) return 0;
    const next = new Set(visiting);
    next.add(node.id);
    node.depth = 1 + Math.max(...node.dependencies.map(dep => depthOf(dep.node, next)));
    return node.depth;
  };
  if (root) depthOf(root);
  return { root, nodes: [...nodes.values()] };
}
// A value's name for the person: its label, plus the test it belongs to when that is not the one on screen.
function dependencyLabel(type, key) {
  const step = stepOf(type, key);
  const test = TestDefinitions[type];
  return (step ? step.label : key) + (type !== Nav.activeTestType ? " · " + ((test && test.title) || type) : "");
}

// Tests that read another test's value must be calculated after it.
function typeRank(type, trail = []) {
  if (trail.includes(type)) return 0;
  const reads = TestDefinitions[type].sequence.flatMap(s => readsOf(s).map(rd => rd.type));
  return reads.length ? 1 + Math.max(...reads.map(t => typeRank(t, trail.concat(type)))) : 0;
}

// Recalculate every record in dependency order. Used after something is deleted, so whatever
// pointed at it lets go. Screens never do this.
function propagateAll(db) {
  const jobs = [];
  Object.values((db && db[DatabaseMap.rootCollection]) || {}).forEach(root => {
    walkRecords(DatabaseMap.rootEntity, root, {}, (type, record, ctx) => jobs.push({ type, record, ctx }));
  });
  jobs.sort((x, y) => typeRank(x.type) - typeRank(y.type));
  jobs.forEach(j => recomputeRecord(j.type, j.record, j.ctx));
  const done = new Map();
  jobs.forEach(j => Object.values(DatabaseMap.views || {}).forEach(view => {
    const scope = j.ctx[view.parent];
    const doneForView = done.get(view) || done.set(view, new Set()).get(view);
    if (scope && !doneForView.has(scope)) {
      doneForView.add(scope);
      calculateView(view, scope, j.ctx);
    }
  }));
}
