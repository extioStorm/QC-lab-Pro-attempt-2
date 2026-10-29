// @ts-nocheck
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
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--input-bg); padding:0.5rem 0.75rem; border-radius:6px; border:1px solid var(--panel-border);">
      <span class="context-title" style="font-weight:700; color:var(--text); font-size:0.9rem;"></span>
      <button class="btn-action" style="width:auto; padding:0.25rem 0.65rem; margin:0; font-size:0.75rem;" onclick="toggleDrawer(true)">☰ Open Tree</button>
    </div>`;
  bar.querySelector(".context-title").textContent = text;
}

function buildDeleteButton(text, run) {
  const btn = document.createElement("button");
  btn.className = "btn-secondary";
  btn.style.cssText = "width:100%; border-color:var(--danger); color:var(--danger); margin-top:0.5rem;";
  btn.textContent = text;
  btn.onclick = run;
  return btn;
}

function renderLanding(container) {
  const ctx = getActiveContext();
  const level = deepestLevel(ctx);
  const record = ctx[level], def = DatabaseMap.entities[level];
  const id = record[def.idKey], title = getNodeTitle(level, record, id);
  setContextBar(`${getNodeIcon(level)} ${title}`);
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="card-title">${getNodeIcon(level)} ${title}</div><div class="instruction">${def.label || level}. Pick something in the tree, or use the actions below.</div>`;
  
  (DatabaseMap.tree[level].holds || []).forEach(h => {
    const collection = h.collection || DatabaseMap.tests[h.test].collection;
    const label = h.node
      ? ((h.navigation && h.navigation.groupLabel) || `${(DatabaseMap.entities[h.node] || {}).label || h.node}s`)
      : ((TestDefinitions[h.test].navigation || {}).collectionLabel || TestDefinitions[h.test].title);
    const row = document.createElement("div");
    row.className = "speed-card";
    row.innerHTML = `<div class="speed-card-main"><div class="speed-info"><div class="speed-label">${label}</div></div><div class="speed-calc-val" style="color:var(--text);cursor:default;">${Object.keys(record[collection] || {}).length}</div></div>`;
    card.appendChild(row);
  });
  
  const ref = parentRefOf(level, ctx);
  if (ref.relation && ref.relation.create) {
    const add = document.createElement("button");
    add.className = "btn-action";
    add.style.marginTop = "0.75rem";
    add.textContent = `➕ ${ref.relation.addLabel || `Add another ${def.label || level}`}`;
    add.onclick = () => { createNavigationChild(ref.relation, ref.parent, level); renderScreen(); };
    card.appendChild(add);
  }
  card.appendChild(buildDeleteButton(`🗑 Delete this ${def.label || level}`, () => deleteRecord(ref.parent, ref.collection, id, title, contextIds(ctx, level))));
  container.appendChild(card);
}

function buildTestDeleteCard() {
  const ctx = getActiveContext();
  const test = DatabaseMap.tests[Nav.activeTestType], testDef = TestDefinitions[Nav.activeTestType];
  const nav = testDef.navigation || {};
  const title = nav.itemLabel ? nav.itemLabel(ctx.record, Nav.activeTestId) : `${testDef.title} #${Nav.activeTestId}`;
  const card = document.createElement("div");
  card.className = "card";
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
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="card-title">${definition.icon || "📄"} ${definition.cardTitle || definition.id}</div><div class="instruction">${format(definition.description)}</div>`;
  
  (definition.metrics || []).forEach(metric => {
    const row = document.createElement("div");
    row.className = "speed-card";
    const rawValue = results[metric.key];
    const displayValue = rawValue === null || rawValue === undefined || isNaN(rawValue)
      ? "--"
      : `${Number(rawValue).toFixed(metric.decimals)}${metric.unit || ""}`;
    const count = metric.countCollection ? Object.keys(scope[metric.countCollection] || {}).length : null;
    const caption = count === null ? metric.caption : `${metric.caption} (${count} ${metric.countLabel})`;
    row.innerHTML = `<div class="speed-card-main"><div class="speed-info"><div class="speed-label">${metric.label}</div><div class="speed-type">${caption || ""}</div></div><div class="speed-calc-val" style="color:var(--success);cursor:default;">${displayValue}</div></div>`;
    card.appendChild(row);
  });
  container.appendChild(card);
}

function renderSetupForm(container) {
  const bar = document.getElementById("context-bar");
  if (bar) bar.innerHTML = "";
  const setup = DatabaseMap.setup;
  const projects = appDb && appDb[DatabaseMap.rootCollection];
  const hasProjects = Boolean(projects && Object.keys(projects).length > 0);
  const card = document.createElement("div");
  card.className = "card";
  if (!hasProjects) {
    card.innerHTML = `<div class="card-title" style="color:var(--accent);">${setup.icon || "📋"} ${setup.title}</div><div class="instruction">${setup.instruction || ""}</div>`;
    (setup.fields || []).forEach(field => {
      const group = document.createElement("div");
      group.className = "field-group";
      group.innerHTML = `<label>${field.label}</label><input type="${field.type || 'text'}" id="setup-${field.key}" placeholder="${field.placeholder || ''}">`;
      card.appendChild(group);
    });
    const button = document.createElement("button");
    button.className = "btn-primary";
    button.style.cssText = "width:100%; margin-top:0.5rem;";
    button.textContent = setup.buttonLabel || "Continue";
    button.onclick = handleQuickSetup;
    card.appendChild(button);
  } else {
    card.style.textAlign = "center";
    card.style.padding = "2rem 1rem";
    card.innerHTML = `
      <div style="font-size:2.5rem; margin-bottom:0.75rem;">📋</div>
      <div class="card-title">Select a Test</div>
      <div class="instruction">Open the navigation tree to choose or add a test.</div>
      <button class="btn-primary" style="margin: 0 auto; max-width:260px;" onclick="toggleDrawer(true)">☰ Open Navigation Tree</button>
    `;
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

  const val = resolve(ctx.record[step.key]);
  const hasValue = val !== null && val !== undefined && val !== "" && !isNaN(val);

  if (inline && hasValue) return null;

  const where = resolver.locate(ctx);
  if (!where) return null;
  if (inline && !where.message) return null;

  const box = document.createElement("div");
  box.className = "source-link";
  if (where.message) {
    const msg = document.createElement("div");
    msg.className = "source-link-msg";
    msg.textContent = where.message;
    box.appendChild(msg);
  }
  if (where.label) {
    const btn = document.createElement("button");
    btn.className = "btn-secondary";
    btn.textContent = where.label;
    btn.onclick = () => goToSource(where, ctx);
    box.appendChild(btn);
  }
  return box.children.length ? box : null;
}

// Renders the generic collapsed prerequisite header
function renderPrereqSection(prereqSteps, record) {
  const details = document.createElement("details");
  details.className = "prereq-card";

  // Build condensed summary line of current values
  const previews = prereqSteps.map(s => {
    const home = getStepHome(s) || record;
    let v = s.type === "computed" ? formatValue(record[s.key], s.decimals) : (home[s.key] ?? "--");
    return `${s.label.split(" ")[0]}: ${v}${s.unit ? " " + s.unit : ""}`;
  });

  details.innerHTML = `
    <summary class="prereq-summary">
      <div class="prereq-header">
        <span>⚙️ Prerequisites & References (${prereqSteps.length})</span>
        <span class="prereq-arrow">▶</span>
      </div>
      <div class="prereq-preview">${previews.join(" · ")}</div>
    </summary>
    <div class="prereq-body"></div>
  `;

  const body = details.querySelector(".prereq-body");
  prereqSteps.forEach(step => {
    const row = document.createElement("div");
    row.className = "speed-card";
    row.style.cssText = "margin-bottom: 0.35rem; background: var(--input-bg);";
    row.dataset.stepRow = step.key;
    renderStepRowContent(row, step, record);
    body.appendChild(row);
  });

  return details;
}

function renderStepRowContent(row, step, record) {
  const isCalculated = step.type === "computed";
  if (step.type === "datetime" || step.type === "choice") {
    row.innerHTML = `<div class="speed-label">${step.label}</div><div class="speed-type">${step.key} • ${step.type === "choice" ? "Choose" : "Date & time"}</div>`;
    row.appendChild(buildStepControl(step, record));
  } else if (isCalculated) {
    const val = formatValue(record[step.key], step.decimals);
    const isManual = record[step.key] && record[step.key].isManual;
    row.innerHTML = `
      <div class="speed-card-main">
        <div class="speed-info">
          <div class="speed-label">${step.label}</div>
          <div class="speed-type">${step.key} • Calculated (${step.unit || "val"})</div>
        </div>
        <div class="speed-calc-val" data-calc="${step.key}" style="color: ${isManual ? 'var(--warning)' : 'var(--success)'};">${val}</div>
      </div>
    `;
    row.querySelector(".speed-calc-val").onclick = () => toggleInspector(step.key, row);
    const missing = buildDependencyLinks(step, true);
    if (missing) row.appendChild(missing);
  } else {
    row.innerHTML = `
      <div class="speed-card-main">
        <div class="speed-info">
          <div class="speed-label">${step.label}</div>
          <div class="speed-type">${step.key} • Input (${step.unit})</div>
        </div>
        <div class="speed-input-wrap"></div>
      </div>
    `;
    row.querySelector(".speed-input-wrap").appendChild(buildStepControl(step, record));
  }
}

function renderSpeedMode(container) {
  const record = getActiveRecord();
  const testDef = TestDefinitions[Nav.activeTestType];
  if (!record || !testDef) return;

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<div class="card-title">⚡ Speed Sheet — ${testDef.title.toUpperCase()} #${Nav.activeTestId}</div>`;

  // NEW LOGIC: Ask the structure, don't look for metadata!
  const isPrereq = s => s.home || s.fetch || s.resolver;
  const prereqSteps = testDef.sequence.filter(isPrereq);
  const mainSteps = testDef.sequence.filter(s => !isPrereq(s));

  // Render collapsible prerequisite box at the top if any exist
  if (prereqSteps.length > 0) {
    card.appendChild(renderPrereqSection(prereqSteps, record));
  }

  // Render active physical test steps
  mainSteps.forEach(step => {
    const row = document.createElement("div");
    row.className = "speed-card";
    row.dataset.stepRow = step.key;
    renderStepRowContent(row, step, record);
    card.appendChild(row);
  });

  container.appendChild(card);
}

function renderWizardMode(container) {
  const record = getActiveRecord();
  const testDef = TestDefinitions[Nav.activeTestType];
  if (!record || !testDef) return;
  
  // NEW LOGIC: Only grab local steps, ignoring external pointers
  const steps = testDef.sequence.filter(s => !s.home && !s.fetch && !s.resolver);
  if (steps.length === 0) return; // Failsafe
  
  const stepIndex = Math.min(Nav.stepIndex, steps.length - 1);
  const step = steps[stepIndex];
  
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-title">Step ${stepIndex + 1} of ${steps.length}: ${step.label}</div>
    <div class="instruction">${step.instruction || "Record the required measurement below."}</div>
  `;
  if (step.type === "input") {
    const group = document.createElement("div");
    group.className = "field-group";
    group.innerHTML = `<label>${step.label} (${step.unit})</label>`;
    group.appendChild(buildStepControl(step, record));
    card.appendChild(group);
  } else if (step.type === "datetime" || step.type === "choice") {
    card.appendChild(buildStepControl(step, record));
  } else if (step.type === "computed") {
    const val = formatValue(record[step.key], step.decimals);
    const valBox = document.createElement("div");
    valBox.className = "value-display";
    valBox.innerHTML = `
      <div class="val" data-calc="${step.key}">${val} <span class="unit">${step.unit}</span></div>
      <div style="font-size:0.75rem;color:var(--muted);margin-top:0.3rem;">Tap to inspect or override</div>
    `;
    valBox.onclick = () => toggleInspector(step.key, card);
    card.appendChild(valBox);
    const missing = buildDependencyLinks(step, true);
    if (missing) card.appendChild(missing);
  }
  const navRow = document.createElement("div");
  navRow.className = "wizard-nav";
  if (stepIndex > 0) {
    const backBtn = document.createElement("button");
    backBtn.className = "btn-secondary";
    backBtn.textContent = "← Back";
    backBtn.onclick = () => { Nav.stepIndex = stepIndex - 1; renderScreen(); };
    navRow.appendChild(backBtn);
  }
  if (stepIndex < steps.length - 1) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "btn-primary";
    nextBtn.textContent = "Next Step →";
    nextBtn.onclick = () => { Nav.stepIndex = stepIndex + 1; renderScreen(); };
    navRow.appendChild(nextBtn);
  }
  card.appendChild(navRow);
  container.appendChild(card);
}

function buildStepControl(step, record) {
  const wrap = document.createElement("div");
  wrap.className = "step-control";
  if (step.type === "input") {
    const home = getStepHome(step) || record;
    const val = (home[step.key] !== null && home[step.key] !== undefined) ? home[step.key] : "";
    wrap.innerHTML = `<input type="number" inputmode="decimal" step="${step.step || 'any'}" value="${val}"
                             onchange="handleScaleInput('${step.key}', this.value)">`;
  } else if (step.type === "datetime") {
    const val = record[step.key] || "";
    const hint = step.autoKey ? (record[step.autoKey] ? (step.autoHint || "automatic") : (step.manualHint || "entered by technician")) : "";
    wrap.innerHTML = `
      <input type="datetime-local" value="${val}" onchange="handleDatetimeInput('${step.key}', this.value)">
      <div class="src-hint">${hint ? "Source: " + hint : ""}</div>`;
  } else if (step.type === "choice" && SourceResolvers[step.resolver]) {
    const view = SourceResolvers[step.resolver].view(getActiveContext());
    let html = "";
    if (view.options.length) {
      html += `<select class="step-select" onchange="handleChoiceInput('${step.key}', this.value)">` +
        view.options.map(o => `<option value="${o.value}" ${o.selected ? "selected" : ""} ${o.disabled ? "disabled" : ""}>${o.label}</option>`).join("") +
        `</select>`;
    }
    html += view.lines.map(l => `<div class="src-line ${l.tone ? "src-" + l.tone : ""}">${l.text}</div>`).join("");
    wrap.innerHTML = html;
  }
  return wrap;
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