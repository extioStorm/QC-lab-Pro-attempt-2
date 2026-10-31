// @ts-nocheck
// The lens: the module's declared workday (DatabaseMap.lenses), groups of entries in order. It is drawn in the
// menu (renderLensBlock) and walked as pages (Nav.lensStep = { group, entry, list }):
//   - an entry for a section of the day's record opens that section of the record;
//   - any other entry opens a list page of what it covers (list: true); a record opened from there keeps the
//     step (list: false) so it can come back.
// Next / Back follow the entries of a group; the last entry of a group offers the next group. Everything shown
// is worked out from the records each time (describeLensEntry), for the menu and the pages alike.

// The active lens and what it looks at: the selected `parent` record, the day's window, and the Nav ids to get there.
function lensState() {
  const lens = Object.values(DatabaseMap.lenses || {})[0];
  const ctx = getActiveContext();
  const scope = lens && ctx[lens.parent];
  if (!scope) return null;
  const context = Object.assign(contextIds(ctx, lens.parent), selectionTarget(lens.parent, scope[DatabaseMap.entities[lens.parent].idKey]));
  return { lens, ctx, scope, context, win: currentWindow(scope, lens.window) };
}
function lensEntryAt(lens, step) {
  const group = step && lens.groups[step.group];
  const entry = group && group.entries[step.entry];
  return entry ? { group, entry } : null;
}

// What one entry is right now: { done (true/false, null = nothing required), progress, items, adds, open }.
//   items  things it covers, each { icon, label, done, open }   adds  { label, run } to make a new one
//   open   how the entry itself opens (a section page, or its list page)
function describeLensEntry(entry, state, ref) {
  const { lens, ctx, scope, win, context } = state;
  const within = target => navigateTo(Object.assign(target, { mode: "INTERACTIVE", lensStep: { ...ref, list: false } }));
  if (entry.section) {
    const type = lens.window.type, test = DatabaseMap.tests[type];
    // Only the steps that matter count; optional ones (the toolbox) never make a section unfinished.
    const steps = TestDefinitions[type].sequence.filter(step => step.section === entry.section && step.type !== "computed" && !step.optional);
    const filled = steps.filter(step => isStepFilled(type, win.record, ctx, step)).length;
    const warning = entry.warn ? recordsInWindow(lens.parent, scope, entry.warn, win).notDone.length : 0;
    const stepIndex = Math.max(0, stepSections(TestDefinitions[type]).findIndex(section => section.name === entry.section));
    return {
      done: steps.length ? filled === steps.length : null,
      progress: `${steps.length ? `${filled}/${steps.length}` : ""}${warning ? ` ⚠ ${entry.warn.warnLabel}: ${warning}` : ""}`,
      items: [], adds: [],
      open: () => within(Object.assign({}, context, { activeTestType: type, activeTestId: win.record[test.idKey], stepIndex }))
    };
  }
  const listPage = () => navigateTo(Object.assign({}, context, NO_ACTIVE_TEST, { lensStep: { ...ref, list: true } }));
  if (entry.fieldsOf) {
    // The levels' own fields (entities[level].fields): the job, then each job mix and plant.
    const items = entry.fieldsOf.flatMap(level => collectLevelRecords(lens.parent, scope, level).map(found => {
      const fields = (DatabaseMap.entities[level].fields || []).filter(field => !field.optional && field.type !== "computed");
      const filled = fields.filter(field => isStepFilled(null, found.record, found.ctx, field)).length;
      const id = found.record[DatabaseMap.entities[level].idKey];
      return {
        icon: getNodeIcon(level), label: `${getNodeTitle(level, found.record, id)} · ${filled}/${fields.length}`, done: filled === fields.length,
        open: () => within(Object.assign(contextIds(found.ctx, null), selectionTarget(level, id), NO_ACTIVE_TEST))
      };
    }));
    return { done: items.every(item => item.done), progress: "", items, adds: [], open: listPage };
  }
  // The day's records of a test, from every place they can sit under the lens's scope (e.g. each job mix's plant).
  const type = entry.records, test = DatabaseMap.tests[type];
  const { records, notDone } = recordsInWindow(lens.parent, scope, entry, win);
  const contextOf = recordCtx => Object.assign(contextIds(recordCtx, null), selectionTarget(test.parent, recordCtx[test.parent][DatabaseMap.entities[test.parent].idKey]));
  // With a doneKey, a record opens at the section that finishes it (e.g. a core's Lab page).
  const stepIndex = entry.doneKey ? Math.max(0, stepSections(TestDefinitions[type]).findIndex(section => section.steps.some(step => step.key === entry.doneKey))) : 0;
  const openRecord = (id, recordCtx) => within(Object.assign(contextOf(recordCtx), { activeTestType: type, activeTestId: id, stepIndex }));
  const items = records.map(found => {
    const id = found.record[test.idKey];
    return { icon: TestDefinitions[type].icon || "📄", label: testRecordTitle(type, found.record, id), done: entry.doneKey ? !notDone.includes(found) : null, open: () => openRecord(id, found.ctx) };
  });
  const parents = collectLevelRecords(lens.parent, scope, test.parent);
  const levels = Object.keys(DatabaseMap.entities);
  const adds = entry.doneKey ? [] : parents.map(parent => {
    const where = levels.slice(levels.indexOf(lens.parent) + 1, levels.indexOf(test.parent) + 1)
      .map(level => getNodeTitle(level, parent.ctx[level], parent.ctx[level][DatabaseMap.entities[level].idKey])).join(" / ");
    return {
      label: `${(TestDefinitions[type].navigation || {}).addLabel || "Add"}${parents.length > 1 ? ` · ${where}` : ""}`,
      run: () => { const record = test.create(parent.record); if (record) { saveToStorage(); openRecord(record[test.idKey], parent.ctx); } }
    };
  });
  return {
    done: entry.doneKey ? Boolean(records.length && !notDone.length) : null,
    progress: entry.doneKey ? `${records.length - notDone.length} of ${records.length} ${entry.doneLabel}` : String(records.length),
    items, adds, open: listPage
  };
}
const lensMark = (done, fallback) => (done === null ? fallback : done ? "✅" : "▫️");

// Open entry `entry` of group `group`.
function openLensStep(group, entry) {
  const state = lensState();
  if (!state || !state.win || !lensEntryAt(state.lens, { group, entry })) return;
  describeLensEntry(state.lens.groups[group].entries[entry], state, { group, entry }).open();
}

// The menu block: the lens's groups and numbered entries; tapping an entry opens it.
function renderLensBlock(container) {
  const state = lensState();
  if (!state) return;
  const { lens, scope, context, win } = state;
  const windowTest = DatabaseMap.tests[lens.window.type];
  container.appendChild(createTreeRow({
    icon: lens.icon || "📋",
    title: win ? `${lens.label} · ${testRecordTitle(lens.window.type, win.record, win.record[windowTest.idKey])}` : lens.label,
    isOpen: true,
    getChildren: rows => {
      if (!win) { rows.appendChild(buildTestAddRow(lens.window.type, scope, context, lens.startLabel)); return; }
      let number = 0;
      lens.groups.forEach((group, g) => {
        const numbered = group.entries.map((entry, e) => ({ entry, e, number: ++number }));
        rows.appendChild(createTreeRow({
          icon: group.icon || "📂",
          title: group.label,
          isOpen: true,
          getChildren: groupRows => numbered.forEach(({ entry, e, number: n }) => {
            const about = describeLensEntry(entry, state, { group: g, entry: e });
            groupRows.appendChild(createTreeRow({
              icon: lensMark(about.done, entry.records ? TestDefinitions[entry.records].icon : "🧰"),
              title: `${n}. ${entry.label}${about.progress ? " · " + about.progress : ""}`,
              isLeaf: true,
              isActive: Boolean(Nav.lensStep && Nav.lensStep.group === g && Nav.lensStep.entry === e),
              onSelect: () => openLensStep(g, e)
            }));
          })
        }));
      });
    }
  }));
}

// "Group · 2 of 4: Entry" for a lens page.
function lensHeading(lens, step) {
  const { group, entry } = lensEntryAt(lens, step);
  return `${group.label} · ${step.entry + 1} of ${group.entries.length}: ${entry.label}`;
}
// Back / Next between the entries of a group; at either end, the neighbouring group.
function buildLensNav(lens, step) {
  const row = el("div", "wizard-nav");
  const groups = lens.groups, g = step.group, e = step.entry;
  const add = (cls, text, to) => { const btn = el("button", cls, text); btn.onclick = () => openLensStep(to.group, to.entry); row.appendChild(btn); };
  if (e > 0) add("btn-secondary", `← ${groups[g].entries[e - 1].label}`, { group: g, entry: e - 1 });
  else if (g > 0) add("btn-secondary", `← ${groups[g - 1].label}`, { group: g - 1, entry: groups[g - 1].entries.length - 1 });
  if (e < groups[g].entries.length - 1) add("btn-primary", `${groups[g].entries[e + 1].label} →`, { group: g, entry: e + 1 });
  else if (g < groups.length - 1) add("btn-primary", `Next: ${groups[g + 1].label} →`, { group: g + 1, entry: 0 });
  return row;
}
// When the screen shows the section a lens step points at, its heading and Back / Next (else null).
// However the day's record was opened (the lens, Start Workday, the tree), its sections walk the lens.
function lensSectionPage(sectionName) {
  const state = lensState();
  if (!state || !state.win || Nav.activeTestType !== state.lens.window.type || getActiveRecord() !== state.win.record) return null;
  let step = null;
  state.lens.groups.forEach((group, g) => group.entries.forEach((entry, e) => { if (!step && entry.section === sectionName) step = { group: g, entry: e }; }));
  if (!step) return null;
  return { title: lensHeading(state.lens, step), nav: buildLensNav(state.lens, step) };
}
// On a record or page opened from a lens list page: a button back to that list.
function buildLensReturn() {
  const state = lensState();
  const at = state && Nav.lensStep && !Nav.lensStep.list && lensEntryAt(state.lens, Nav.lensStep);
  if (!at || at.entry.section) return null;
  const btn = el("button", "btn-secondary btn-block", `← Back to ${at.entry.label}`);
  btn.onclick = () => openLensStep(Nav.lensStep.group, Nav.lensStep.entry);
  return btn;
}
// The list page of an entry: what it covers (tap to open), its add actions, and Back / Next.
function renderLensEntryPage(container) {
  const state = lensState();
  const at = state && state.win && lensEntryAt(state.lens, Nav.lensStep);
  if (!at) { Nav.lensStep = null; renderScreen(); return; }
  const about = describeLensEntry(at.entry, state, Nav.lensStep);
  setContextBar(`${state.lens.icon || "📋"} ${at.entry.label}`);
  const card = buildCard(lensHeading(state.lens, Nav.lensStep), about.progress ? `Done: ${about.progress}` : "");
  about.items.forEach(item => {
    const btn = el("button", "btn-secondary btn-block", `${lensMark(item.done, item.icon)} ${item.label}`);
    btn.onclick = item.open;
    card.appendChild(btn);
  });
  if (!about.items.length && !about.adds.length) card.appendChild(el("div", "instruction", "Nothing here yet today."));
  about.adds.forEach(addAction => {
    const btn = el("button", "btn-action btn-block", `➕ ${addAction.label}`);
    btn.onclick = addAction.run;
    card.appendChild(btn);
  });
  card.appendChild(buildLensNav(state.lens, Nav.lensStep));
  container.appendChild(card);
}
