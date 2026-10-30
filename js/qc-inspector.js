// @ts-nocheck
// The inspector: the drawer that opens on a calculated value to show where it comes from and let the
// person override it. It only draws and reacts. The dependency graph comes from qc-calculations.js
// (directDependencies, buildDependencyTrace, dependencyLabel) and getting around from qc-navigation.js
// (jumpToStep, followDependencyRoute).
function handleScaleInput(fieldKey, rawValue) {
  const ctx = getActiveContext();
  if (!ctx.record) return;
  const step = findStep(fieldKey);
  const home = getStepHome(step) || ctx.record;
  home[fieldKey] = rawValue === "" ? null : parseFloat(rawValue);
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  updateCalculatedDisplays();
  saveToStorage();
  if (step && step.rerender) renderScreen();
}

function handleDatetimeInput(fieldKey, rawValue) {
  const ctx = getActiveContext();
  const step = findStep(fieldKey);
  if (!ctx.record || !step) return;
  const record = ctx.record;
  if (rawValue) {
    record[fieldKey] = rawValue;
    if (step.autoKey) record[step.autoKey] = false;
  } else if (step.autoValueKey) {
    record[fieldKey] = record[step.autoValueKey];
    if (step.autoKey) record[step.autoKey] = true;
  } else {
    record[fieldKey] = null;
  }
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  saveToStorage();
  renderScreen();
}

function handleChoiceInput(fieldKey, value) {
  const step = findStep(fieldKey);
  if (!step || !SourceResolvers[step.resolver]) return;
  const ctx = getActiveContext();
  SourceResolvers[step.resolver].apply(ctx, value);
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  saveToStorage();
  renderScreen();
}

// Swapping a source/calibration is a Door 1 input: updates link and propagates downstream
function handleSourceSwap(fieldKey, value) {
  const step = findStep(fieldKey);
  if (!step || !step.fetch || !SourceResolvers[step.fetch]) return;
  const ctx = getActiveContext();
  SourceResolvers[step.fetch].apply(ctx, value);
  propagateChange(Nav.activeTestType, ctx, fieldKey);
  updateCalculatedDisplays();
  saveToStorage();
  renderScreen();
  reopenInspector(fieldKey);
}

function updateCalculatedDisplays() {
  const record = getActiveRecord();
  if (!record) return;
  const test = TestDefinitions[Nav.activeTestType];
  const sequence = test ? test.sequence : [];
  document.querySelectorAll("[data-calc]").forEach(el => {
    const fieldKey = el.getAttribute("data-calc");
    const fieldObj = record[fieldKey];
    if (!fieldObj) return;
    const step = sequence.find(item => item.key === fieldKey);
    const decimals = step && step.decimals !== undefined ? step.decimals : 3;
    el.textContent = formatValue(fieldObj, decimals);
    el.style.color = fieldObj.isManual ? "var(--warning)" : "var(--success)";
  });
}

// Open the inspector on a calculated value that is drawn on screen (a screen redraw closes it).
function reopenInspector(outputKey) {
  const { calc } = findStepElements(outputKey);
  const card = calc && (calc.closest(".speed-card") || calc.closest(".card"));
  if (card) toggleInspector(outputKey, card);
}

// A dependency was tapped: go to where that value lives (it may be in another test) and show it.
function goToDependency(route, type, key) {
  if (!followDependencyRoute(route, type)) {
    alert("There is no saved record to open for this value yet.");
    return;
  }
  const step = findStep(key);
  const found = jumpToStep(key);
  if (found && step && step.type === "computed") reopenInspector(key);
}

function renderInspectorFullTrace(drawer, outputKey, type) {
  const details = document.createElement("details");
  details.className = "inspector-full-trace";
  const summary = document.createElement("summary");
  summary.textContent = "Full dependency trace";
  details.appendChild(summary);

  const trace = buildDependencyTrace(type, outputKey);
  if (!trace.root || !trace.root.dependencies.length) {
    const empty = document.createElement("div");
    empty.className = "dependency-detail";
    empty.textContent = "No declared dependency chain.";
    details.appendChild(empty);
    drawer.appendChild(details);
    return;
  }

  const body = document.createElement("div");
  body.className = "trace-body";
  trace.nodes.filter(node => node.dependencies.length)
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
    .forEach(node => {
      const group = document.createElement("div");
      group.className = "trace-group";
      const level = document.createElement("div");
      level.className = "trace-level";
      level.textContent = "Calculation level " + node.depth;
      group.appendChild(level);

      const inputs = document.createElement("div");
      inputs.className = "trace-inputs";
      node.dependencies.forEach((dep, index) => {
        if (index) {
          const separator = document.createElement("span");
          separator.className = "trace-sep";
          separator.textContent = "+";
          inputs.appendChild(separator);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-secondary trace-chip";
        button.textContent = dependencyLabel(dep.type, dep.key);
        button.title = dep.relations.join("; ");
        button.onclick = () => goToDependency(dep.node.route, dep.type, dep.key);
        inputs.appendChild(button);
      });
      group.appendChild(inputs);

      const arrow = document.createElement("div");
      arrow.className = "trace-arrow";
      arrow.textContent = "↓";
      group.appendChild(arrow);

      const output = document.createElement("div");
      output.className = "trace-output";
      output.textContent = dependencyLabel(node.type, node.key);
      group.appendChild(output);
      body.appendChild(group);
    });

  const final = document.createElement("div");
  final.className = "trace-final";
  final.textContent = "Inspected value: " + dependencyLabel(type, outputKey);
  body.appendChild(final);
  details.appendChild(body);
  drawer.appendChild(details);
}

function toggleInspector(outputKey, cardEl) {
  const existingDrawer = cardEl.querySelector(".dependency-box");
  if (existingDrawer) {
    existingDrawer.remove();
    return;
  }
  const record = getActiveRecord();
  const fieldObj = record && record[outputKey];
  if (!fieldObj) return;

  const type = Nav.activeTestType;
  const step = stepOf(type, outputKey);
  const isManual = fieldObj.isManual;
  const currentVal = fieldObj.manual !== null ? fieldObj.manual : "";

  const drawer = document.createElement("div");
  drawer.className = "dependency-box";
  drawer.innerHTML =
    '<div class="dependency-title">🔍 Inspect: ' + escapeHtml(outputKey) + '</div>' +
    '<div class="dependency-detail">Status: <strong>' +
      (isManual ? "🟡 Manual Override Active" : "🟢 Auto Calculated") + '</strong></div>' +
    '<div class="dependency-detail"><strong>Direct dependencies</strong></div>' +
    '<div class="dependency-direct-list"></div>' +
    '<div class="dependency-source"></div>' +
    '<div class="dependency-section">' +
      '<label class="override-label">Manual Override Value:</label>' +
      '<input type="number" class="override-input" step="any" placeholder="Type override number...">' +
      '<button class="btn-action override-btn' + (isManual ? ' is-manual' : '') + '">' +
        (isManual ? "Switch Back to Auto Value" : "Turn ON Manual Override") +
      '</button></div>';

  const overrideInput = drawer.querySelector('input[type="number"]');
  overrideInput.value = currentVal;
  overrideInput.onchange = () => setManualOverride(outputKey, overrideInput.value);
  drawer.querySelector(".btn-action").onclick = () => toggleOverrideSwitch(outputKey);

  if (step && step.fetch && SourceResolvers[step.fetch]) {
    const view = SourceResolvers[step.fetch].view(getActiveContext());
    const source = drawer.querySelector(".dependency-source");
    if ((view.options && view.options.length) || (view.lines && view.lines.length)) {
      source.classList.add("dependency-section");
      if (view.options && view.options.length) {
        const label = document.createElement("label");
        label.className = "dependency-source-label";
        label.textContent = "🔗 Attached Calibration / Source:";
        source.appendChild(label);
        const select = document.createElement("select");
        select.className = "step-select";
        view.options.forEach(option => {
          const item = document.createElement("option");
          item.value = option.value;
          item.textContent = option.label;
          item.selected = option.selected;
          select.appendChild(item);
        });
        select.onchange = () => handleSourceSwap(outputKey, select.value);
        source.appendChild(select);
      }
      (view.lines || []).forEach(line => {
        const div = document.createElement("div");
        div.className = "src-line" + (line.tone ? " src-" + line.tone : "");
        div.textContent = line.text;
        source.appendChild(div);
      });
    }
  }

  const dependencyList = drawer.querySelector(".dependency-direct-list");
  directDependencies(type, outputKey).forEach(dep => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-secondary dependency-direct-btn";
    button.textContent = dependencyLabel(dep.type, dep.key);
    button.title = dep.relations.join("; ");
    button.onclick = () => goToDependency([
      { fromType: type, fromKey: outputKey, toType: dep.type, toKey: dep.key }
    ], dep.type, dep.key);
    dependencyList.appendChild(button);
  });
  if (!dependencyList.children.length) dependencyList.textContent = "No declared dependencies.";

  renderInspectorFullTrace(drawer, outputKey, type);
  cardEl.appendChild(drawer);
}

function setManualOverride(outputKey, rawValue) {
  const record = getActiveRecord();
  const fieldObj = record[outputKey];
  if (!fieldObj) return;
  const typed = rawValue === "" ? null : parseFloat(rawValue);
  fieldObj.manual = (typed === null || isNaN(typed)) ? null : typed;
  fieldObj.isManual = fieldObj.manual !== null;
  propagateChange(Nav.activeTestType, getActiveContext(), outputKey);
  updateCalculatedDisplays();
  saveToStorage();
  renderScreen();
  reopenInspector(outputKey);
}

function toggleOverrideSwitch(outputKey) {
  const record = getActiveRecord();
  const fieldObj = record[outputKey];
  if (!fieldObj) return;
  if (fieldObj.manual !== null) {
    fieldObj.isManual = !fieldObj.isManual;
  }
  propagateChange(Nav.activeTestType, getActiveContext(), outputKey);
  updateCalculatedDisplays();
  saveToStorage();
  renderScreen();
  reopenInspector(outputKey);
}
