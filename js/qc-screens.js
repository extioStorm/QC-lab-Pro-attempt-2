// @ts-nocheck
// Small DOM builders shared by every screen (and the inspector). Text always goes in as text, never HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
// The standard row: label (+ small caption) on the left, and on the right either a value or a control.
//   value      text shown on the right; valueClass adds classes to it; calcKey marks it as a live calculated value
//   control    an element placed on the right (an input)
//   below      an element placed under the label instead (a select or a date)
//   stepKey    marks the row so navigation can find it
function buildRow({ label, caption, value, valueClass = "", calcKey, control, below, stepKey, className = "" }) {
  const row = el("div", ("speed-card " + className).trim());
  if (stepKey) row.dataset.stepRow = stepKey;
  const main = el("div", "speed-card-main");
  const info = el("div", "speed-info");
  info.appendChild(el("div", "speed-label", label));
  if (caption) info.appendChild(el("div", "speed-type", caption));
  main.appendChild(info);
  if (value !== undefined) {
    const valueEl = el("div", ("speed-calc-val " + valueClass).trim(), value);
    if (calcKey) valueEl.setAttribute("data-calc", calcKey);
    main.appendChild(valueEl);
  }
  if (control) {
    const wrap = el("div", "speed-input-wrap");
    wrap.appendChild(control);
    main.appendChild(wrap);
  }
  row.appendChild(main);
  if (below) row.appendChild(below);
  return row;
}
// What a source policy says about itself (its `view`): a picker when there is a choice, and status lines.
function buildSourceView(view, onChange, pickerLabel) {
  const box = el("div", "source-view");
  if (view.options && view.options.length) {
    if (pickerLabel) box.appendChild(el("label", "dependency-source-label", pickerLabel));
    const select = el("select", "step-select");
    view.options.forEach(option => {
      const item = el("option", "", option.label);
      item.value = option.value;
      item.selected = Boolean(option.selected);
      item.disabled = Boolean(option.disabled);
      select.appendChild(item);
    });
    select.onchange = () => onChange(select.value);
    box.appendChild(select);
  }
  (view.lines || []).forEach(line => box.appendChild(el("div", "src-line" + (line.tone ? " src-" + line.tone : ""), line.text)));
  return box;
}

function renderScreen() {
  const container = document.getElementById("app-viewport");
  if (!container) return;
  container.innerHTML = "";
  const view = (DatabaseMap.views || {})[Nav.activeTestType];
  if (view) {
    renderDeclaredView(container, view);
    return;
  }
  const record = getActiveRecord();
  if (!record) {
    if (deepestLevel(getActiveContext())) renderLanding(container);
    else renderSetupForm(container);
    return;
  }

  const ctx = getActiveContext();
  if (Nav.activeTestType && record && typeof recomputeRecord === "function") {
    recomputeRecord(Nav.activeTestType, record, ctx);
  }

  renderBreadcrumbBar();
  if (Nav.mode === "SPEED") {
    renderSpeedMode(container);
  } else {
    renderWizardMode(container);
  }
  container.appendChild(buildTestDeleteCard());
}

function setContextBar(text) {
  const bar = document.getElementById("context-bar");
  if (!bar) return;
  bar.innerHTML = `
    <div class="context-bar-inner">
      <span class="context-title"></span>
      <button class="btn-action btn-small" onclick="toggleDrawer(true)">☰ Open Tree</button>
    </div>`;
  bar.querySelector(".context-title").textContent = text;
}

function buildDeleteButton(text, run) {
  const btn = el("button", "btn-danger", text);
  btn.onclick = run;
  return btn;
}

function renderLanding(container) {
  const ctx = getActiveContext();
  const level = deepestLevel(ctx);
  const record = ctx[level], def = DatabaseMap.entities[level];
  const id = record[def.idKey], title = getNodeTitle(level, record, id);
  setContextBar(`${getNodeIcon(level)} ${title}`);
  const card = buildCard(`${getNodeIcon(level)} ${title}`, `${def.label || level}. Pick something in the tree, or use the actions below.`);
  (def.fields || []).forEach(field => card.appendChild(buildStepRow(field, record)));
  (DatabaseMap.tree[level].holds || []).forEach(h => {
    const collection = h.collection || DatabaseMap.tests[h.test].collection;
    const label = h.node
      ? ((h.navigation && h.navigation.groupLabel) || `${(DatabaseMap.entities[h.node] || {}).label || h.node}s`)
      : ((TestDefinitions[h.test].navigation || {}).collectionLabel || TestDefinitions[h.test].title);
    card.appendChild(buildRow({ label, value: Object.keys(record[collection] || {}).length, valueClass: "static neutral" }));
  });

  const ref = parentRefOf(level, ctx);
  if (ref.relation && ref.relation.create) {
    const add = el("button", "btn-action btn-block", `➕ ${ref.relation.addLabel || `Add another ${def.label || level}`}`);
    add.onclick = () => { createNavigationChild(ref.relation, ref.parent, level); renderScreen(); };
    card.appendChild(add);
  }
  card.appendChild(buildDeleteButton(`🗑 Delete this ${def.label || level}`, () => deleteRecord(ref.parent, ref.collection, id, title, contextIds(ctx, level))));
  container.appendChild(card);
}

function buildTestDeleteCard() {
  const ctx = getActiveContext();
  const test = DatabaseMap.tests[Nav.activeTestType];
  const title = testRecordTitle(Nav.activeTestType, ctx.record, Nav.activeTestId);
  const card = el("div", "card");
  card.appendChild(buildDeleteButton(`🗑 Delete ${title}`, () => deleteRecord(ctx[test.parent], test.collection, Nav.activeTestId, title, contextIds(ctx, null))));
  return card;
}

function renderDeclaredView(container, definition) {
  const context = getActiveContext();
  const scope = context[definition.parent];
  if (!scope) { renderSetupForm(container); return; }
  const entity = DatabaseMap.entities[definition.parent] || {};
  const name = entity.titleKey ? (scope[entity.titleKey] || "") : "";
  const format = text => String(text || "").replace(/\{name\}/g, name);
  setContextBar(`${definition.icon || "📄"} ${format(definition.contextTitle || definition.cardTitle)}`);
  const results = scope[definition.resultsCollection || "results"] || {};
  const card = buildCard(`${definition.icon || "📄"} ${definition.cardTitle || definition.id}`, format(definition.description));
  (definition.metrics || []).forEach(metric => {
    const rawValue = results[metric.key];
    const value = hasNumber(rawValue) ? `${formatValue(rawValue, metric.decimals)}${metric.unit || ""}` : "--";
    const count = metric.countCollection ? Object.keys(scope[metric.countCollection] || {}).length : null;
    const caption = count === null ? metric.caption : `${metric.caption} (${count} ${metric.countLabel})`;
    card.appendChild(buildRow({ label: metric.label, caption, value, valueClass: "static" }));
  });
  container.appendChild(card);
}

function renderSetupForm(container) {
  const bar = document.getElementById("context-bar");
  if (bar) bar.innerHTML = "";
  const setup = DatabaseMap.setup;
  const rootRecords = appDb && appDb[DatabaseMap.rootCollection];
  const hasRecords = Boolean(rootRecords && Object.keys(rootRecords).length > 0);
  let card;
  if (!hasRecords) {
    card = buildCard(`${setup.icon || "📋"} ${setup.title}`, setup.instruction);
    card.querySelector(".card-title").classList.add("accent");
    (setup.fields || []).forEach(field => {
      const group = el("div", "field-group");
      group.appendChild(el("label", "", field.label));
      const input = el("input");
      input.type = field.type || "text";
      input.id = `setup-${field.key}`;
      input.placeholder = field.placeholder || "";
      group.appendChild(input);
      card.appendChild(group);
    });
    const button = el("button", "btn-primary btn-block", setup.buttonLabel || "Continue");
    button.onclick = handleQuickSetup;
    card.appendChild(button);
  } else {
    card = el("div", "card empty-state");
    card.appendChild(el("div", "empty-icon", "📋"));
    card.appendChild(el("div", "card-title", "Select a Test"));
    card.appendChild(el("div", "instruction", "Open the navigation tree to choose or add a test."));
    const button = el("button", "btn-primary", "☰ Open Navigation Tree");
    button.onclick = () => toggleDrawer(true);
    card.appendChild(button);
  }
  container.appendChild(card);
}

function handleQuickSetup() {
  const setup = DatabaseMap.setup;
  const values = {};
  (setup.fields || []).forEach(field => {
    const input = document.getElementById(`setup-${field.key}`);
    values[field.key] = input ? input.value : "";
  });
  const missing = (setup.requiredFields || []).find(key => !String(values[key] || "").trim());
  if (missing) {
    alert(setup.requiredMessage || "Please complete the required fields.");
    return;
  }
  if (typeof setup.create !== "function") return;
  Object.assign(Nav, setup.create(appDb, values));
  saveToStorage();
  toggleDrawer(true);
  renderScreen();
}

function renderBreadcrumbBar() {
  const testDef = TestDefinitions[Nav.activeTestType];
  setContextBar(testDef ? `${testDef.icon} ${testDef.title} #${Nav.activeTestId}` : "Active Test");
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === Nav.mode);
  });
}

function buildDependencyLinks(step, inline = true) {
  if (!step || !step.fetch || !SourceResolvers[step.fetch]) return null;
  const ctx = getActiveContext();
  if (!ctx.record) return null;

  const resolver = SourceResolvers[step.fetch];
  if (!resolver || !resolver.locate) return null;

  if (inline && hasNumber(resolve(ctx.record[step.key]))) return null;

  const where = resolver.locate(ctx);
  if (!where) return null;
  if (inline && !where.message) return null;

  const box = el("div", "source-link");
  if (where.message) box.appendChild(el("div", "source-link-msg", where.message));
  if (where.label) {
    const btn = el("button", "btn-secondary", where.label);
    btn.onclick = () => goToSource(where, ctx);
    box.appendChild(btn);
  }
  return box.children.length ? box : null;
}

// A collapsible box (the prerequisites box, or a section of steps) holding rows in `body`.
// It stays open across screen redraws: `openKey` names it in openFoldBoxes.
const openFoldBoxes = new Set();
function buildFoldBox(title, preview, openKey) {
  const details = el("details", "prereq-card");
  details.open = openFoldBoxes.has(openKey);
  details.ontoggle = () => { if (details.open) openFoldBoxes.add(openKey); else openFoldBoxes.delete(openKey); };
  const summary = el("summary", "prereq-summary");
  const header = el("div", "prereq-header");
  header.append(el("span", "", title), el("span", "prereq-arrow", "▶"));
  summary.appendChild(header);
  if (preview) summary.appendChild(el("div", "prereq-preview", preview));
  const body = el("div", "prereq-body");
  details.append(summary, body);
  return { details, body };
}

// Renders the generic collapsed prerequisite header
function renderPrereqSection(prereqSteps, record) {
  // Build condensed summary line of current values
  const previews = prereqSteps.map(s => {
    const home = getStepHome(s) || record;
    let v;
    if (s.type === "computed") v = formatValue(record[s.key], s.decimals);
    else if (s.type === "choice") {   // show what is chosen, not the stored choice object
      const picked = (SourceResolvers[s.resolver].view(getActiveContext()).options || []).find(o => o.selected);
      v = picked ? picked.label.split(" · ")[0] : "auto";
    } else v = home[s.key] ?? "--";
    return `${s.label.split(" ")[0]}: ${v}${s.unit ? " " + s.unit : ""}`;
  });

  const box = buildFoldBox(`⚙️ Prerequisites & References (${prereqSteps.length})`, previews.join(" · "), `${Nav.activeTestType}:prereq`);
  prereqSteps.forEach(step => box.body.appendChild(buildStepRow(step, record, "inset")));
  return box.details;
}

// Steps whose control goes under the label (it needs the width), with the caption word for each.
const BELOW_LABEL_STEPS = { datetime: "Date & time", choice: "Choose", text: "Text", select: "Pick one", multi: "Pick any", perPick: "One per pick" };

// One step as a Speed Sheet row: a date/choice/text/pick gets its control under the label, a calculated
// value is tappable to inspect, a number or a check box goes on the right. `withInstruction` (wizard pages)
// adds the step's instruction under it; the Speed Sheet leaves it out.
function buildStepRow(step, record, className = "", withInstruction = false) {
  const row = buildStepRowControls(step, record, className);
  if (withInstruction && step.instruction) row.appendChild(el("div", "instruction", step.instruction));
  return row;
}
function buildStepRowControls(step, record, className) {
  const base = { label: step.label, stepKey: step.key, className };
  if (BELOW_LABEL_STEPS[step.type]) {
    return buildRow({ ...base, caption: `${step.key} • ${BELOW_LABEL_STEPS[step.type]}`, below: buildStepControl(step, record) });
  }
  if (step.type === "computed") {
    const row = buildRow({
      ...base,
      caption: `${step.key} • Calculated (${step.unit || "val"})`,
      value: formatValue(record[step.key], step.decimals),
      valueClass: record[step.key] && record[step.key].isManual ? "is-manual" : "",
      calcKey: step.key
    });
    row.querySelector(".speed-calc-val").onclick = () => toggleInspector(step.key, row);
    const missing = buildDependencyLinks(step, true);
    if (missing) row.appendChild(missing);
    return row;
  }
  const caption = step.type === "check" ? `${step.key} • Check` : `${step.key} • Input (${step.unit})`;
  return buildRow({ ...base, caption, control: buildStepControl(step, record) });
}

function renderSpeedMode(container) {
  const record = getActiveRecord();
  const testDef = TestDefinitions[Nav.activeTestType];
  if (!record || !testDef) return;

  const card = buildCard(`⚡ Speed Sheet — ${testDef.title.toUpperCase()} #${Nav.activeTestId}`);
  const prereqSteps = testDef.sequence.filter(isPrereqStep);
  if (prereqSteps.length > 0) card.appendChild(renderPrereqSection(prereqSteps, record));
  appendSectionSteps(card, stepSections(testDef), record);
  container.appendChild(card);
}

// Lay sections of steps out on a card, in order: the section's name (when there are several), then its
// `optional` steps (checklists, extra info) folded into its own toolbox, then its steps that matter, open.
// Toolboxes never open by themselves; nothing in them is required. `withInstructions`: wizard pages.
function appendSectionSteps(card, sections, record, withInstructions = false) {
  sections.forEach(section => {
    if (section.name && sections.length > 1) card.appendChild(el("div", "section-label", section.name));
    const optional = section.steps.filter(step => step.optional);
    if (optional.length) {
      const box = buildFoldBox(`🧰 ${section.name || "Optional"}: checklist & extras (${optional.length})`, "", `${Nav.activeTestType}:toolbox:${section.name}`);
      optional.forEach(step => box.body.appendChild(buildStepRow(step, record, "inset", withInstructions)));
      card.appendChild(box.details);
    }
    section.steps.filter(step => !step.optional).forEach(step => card.appendChild(buildStepRow(step, record, "", withInstructions)));
  });
}

// Back / Next between wizard pages.
function buildWizardNav(index, count, nextLabel) {
  const navRow = el("div", "wizard-nav");
  if (index > 0) {
    const backBtn = el("button", "btn-secondary", "← Back");
    backBtn.onclick = () => { Nav.stepIndex = index - 1; renderScreen(); };
    navRow.appendChild(backBtn);
  }
  if (index < count - 1) {
    const nextBtn = el("button", "btn-primary", nextLabel);
    nextBtn.onclick = () => { Nav.stepIndex = index + 1; renderScreen(); };
    navRow.appendChild(nextBtn);
  }
  return navRow;
}

function renderWizardMode(container) {
  const record = getActiveRecord();
  const testDef = TestDefinitions[Nav.activeTestType];
  if (!record || !testDef) return;

  // A test with sections is walked one section (a chunk of tasks) per page.
  const sections = stepSections(testDef);
  if (sections.some(section => section.name)) {
    const index = Math.min(Nav.stepIndex, sections.length - 1);
    const section = sections[index];
    const chunk = buildCard(`${index + 1} of ${sections.length}: ${section.name || testDef.title}`);
    appendSectionSteps(chunk, [section], record, true);
    chunk.appendChild(buildWizardNav(index, sections.length, `${sections[index + 1] ? sections[index + 1].name : ""} →`));
    container.appendChild(chunk);
    return;
  }

  const steps = testDef.sequence.filter(step => !isPrereqStep(step));
  if (steps.length === 0) return; // Failsafe
  
  const stepIndex = Math.min(Nav.stepIndex, steps.length - 1);
  const step = steps[stepIndex];
  
  const card = buildCard(`Step ${stepIndex + 1} of ${steps.length}: ${step.label}`, step.instruction || "Record the required measurement below.");
  if (step.type === "input") {
    const group = el("div", "field-group");
    group.appendChild(el("label", "", `${step.label} (${step.unit})`));
    group.appendChild(buildStepControl(step, record));
    card.appendChild(group);
  } else if (step.type !== "computed") {
    card.appendChild(buildStepControl(step, record));
  } else {
    const valBox = el("div", "value-display");
    const val = el("span", "val" + (record[step.key] && record[step.key].isManual ? " is-manual" : ""), formatValue(record[step.key], step.decimals));
    val.setAttribute("data-calc", step.key);
    valBox.appendChild(val);
    valBox.appendChild(el("span", "unit", step.unit));
    valBox.appendChild(el("div", "caption", "Tap to inspect or override"));
    valBox.onclick = () => toggleInspector(step.key, card);
    card.appendChild(valBox);
    const missing = buildDependencyLinks(step, true);
    if (missing) card.appendChild(missing);
  }
  card.appendChild(buildWizardNav(stepIndex, steps.length, "Next Step →"));
  container.appendChild(card);
}

function buildStepControl(step, record) {
  const wrap = el("div", "step-control");
  const home = getStepHome(step) || record;
  if (step.type === "input") {
    const input = el("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.step = step.step || "any";
    input.value = hasNumber(home[step.key]) ? home[step.key] : "";
    input.onchange = () => handleScaleInput(step.key, input.value, step);
    wrap.appendChild(input);
  } else if (step.type === "datetime") {
    const input = el("input");
    input.type = "datetime-local";
    input.value = record[step.key] || "";
    input.onchange = () => handleDatetimeInput(step.key, input.value);
    wrap.appendChild(input);
    const hint = step.autoKey ? (record[step.autoKey] ? (step.autoHint || "automatic") : (step.manualHint || "entered by technician")) : "";
    wrap.appendChild(el("div", "src-hint", hint ? "Source: " + hint : ""));
  } else if (step.type === "choice" && SourceResolvers[step.resolver]) {
    wrap.appendChild(buildSourceView(SourceResolvers[step.resolver].view(getActiveContext()), value => handleChoiceInput(step.key, value)));
  } else if (step.type === "text") {
    const input = el("input");
    input.type = "text";
    input.value = home[step.key] ?? "";
    input.onchange = () => handleScaleInput(step.key, input.value, step);
    wrap.appendChild(input);
  } else if (step.type === "check") {
    const input = el("input");
    input.type = "checkbox";
    input.checked = Boolean(home[step.key]);
    input.onchange = () => handleScaleInput(step.key, input.checked, step);
    wrap.appendChild(input);
  } else if (step.type === "select") {
    const current = home[step.key] ?? "";
    const options = [{ value: "", label: "— Choose —" }].concat((step.options || []).map(option => ({ value: option, label: option })))
      .map(option => ({ ...option, selected: option.value === current }));
    wrap.appendChild(buildSourceView({ options }, value => handleScaleInput(step.key, value, step)));
  } else if (step.type === "perPick") {
    // A number for each record picked in the `of` step (e.g. a paving rate per mix placed today), with the
    // module's `note(option, value)` beside it.
    const ctx = getActiveContext();
    const parentLevel = DatabaseMap.tests[Nav.activeTestType].parent;
    const picked = record[step.of] || [];
    const values = home[step.key] || {};
    const options = collectLevelRecords(parentLevel, ctx[parentLevel], step.optionsFrom)
      .filter(({ record: option }) => picked.includes(option[DatabaseMap.entities[step.optionsFrom].idKey]));
    if (!options.length) wrap.appendChild(el("div", "src-hint", "Pick today's mixes first."));
    options.forEach(({ record: option }) => {
      const id = option[DatabaseMap.entities[step.optionsFrom].idKey];
      const input = el("input");
      input.type = "number";
      input.inputMode = "decimal";
      input.step = step.step || "any";
      input.dataset.option = id;
      input.value = hasNumber(values[id]) ? values[id] : "";
      input.onchange = () => {
        const next = {};
        wrap.querySelectorAll("input[data-option]").forEach(box => { if (box.value !== "") next[box.dataset.option] = parseFloat(box.value); });
        handleScaleInput(step.key, next, { ...step, rerender: true });
      };
      const note = step.note ? step.note(option, values[id]) : "";
      wrap.appendChild(buildRow({ label: getNodeTitle(step.optionsFrom, option, id), caption: note, control: input, className: "inset" }));
    });
  } else if (step.type === "multi") {
    // Tick any of the records at level `optionsFrom` under this record's parent (e.g. the job's mixes).
    const ctx = getActiveContext();
    const parentLevel = DatabaseMap.tests[Nav.activeTestType].parent;
    const picked = home[step.key] || [];
    collectLevelRecords(parentLevel, ctx[parentLevel], step.optionsFrom).forEach(({ record: option }) => {
      const id = option[DatabaseMap.entities[step.optionsFrom].idKey];
      const line = el("label", "multi-option");
      const box = el("input");
      box.type = "checkbox";
      box.value = id;
      box.checked = picked.includes(id);
      box.onchange = () => handleScaleInput(step.key, [...wrap.querySelectorAll("input:checked")].map(input => input.value), step);
      line.append(box, el("span", "", getNodeTitle(step.optionsFrom, option, id)));
      wrap.appendChild(line);
    });
    // The tree's own "add" actions, so a missing option can be made right here: the option's level, then each
    // level in `alsoCreate` under it (e.g. a mix and its plant), asking for their names as the tree does.
    const levels = [step.optionsFrom].concat(step.alsoCreate || []);
    const actionFor = (parent, level) => ((DatabaseMap.tree[parent].holds.find(h => h.node === level) || {}).navigation);
    const first = actionFor(parentLevel, step.optionsFrom);
    if (first && first.create) {
      const add = el("button", "btn-secondary btn-small", `➕ ${first.addLabel}`);
      add.onclick = () => {
        let parent = ctx[parentLevel], parentName = parentLevel;
        for (const level of levels) {
          const action = actionFor(parentName, level);
          const values = action && collectNavigationValues(action);
          if (!values) break;
          parent = action.create(parent, values);
          if (!parent) break;
          parentName = level;
        }
        saveToStorage();
        renderScreen();
      };
      wrap.appendChild(add);
    }
  }
  return wrap;
}

// A card with a title and (optionally) an instruction line under it.
function buildCard(title, instruction) {
  const card = el("div", "card");
  card.appendChild(el("div", "card-title", title));
  if (instruction) card.appendChild(el("div", "instruction", instruction));
  return card;
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    initDefaultData();
    renderScreen();
  });
} else {
  initDefaultData();
  renderScreen();
}