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
function valueOf(type, record, ctx, key) {
  const step = stepOf(type, key);
  if (step && step.type === "computed") return resolve(record[key]);
  if (step && step.home && ctx[step.home]) return ctx[step.home][key];
  return record ? record[key] : null;
}
function computeStep(type, step, record, ctx) {
  let raw = null;
  if (step.fetch && SourceResolvers[step.fetch]) {
    raw = SourceResolvers[step.fetch].value(ctx);
  } else if (step.from && typeof step.calc === "function") {
    const vals = step.from.map(k => valueOf(type, record, ctx, k));
    const ready = vals.every(v => v !== null && v !== undefined && !isNaN(v));
    raw = ready ? step.calc(...vals) : null;
  }
  const next = (raw === null || raw === undefined || isNaN(raw)) ? null : roundHalfToEven(raw, step.decimals);
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
// Everything upstream of a value that is still empty and that the user must supply:
//   { kind: "step",   step }          an input to enter (in this test)
//   { kind: "source", step, where }   a value fetched from another record that is missing
function isEmptyValue(v) {
  return v === null || v === undefined || v === "" || (typeof v === "number" && isNaN(v));
}
function missingUpstream(type, key, ctx, seen = new Set()) {
  const step = stepOf(type, key), record = ctx.record;
  const id = type + "." + key;
  if (!step || !record || seen.has(id)) return [];
  seen.add(id);
  const out = [];
  const resolver = step.fetch && SourceResolvers[step.fetch];
  if (resolver && resolver.locate && isEmptyValue(resolve(record[key]))) {
    const where = resolver.locate(ctx);
    if (where) out.push({ kind: "source", step, where });
  }
  (step.from || []).forEach(k => {
    const s = stepOf(type, k);
    if (!s) return;
    if (s.type === "computed") {
      if (isEmptyValue(resolve(record[k]))) out.push(...missingUpstream(type, k, ctx, seen));
    } else if ((s.type === "input" || s.type === "datetime") && isEmptyValue(valueOf(type, record, ctx, k)) && !seen.has(type + "." + k)) {
      seen.add(type + "." + k);
      out.push({ kind: "step", step: s });
    }
  });
  return out;
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
function recalculateDeclaredViews(ctx) {
  Object.values(DatabaseMap.views || {}).forEach(view => {
    const scope = ctx[view.parent];
    if (scope && typeof view.calculate === "function") view.calculate(scope, ctx);
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
function trace(type, key, direction) {
  const out = [], seen = new Set([type + "." + key]), todo = [{ type, key }];
  while (todo.length) {
    const cur = todo.shift();
    let next;
    if (direction === "down") {
      next = (Deps.usedBy[cur.type][cur.key] || []).map(k => ({ type: cur.type, key: k }))
        .concat((Deps.readers[cur.type] || {})[cur.key] || []);
    } else {
      const step = stepOf(cur.type, cur.key) || {};
      next = (step.from || []).map(k => ({ type: cur.type, key: k }));
      readsOf(step).forEach(rd => next.push({ type: rd.type, key: rd.key }));
    }
    next.forEach(n => {
      const id = n.type + "." + n.key;
      if (!seen.has(id)) { seen.add(id); out.push({ type: n.type, key: n.key }); todo.push(n); }
    });
  }
  return out;
}
function traceLabels(list) {
  return list.map(n => {
    const s = stepOf(n.type, n.key);
    return (s ? s.label : n.key) + (n.type !== Nav.activeTestType ? " (" + TestDefinitions[n.type].title + ")" : "");
  });
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
  const done = new Set();
  jobs.forEach(j => Object.values(DatabaseMap.views || {}).forEach(view => {
    const scope = j.ctx[view.parent];
    if (scope && !done.has(scope) && typeof view.calculate === "function") {
      done.add(scope);
      view.calculate(scope, j.ctx);
    }
  }));
}
